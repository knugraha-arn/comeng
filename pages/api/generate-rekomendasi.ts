import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // 1. Ambil data semua Ranger aktif
    const { data: rangers } = await supabase
      .from('rangers')
      .select('id, full_name, display_name, wags(id, name), weekly_metrics(week_key, active_days, total_messages, participation_rate, status)')
      .eq('status', 'active')

    if (!rangers || rangers.length === 0) {
      return res.status(400).json({ error: 'Belum ada data Ranger' })
    }

    const summaries = []

    for (const r of rangers) {
      const ranger = r as unknown as {
        id: string
        full_name: string
        display_name: string
        wags: { id: string; name: string }
        weekly_metrics: { week_key: string; active_days: number; total_messages: number; participation_rate: number; status: string }[]
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

      const sortedMetrics = [...(ranger.weekly_metrics || [])].sort((a, b) => a.week_key.localeCompare(b.week_key))

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

    // 2. Baca prompt template dari file
    const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'rekomendasi.txt')
    const template = fs.readFileSync(promptPath, 'utf-8')

    // 3. Inject data ke template
    const data = summaries.map(r => `
Ranger: ${r.full_name} (${r.display_name})
WAG: ${r.wag_name}
Total agen: ${r.total_members}
Agen belum disambut: ${r.ungreeted_count}
Agen dormant (>14 hari tidak aktif): ${r.dormant_count}
Top 3 agen paling aktif: ${r.top_members.map(m => `${m.display_name} (${m.total} pesan)`).join(', ') || 'tidak ada data'}
Tren aktivitas minggu ke minggu:
${r.metrics.map(m => `  ${m.week_key}: ${m.total_messages} pesan Ranger, ${m.active_days} hari aktif, participation ${m.participation_rate}%, status: ${m.status}`).join('\n')}
`).join('\n---\n')

    const prompt = template.replace('{{DATA}}', data)

    // 4. Panggil Claude API
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
     headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text || ''
    const recommendations = JSON.parse(text.replace(/```json|```/g, '').trim())

    return res.status(200).json({ recommendations, summaries_count: summaries.length })

  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
