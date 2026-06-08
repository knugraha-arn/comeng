import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

function priorityScore(impact: number, urgency: number, reachability: number): number {
  return Math.round(impact * urgency * reachability * 100) / 100
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { date } = req.body as { date?: string }
  if (!date) return res.status(400).json({ error: 'date wajib diisi' })

  try {
    const insights: Record<string, unknown>[] = []

    // Window 14 hari untuk trend analysis
    const since = new Date(date)
    since.setDate(since.getDate() - 13)
    const sinceStr = since.toISOString().split('T')[0]

    // ── 1. Ambil target untuk threshold ─────────────────────────────────────
    const now = new Date(date)
    const { data: targetData } = await supabase
      .from('am_targets')
      .select('mitra_min_active_ratio, pic_min_active_ratio, min_transfer_trx_potential')
      .eq('period_year', now.getFullYear())
      .eq('period_month', now.getMonth() + 1)
      .single()

    const mitraMinRatio   = targetData?.mitra_min_active_ratio ?? 40
    const picMinRatio     = targetData?.pic_min_active_ratio ?? 30
    const minTrxPotential = targetData?.min_transfer_trx_potential ?? 5

    // ── 2. POTENTIAL AGENTS (Hidden Gem) per PIC ─────────────────────────────
    // Agen dengan bucket 'potential' di tanggal ini, group by PIC
    const { data: potentialAgents } = await supabase
      .from('am_agent_daily_metrics')
      .select('pic, mitra, serial_number, avg_transfer_per_active_day, active_days_14, total_fee')
      .eq('metric_date', date)
      .eq('bucket', 'potential')
      .not('pic', 'is', null)

    if (potentialAgents && potentialAgents.length > 0) {
      // Group by PIC
      const picPotential: Record<string, {
        pic: string
        mitra: string | null
        agents: typeof potentialAgents
        totalPotentialFee: number
      }> = {}

      for (const agent of potentialAgents) {
        if (!agent.pic) continue
        if (!picPotential[agent.pic]) {
          picPotential[agent.pic] = { pic: agent.pic, mitra: agent.mitra, agents: [], totalPotentialFee: 0 }
        }
        picPotential[agent.pic].agents.push(agent)
        // Estimasi potensi fee tambahan: avg_transfer × 7 hari tambahan × Rp 2.500
        const avgTrx = Number(agent.avg_transfer_per_active_day) || 0
        picPotential[agent.pic].totalPotentialFee += avgTrx * 7 * 2500
      }

      // Sort by jumlah agen potential terbanyak
      const sortedPics = Object.values(picPotential)
        .sort((a, b) => b.agents.length - a.agents.length)
        .slice(0, 10) // top 10 PIC

      for (const p of sortedPics) {
        const agentCount   = p.agents.length
        const avgTrxPerDay = p.agents.reduce((s, a) => s + (Number(a.avg_transfer_per_active_day) || 0), 0) / agentCount
        const potFee       = Math.round(p.totalPotentialFee)

        const impactScore    = Math.min(10, agentCount / 3)
        const urgencyScore   = 6
        const reachScore     = 9

        insights.push({
          insight_date:       date,
          category:           'potential_agent',
          entity_type:        'pic',
          entity_id:          p.pic,
          entity_name:        p.pic,
          priority_score:     priorityScore(impactScore, urgencyScore, reachScore),
          summary:            `${agentCount} agen Potential. Rata-rata ${avgTrxPerDay.toFixed(1)} trx/hari aktif tapi tidak konsisten. Potensi tambahan fee Rp ${potFee.toLocaleString('id')}/bulan.`,
          data_snapshot: {
            mitra:           p.mitra,
            agent_count:     agentCount,
            avg_trx_per_day: Math.round(avgTrxPerDay * 10) / 10,
            potential_fee:   potFee,
          },
        })
      }
    }

    // ── 3. AT RISK per PIC ───────────────────────────────────────────────────
    const { data: atRiskAgents } = await supabase
      .from('am_agent_daily_metrics')
      .select('pic, mitra, serial_number, active_days_14, total_fee')
      .eq('metric_date', date)
      .eq('bucket', 'at_risk')
      .not('pic', 'is', null)

    if (atRiskAgents && atRiskAgents.length > 0) {
      const picAtRisk: Record<string, { pic: string, mitra: string | null, count: number, totalFee: number }> = {}
      for (const agent of atRiskAgents) {
        if (!agent.pic) continue
        if (!picAtRisk[agent.pic]) picAtRisk[agent.pic] = { pic: agent.pic, mitra: agent.mitra, count: 0, totalFee: 0 }
        picAtRisk[agent.pic].count++
        picAtRisk[agent.pic].totalFee += Number(agent.total_fee) || 0
      }

      const sortedAtRisk = Object.values(picAtRisk)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      for (const p of sortedAtRisk) {
        if (p.count < 3) continue // minimum 3 agen at risk baru jadi insight

        const impactScore    = Math.min(10, p.count / 5)
        const urgencyScore   = 8
        const reachScore     = 9

        insights.push({
          insight_date:       date,
          category:           'at_risk_agent',
          entity_type:        'pic',
          entity_id:          `at_risk_${p.pic}`,
          entity_name:        p.pic,
          priority_score:     priorityScore(impactScore, urgencyScore, reachScore),
          summary:            `${p.count} agen At Risk — jarang aktif dan volume rendah. Perlu intervensi segera sebelum dormant.`,
          data_snapshot: {
            mitra:       p.mitra,
            agent_count: p.count,
            total_fee:   p.totalFee,
          },
        })
      }
    }

    // ── 4. MITRA RISK ────────────────────────────────────────────────────────
    const { data: mitraMetrics } = await supabase
      .from('am_mitra_daily_metrics')
      .select('*')
      .eq('metric_date', date)

    if (mitraMetrics) {
      for (const m of mitraMetrics) {
        const total     = m.total_agents_14 ?? 0
        const active    = m.active_agents ?? 0
        const activeRatio = total > 0 ? (active / total) * 100 : 0

        if (activeRatio < mitraMinRatio && total >= 10) {
          const impactScore    = Math.min(10, total / 100)
          const urgencyScore   = activeRatio < 20 ? 9 : 7
          const reachScore     = 8

          // Trend: bandingkan dengan hari sebelumnya
          const { data: prevDay } = await supabase
            .from('am_mitra_daily_metrics')
            .select('active_agents')
            .eq('mitra', m.mitra)
            .lt('metric_date', date)
            .order('metric_date', { ascending: false })
            .limit(1)
            .single()

          const prevActive = prevDay?.active_agents ?? active
          const trend = active - prevActive

          insights.push({
            insight_date:       date,
            category:           'mitra_risk',
            entity_type:        'mitra',
            entity_id:          m.mitra,
            entity_name:        m.mitra,
            priority_score:     priorityScore(impactScore, urgencyScore, reachScore),
            summary:            `Hanya ${Math.round(activeRatio)}% agen aktif (${active} dari ${total}). ${trend < 0 ? `Turun ${Math.abs(trend)} dari kemarin.` : trend > 0 ? `Naik ${trend} dari kemarin.` : 'Sama dengan kemarin.'}`,
            data_snapshot: {
              total_agents:    total,
              active_agents:   active,
              active_ratio:    Math.round(activeRatio),
              potential_count: m.potential_count,
              growing_count:   m.growing_count,
              at_risk_count:   m.at_risk_count,
              trend,
            },
          })
        }
      }
    }

    // ── 5. PIC RISK ──────────────────────────────────────────────────────────
    const { data: picMetrics } = await supabase
      .from('am_pic_daily_metrics')
      .select('*')
      .eq('metric_date', date)

    if (picMetrics) {
      for (const p of picMetrics) {
        const total      = p.total_agents_14 ?? 0
        const active     = p.active_agents ?? 0
        const activeRatio = total > 0 ? (active / total) * 100 : 0

        if (activeRatio < picMinRatio && total >= 5) {
          const impactScore    = Math.min(10, total / 30)
          const urgencyScore   = 7
          const reachScore     = 9

          insights.push({
            insight_date:       date,
            category:           'pic_risk',
            entity_type:        'pic',
            entity_id:          `risk_${p.pic}`,
            entity_name:        p.pic,
            priority_score:     priorityScore(impactScore, urgencyScore, reachScore),
            summary:            `Hanya ${Math.round(activeRatio)}% agen aktif (${active} dari ${total}). ${p.at_risk_count} agen At Risk, ${p.potential_count} agen Potential belum dioptimalkan.`,
            data_snapshot: {
              mitra:           p.mitra,
              total_agents:    total,
              active_agents:   active,
              active_ratio:    Math.round(activeRatio),
              potential_count: p.potential_count,
              growing_count:   p.growing_count,
              at_risk_count:   p.at_risk_count,
            },
          })
        }
      }
    }

    // ── 6. FOCUS TODAY ───────────────────────────────────────────────────────
    // Top 3 dari semua insights berdasarkan priority score
    const topInsights = [...insights]
      .sort((a, b) => (b.priority_score as number) - (a.priority_score as number))
      .slice(0, 3)

    for (const ins of topInsights) {
      insights.push({
        ...ins,
        insight_date: date,
        category:     'focus_today',
        entity_id:    `focus_${ins.entity_id}`,
        summary:      `[Prioritas] ${ins.summary}`,
      })
    }

    // ── Upsert insights ──────────────────────────────────────────────────────
    if (insights.length > 0) {
      for (const batch of chunk(insights, 100)) {
        const { error } = await supabase
          .from('am_insights')
          .upsert(batch, { onConflict: 'insight_date,category,entity_id' })
        if (error) throw new Error(`Insights upsert failed: ${error.message}`)
      }
    }

    return res.status(200).json({
      success: true,
      date,
      insights_generated: insights.length,
      breakdown: {
        potential_agent: insights.filter(i => i.category === 'potential_agent').length,
        at_risk_agent:   insights.filter(i => i.category === 'at_risk_agent').length,
        mitra_risk:      insights.filter(i => i.category === 'mitra_risk').length,
        pic_risk:        insights.filter(i => i.category === 'pic_risk').length,
        focus_today:     insights.filter(i => i.category === 'focus_today').length,
      },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/run-insights]', message)
    return res.status(500).json({ error: 'Run insights gagal', details: message })
  }
}
