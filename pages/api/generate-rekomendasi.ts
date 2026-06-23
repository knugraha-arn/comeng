import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export const config = {
  maxDuration: 30,
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Rekomendasi menggunakan 8 minggu terakhir per WAG.
// Unit analisis adalah WAG (bukan Ranger) karena:
// 1. 1 Ranger bisa kelola beberapa WAG — rekomendasi per-Ranger mengaburkan
//    kondisi spesifik tiap grup.
// 2. Tiap WAG punya dinamika komunitas berbeda — anggota, tingkat keaktifan,
//    pola pesan — yang butuh insight terpisah.
// 3. Ranger tetap disebutkan sebagai konteks ("dikelola oleh X"), bukan unit utama.
const WEEKS_WINDOW = 8

const PROMPT_TEMPLATE = `Kamu adalah sistem analisis komunitas untuk platform AMARIS — alat monitoring efektivitas Ranger dalam membina komunitas agen WhatsApp (WAG).

Konteks bisnis:
- Ranger adalah freelancer yang membina komunitas agen pengguna EDC Mini ATM
- Ranger mendapat fee per transaksi agen — makin aktif agen bertransaksi, makin besar pendapatan Ranger
- Masalah utama: Ranger cenderung fokus akuisisi agen baru, tapi kurang membina agen yang sudah ada
- AMARIS mengukur efektivitas pembinaan dari aktivitas di setiap WAG sebagai leading indicator

Catatan analisis: Data yang diberikan adalah 8 minggu terakhir per WAG. Unit analisis adalah GRUP (WAG), bukan individu Ranger — satu Ranger bisa kelola beberapa grup dengan kondisi yang berbeda-beda.

Data komunitas per WAG:

{{DATA}}

Berdasarkan data di atas, berikan rekomendasi coaching yang spesifik dan actionable untuk SETIAP WAG.
Rekomendasi ditujukan kepada Ranger yang mengelola grup tersebut, disesuaikan dengan kondisi spesifik grup itu.

Respond HANYA dengan JSON array berikut. Pastikan JSON valid — tidak ada trailing comma, tidak ada karakter khusus di dalam string. Tanpa penjelasan tambahan, tanpa markdown backticks:
[
  {
    "wag": "nama WAG",
    "ranger": "nama Ranger pengelola",
    "priority": "critical|warning|positive",
    "title": "judul rekomendasi singkat",
    "body": "analisis situasi dalam 2-3 kalimat spesifik berdasarkan data tanpa tanda kutip ganda di dalam teks",
    "actions": ["action item 1", "action item 2", "action item 3"]
  }
]`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Step 1: Fetch WAGs aktif beserta Ranger dan weekly_metrics-nya
    // Pivot dari Rangers ke WAGs sebagai anchor — karena 1 Ranger bisa kelola N WAG,
    // tapi tiap WAG punya tepat 1 Ranger (berdasarkan data aktual sistem).
    const { data: wags, error: wagError } = await supabase
      .from('wags')
      .select(`
        id,
        name,
        rangers!inner(id, full_name, display_name, status),
        weekly_metrics(week_key, active_days, total_messages, participation_rate, status, ranger_id)
      `)
      .eq('status', 'active')
      .eq('rangers.status', 'active')

    if (wagError) throw new Error(`Fetch WAGs error: ${wagError.message}`)
    if (!wags || wags.length === 0) {
      return res.status(400).json({ error: 'Belum ada data WAG aktif dengan Ranger terdaftar' })
    }

    // Step 2: Build summaries per WAG
    const summaries = []

    for (const w of wags) {
      const wag = w as unknown as {
        id: string
        name: string
        rangers: { id: string; full_name: string; display_name: string; status: string }[]
        weekly_metrics: {
          week_key: string
          active_days: number
          total_messages: number
          participation_rate: number
          status: string
          ranger_id: string
        }[]
      }

      // Ambil ranger aktif yang kelola WAG ini (biasanya tepat 1)
      const ranger = Array.isArray(wag.rangers) ? wag.rangers[0] : wag.rangers
      if (!ranger) continue

      // Ambil member dan pesan dari WAG ini
      const [memberRes, msgRes] = await Promise.all([
        supabase.from('members').select('id, last_active_at, greeted_at').eq('wag_id', wag.id),
        supabase.from('messages').select('sender_name').eq('wag_id', wag.id).eq('sender_type', 'member'),
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

      // Ambil hanya WEEKS_WINDOW minggu terakhir, filter by ranger_id WAG ini
      const sortedMetrics = [...(wag.weekly_metrics || [])]
        .filter(m => m.ranger_id === ranger.id)
        .sort((a, b) => a.week_key.localeCompare(b.week_key))
        .slice(-WEEKS_WINDOW)

      summaries.push({
        wag_name: wag.name,
        ranger_name: ranger.full_name,
        ranger_display: ranger.display_name,
        total_members: members.length,
        ungreeted_count: ungretedCount,
        dormant_count: dormantCount,
        top_members: topMembers,
        metrics: sortedMetrics,
        weeks_analyzed: sortedMetrics.length,
      })
    }

    if (summaries.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data WAG yang bisa dianalisis' })
    }

    // Step 3: Build prompt — unit per WAG, Ranger sebagai atribut
    const data = summaries.map(s => `
WAG: ${s.wag_name}
Ranger pengelola: ${s.ranger_name} (${s.ranger_display})
Total anggota: ${s.total_members}
Anggota belum disambut: ${s.ungreeted_count}
Anggota dormant (tidak aktif >14 hari): ${s.dormant_count}
Top 3 anggota paling aktif: ${s.top_members.map(m => `${m.display_name} (${m.total} pesan)`).join(', ') || 'tidak ada data'}
Tren aktivitas Ranger di grup ini (${s.weeks_analyzed} minggu terakhir):
${s.metrics.map(m => `  ${m.week_key}: ${m.total_messages} pesan Ranger, ${m.active_days} hari aktif, participation ${m.participation_rate}%, status: ${m.status}`).join('\n')}
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
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text || ''

    // Step 5: Parse JSON
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error(`Response tidak mengandung JSON valid. Raw: ${text.slice(0, 200)}`)

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
      weeks_analyzed: WEEKS_WINDOW,
      saved: true,
    })

  } catch (err: unknown) {
    console.error('Error:', err instanceof Error ? err.message : err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
