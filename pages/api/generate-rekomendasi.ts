import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export const config = {
  maxDuration: 30,
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROMPT_TEMPLATE = `Kamu adalah sistem analisis komunitas untuk platform AMARIS — alat monitoring efektivitas Ranger dalam membina komunitas agen WhatsApp (WAG).

Konteks bisnis:
- Ranger adalah freelancer yang membina komunitas agen pengguna EDC Mini ATM
- Ranger mendapat fee per transaksi agen — makin aktif agen bertransaksi, makin besar pendapatan Ranger
- Masalah utama: Ranger cenderung fokus akuisisi agen baru, tapi kurang membina agen yang sudah ada
- AMARIS mengukur efektivitas Ranger dari aktivitas di WAG sebagai leading indicator

Data komunitas:

{{DATA}}

Berdasarkan data di atas, berikan rekomendasi coaching yang spesifik dan actionable untuk setiap Ranger.

Respond HANYA dengan JSON array berikut. Pastikan JSON valid — tidak ada trailing comma, tidak ada karakter khusus di dalam string. Tanpa penjelasan tambahan, tanpa markdown backticks:
[
  {
    "ranger": "nama ranger",
    "priority": "critical|warning|positive",
    "title": "judul rekomendasi singkat",
    "body": "analisis situasi dalam 2-3 kalimat spesifik berdasarkan data tanpa tanda kutip ganda di dalam teks",
    "actions": ["action item 1", "action item 2", "action item 3"]
  }
]`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Step 1: Fetch rangers
    const { data: rangers, error: rangerError } = await supabase
      .from('rangers')
      .select('id, full_name, display_name, wags(id, name), weekly_metrics(week_key, active_days, total_messages, participation_rate, status)')
      .eq('status', 'active')

    if (rangerError) throw new Error(`Fetch rangers error: ${rangerError.message}`)
    if (!rangers || rangers.length === 0) {
      return res.status(400).json({ error: 'Belum ada data Ranger' })
    }

    // Step 2: Build summaries
    const summaries = []

    for (const r of rangers) {
      const ranger = r as unknown as {
        id: string
        full_name: string
        display_name: string
        wags: { id: string; name: string }
        weekly_metrics: {
          week_key: string
          active_days: number
          total_messages: number
          participation_rate: number
          status: string
        }[]
      }

      const wagId = ranger.wags?.id
      if (!wagId) continue

      const [memberRes, msgRes] = await Promise.all([
        supabase.from('members').select('id, last_active_at, greeted_at').eq('wag_id', wagId),
        supabase.from('messages').select('sender_name').eq('wag_id', wagId).eq('sender_type', 'member'),
      ])

      const members = memberRes.data || []
      const msgs = msgRes.data || []

      const dormantCount = members.filter(m => {
        if (!m.last_active_at) return true
        return (Date.now() - new Date(m.last_active_at).getTime()) / (1000 * 60 * 60 * 24) > 14
      }).length

      const ungretedCount = members.filter(m => !m.greeted_at).length

      const counts = msgs.reduce((acc: Record<string, number>, m) => {
        acc[m.sender_name] = (acc[m.sender_name] || 0) + 1
        return acc
      }, {})

      const topMembers = Object.entries(counts)
        .map(([display_name, total]) => ({ display_name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)

      const sortedMetrics = [...(ranger.weekly_metrics || [])].sort((a, b) =>
        a.week_key.localeCompare(b.week_key)
      )

      summaries.push({
        full_name: ranger.full_name,
        display_name: ranger.display_name,
        wag_name: ranger.wags?.name,
        total_members: members.length,
        ungreeted_count: ungretedCount,
        dormant_count: dormantCount,
        top_members: topMembers,
        metrics: sortedMetrics,
      })
    }

    // Step 3: Build prompt
    const data = summaries.map(r => `
Ranger: ${r.full_name} (${r.display_name})
WAG: ${r.wag_name}
Total agen: ${r.total_members}
Agen belum disambut: ${r.ungreeted_count}
Agen dormant lebih dari 14 hari tidak aktif: ${r.dormant_count}
Top 3 agen paling aktif: ${r.top_members.map(m => `${m.display_name} (${m.total} pesan)`).join(', ') || 'tidak ada data'}
Tren aktivitas minggu ke minggu:
${r.metrics.map(m => `  ${m.week_key}: ${m.total_messages} pesan Ranger, ${m.active_days} hari aktif, participation ${m.participation_rate}%, status: ${m.status}`).join('\n')}
`).join('\n---\n')

    const prompt = PROMPT_TEMPLATE.replace('{{DATA}}', data)

    // Step 4: Call Claude API
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text || ''

    // Step 5: Parse JSON dengan robust error handling
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error(`Response tidak mengandung JSON. Raw: ${text.slice(0, 200)}`)

    const cleanJson = jsonMatch[0]
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
      .replace(/,(\s*[}\]])/g, '$1')

    let recommendations
    try {
      recommendations = JSON.parse(cleanJson)
    } catch (parseErr) {
      throw new Error(`JSON tidak valid: ${parseErr instanceof Error ? parseErr.message : 'unknown'}. Raw: ${cleanJson.slice(0, 300)}`)
    }

    // Step 6: Simpan ke database
    const weekKey = new Date().toISOString().slice(0, 10)
    const userId = req.headers['x-user-id'] as string | undefined

    await supabase.from('recommendations').insert({
      week_key: weekKey,
      generated_by: userId || null,
      items: recommendations,
    })

    return res.status(200).json({
      recommendations,
      summaries_count: summaries.length,
      saved: true,
    })

  } catch (err: unknown) {
    console.error('Error:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
