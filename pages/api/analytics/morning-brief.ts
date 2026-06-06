import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth check
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { date } = req.body as { date?: string }
  if (!date) return res.status(400).json({ error: 'date wajib diisi' })

  try {
    // ── 1. Ambil top insights untuk tanggal ini ──────────────────────────────
    const { data: insights, error: insightError } = await supabase
      .from('am_insights')
      .select('*')
      .eq('insight_date', date)
      .order('priority_score', { ascending: false })
      .limit(30)

    if (insightError) throw new Error(insightError.message)

    // Jika belum ada insights, jalankan insight engine dulu
    if (!insights || insights.length === 0) {
      // Trigger run-insights
      const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
      await fetch(`${baseUrl}/api/analytics/run-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date }),
      })

      // Re-fetch setelah run
      const { data: freshInsights } = await supabase
        .from('am_insights')
        .select('*')
        .eq('insight_date', date)
        .order('priority_score', { ascending: false })
        .limit(30)

      if (!freshInsights || freshInsights.length === 0) {
        return res.status(200).json({ error: 'Tidak ada insight tersedia untuk tanggal ini' })
      }

      return await generateAndSave(freshInsights, date, user.id, res)
    }

    return await generateAndSave(insights, date, user.id, res)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/morning-brief]', message)
    return res.status(500).json({ error: 'Generate brief gagal', details: message })
  }
}

async function generateAndSave(
  insights: Record<string, unknown>[],
  date: string,
  userId: string,
  res: NextApiResponse
) {
  // Kategorisasi insights
  const risks = insights
    .filter(i => ['dormancy_risk', 'pic_risk', 'mitra_risk', 'concentration_risk'].includes(i.category as string))
    .slice(0, 3)

  const opportunities = insights
    .filter(i => ['hidden_gem_agent', 'hidden_gem_pic', 'hidden_gem_mitra', 'emerging_territory'].includes(i.category as string))
    .slice(0, 3)

  const watchlist = insights
    .filter(i => ['focus_today'].includes(i.category as string))
    .slice(0, 3)

  // ── 2. Generate narrative via GPT-5 mini ─────────────────────────────────
  const prompt = `Kamu adalah AMARIS, AI Business Analyst untuk jaringan agen EDC Mini ATM.

Tanggal: ${date}

Data insight hari ini:

RISIKO (${risks.length}):
${risks.map(r => `- [${r.category}] ${r.entity_name}: ${r.summary}`).join('\n') || 'Tidak ada risiko terdeteksi'}

PELUANG (${opportunities.length}):
${opportunities.map(o => `- [${o.category}] ${o.entity_name}: ${o.summary}`).join('\n') || 'Tidak ada peluang terdeteksi'}

WATCHLIST (${watchlist.length}):
${watchlist.map(w => `- [${w.category}] ${w.entity_name}: ${w.summary}`).join('\n') || 'Tidak ada watchlist'}

Tulis briefing eksekutif dalam 3-4 kalimat dalam Bahasa Indonesia. Ringkas, jelas, dan berorientasi tindakan. Langsung ke poin, tanpa sapaan.`

  let narrative: string | null = null

  try {
    const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (llmRes.ok) {
      const llmData = await llmRes.json()
      narrative = llmData.choices?.[0]?.message?.content?.trim() ?? null
    }
  } catch {
    // LLM gagal — brief tetap disimpan tanpa narrative
  }

  // ── 3. Simpan morning brief ───────────────────────────────────────────────
  const { error: saveError } = await supabase
    .from('am_morning_brief')
    .upsert({
      brief_date:    date,
      generated_by:  userId,
      top_risks:     risks,
      top_opportunities: opportunities,
      top_watchlist: watchlist,
      narrative,
      model_used:    'gpt-4o-mini',
      generated_at:  new Date().toISOString(),
    }, { onConflict: 'brief_date' })

  if (saveError) throw new Error(saveError.message)

  return res.status(200).json({
    success: true,
    date,
    risks_count:         risks.length,
    opportunities_count: opportunities.length,
    watchlist_count:     watchlist.length,
    has_narrative:       !!narrative,
  })
}
