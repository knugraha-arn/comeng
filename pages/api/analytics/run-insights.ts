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

// Priority Score = Impact × Urgency × Reachability (masing-masing 0-10)
function priorityScore(impact: number, urgency: number, reachability: number): number {
  return Math.round(impact * urgency * reachability * 100) / 100
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { date } = req.body as { date?: string }
  if (!date) return res.status(400).json({ error: 'date wajib diisi' })

  try {
    const insights: Record<string, unknown>[] = []

    // ── Ambil data 14 hari untuk baseline ────────────────────────────────────
    const since = new Date(date)
    since.setDate(since.getDate() - 13)
    const sinceStr = since.toISOString().split('T')[0]

    // ── 1. DORMANCY RISK ─────────────────────────────────────────────────────
    // Agen yang aktif di 7 hari lalu tapi tidak aktif 3 hari terakhir
    const { data: agentMetrics } = await supabase
      .from('am_agent_daily_metrics')
      .select('*')
      .gte('metric_date', sinceStr)
      .lte('metric_date', date)
      .order('metric_date', { ascending: true })

    if (agentMetrics && agentMetrics.length > 0) {
      // Group by agent
      const agentHistory: Record<string, typeof agentMetrics> = {}
      for (const m of agentMetrics) {
        const key = `${m.terminal_id}__${m.serial_number}`
        if (!agentHistory[key]) agentHistory[key] = []
        agentHistory[key].push(m)
      }

      const threeDaysAgo = new Date(date)
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 2)
      const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0]

      for (const [key, history] of Object.entries(agentHistory)) {
        // Cek: aktif di 7 hari pertama tapi tidak aktif 3 hari terakhir
        const earlyHistory = history.filter(h => h.metric_date < threeDaysAgoStr)
        const recentHistory = history.filter(h => h.metric_date >= threeDaysAgoStr)

        const wasActive = earlyHistory.some(h => h.is_active)
        const isCurrentlyInactive = recentHistory.length > 0 && recentHistory.every(h => !h.is_active)

        if (wasActive && isCurrentlyInactive) {
          const latest = history[history.length - 1]
          const avgFee = earlyHistory.reduce((s, h) => s + (h.total_fee ?? 0), 0) / Math.max(earlyHistory.length, 1)

          // Semakin besar avg fee, semakin tinggi impact
          const impactScore    = Math.min(10, avgFee / 5000)
          const urgencyScore   = 8   // dormancy selalu urgent
          const reachScore     = 6   // agen bisa dihubungi via PIC

          insights.push({
            insight_date:       date,
            category:           'dormancy_risk',
            entity_type:        'agent',
            entity_id:          key,
            entity_name:        latest.nama_merchant ?? key,
            priority_score:     priorityScore(impactScore, urgencyScore, reachScore),
            impact_score:       Math.round(impactScore * 100) / 100,
            urgency_score:      urgencyScore,
            reachability_score: reachScore,
            summary:            `Tidak aktif ${recentHistory.length} hari terakhir. Rata-rata fee harian sebelumnya Rp ${Math.round(avgFee).toLocaleString('id')}.`,
            data_snapshot: {
              mitra:          latest.nama_sub_ca,
              pic:            latest.pic,
              kota:           latest.kota,
              days_inactive:  recentHistory.length,
              avg_daily_fee:  Math.round(avgFee),
            },
          })
        }
      }
    }

    // ── 2. HIDDEN GEM AGENT ──────────────────────────────────────────────────
    // Agen dengan growth fee signifikan tapi bukan top performer
    if (agentMetrics && agentMetrics.length > 0) {
      const agentHistory: Record<string, typeof agentMetrics> = {}
      for (const m of agentMetrics) {
        const key = `${m.terminal_id}__${m.serial_number}`
        if (!agentHistory[key]) agentHistory[key] = []
        agentHistory[key].push(m)
      }

      // Hitung total fee semua agen untuk threshold top 20%
      const agentTotalFees = Object.entries(agentHistory).map(([key, history]) => ({
        key,
        totalFee: history.reduce((s, h) => s + (h.total_fee ?? 0), 0),
        avgFee: history.reduce((s, h) => s + (h.total_fee ?? 0), 0) / history.length,
      })).sort((a, b) => b.totalFee - a.totalFee)

      const top20pctThreshold = agentTotalFees[Math.floor(agentTotalFees.length * 0.2)]?.totalFee ?? 0

      for (const [key, history] of Object.entries(agentHistory)) {
        if (history.length < 3) continue  // butuh minimal 7 hari data

        const mid = Math.floor(history.length / 2)
        const firstHalf = history.slice(0, mid)
        const secondHalf = history.slice(mid)

        const avgFirst  = firstHalf.reduce((s, h) => s + (h.total_fee ?? 0), 0) / Math.max(firstHalf.length, 1)
        const avgSecond = secondHalf.reduce((s, h) => s + (h.total_fee ?? 0), 0) / Math.max(secondHalf.length, 1)
        const totalFee  = history.reduce((s, h) => s + (h.total_fee ?? 0), 0)

        // Growth > 50% dan bukan top 20%
        const growth = avgFirst > 0 ? (avgSecond - avgFirst) / avgFirst : 0
        const isNotTopPerformer = totalFee < top20pctThreshold

        if (growth > 0.5 && isNotTopPerformer) {
          const latest = history[history.length - 1]

          const impactScore    = Math.min(10, growth * 5)
          const urgencyScore   = 5
          const reachScore     = 7

          insights.push({
            insight_date:       date,
            category:           'hidden_gem_agent',
            entity_type:        'agent',
            entity_id:          key,
            entity_name:        latest.nama_merchant ?? key,
            priority_score:     priorityScore(impactScore, urgencyScore, reachScore),
            impact_score:       Math.round(impactScore * 100) / 100,
            urgency_score:      urgencyScore,
            reachability_score: reachScore,
            summary:            `Growth ${Math.round(growth * 100)}% dalam 7 hari terakhir. Fee rata-rata naik dari Rp ${Math.round(avgFirst).toLocaleString('id')} ke Rp ${Math.round(avgSecond).toLocaleString('id')}/hari.`,
            data_snapshot: {
              mitra:       latest.nama_sub_ca,
              pic:         latest.pic,
              kota:        latest.kota,
              growth_pct:  Math.round(growth * 100),
              avg_fee_before: Math.round(avgFirst),
              avg_fee_after:  Math.round(avgSecond),
            },
          })
        }
      }
    }

    // ── 3. MITRA RISK ────────────────────────────────────────────────────────
    // Mitra dengan penurunan active agent ratio atau fee signifikan
    const { data: mitraMetrics } = await supabase
      .from('am_mitra_daily_metrics')
      .select('*')
      .gte('metric_date', sinceStr)
      .lte('metric_date', date)
      .order('metric_date', { ascending: true })

    if (mitraMetrics && mitraMetrics.length > 0) {
      const mitraHistory: Record<string, typeof mitraMetrics> = {}
      for (const m of mitraMetrics) {
        if (!m.kode_sub_ca) continue
        if (!mitraHistory[m.kode_sub_ca]) mitraHistory[m.kode_sub_ca] = []
        mitraHistory[m.kode_sub_ca].push(m)
      }

      for (const [kode, history] of Object.entries(mitraHistory)) {
        if (history.length < 3) continue

        const mid = Math.floor(history.length / 2)
        const firstHalf  = history.slice(0, mid)
        const secondHalf = history.slice(mid)

        const avgFeeFirst  = firstHalf.reduce((s, h) => s + (h.total_fee ?? 0), 0) / Math.max(firstHalf.length, 1)
        const avgFeeSecond = secondHalf.reduce((s, h) => s + (h.total_fee ?? 0), 0) / Math.max(secondHalf.length, 1)
        const feeDecline   = avgFeeFirst > 0 ? (avgFeeFirst - avgFeeSecond) / avgFeeFirst : 0

        const latest       = history[history.length - 1]
        const activeRatio  = latest.total_agents > 0 ? latest.active_agents / latest.total_agents : 0

        // Risk: fee turun > 20% ATAU active ratio < 40%
        if (feeDecline > 0.2 || activeRatio < 0.4) {
          const impactScore    = Math.min(10, latest.total_agents / 50)  // lebih banyak agen = lebih besar impact
          const urgencyScore   = feeDecline > 0.3 ? 8 : 6
          const reachScore     = 8  // mitra lebih mudah diintervens

          const reasons: string[] = []
          if (feeDecline > 0.2) reasons.push(`fee turun ${Math.round(feeDecline * 100)}%`)
          if (activeRatio < 0.4) reasons.push(`hanya ${Math.round(activeRatio * 100)}% agen aktif`)

          insights.push({
            insight_date:       date,
            category:           'mitra_risk',
            entity_type:        'mitra',
            entity_id:          kode,
            entity_name:        latest.nama_sub_ca ?? kode,
            priority_score:     priorityScore(impactScore, urgencyScore, reachScore),
            impact_score:       Math.round(impactScore * 100) / 100,
            urgency_score:      urgencyScore,
            reachability_score: reachScore,
            summary:            `${reasons.join(', ')}. Total ${latest.total_agents} agen, ${latest.active_agents} aktif hari ini.`,
            data_snapshot: {
              total_agents:  latest.total_agents,
              active_agents: latest.active_agents,
              active_ratio:  Math.round(activeRatio * 100),
              fee_decline_pct: Math.round(feeDecline * 100),
              total_fee_today: latest.total_fee,
            },
          })
        }
      }
    }

    // ── 4. PIC RISK ──────────────────────────────────────────────────────────
    const { data: picMetrics } = await supabase
      .from('am_pic_daily_metrics')
      .select('*')
      .gte('metric_date', sinceStr)
      .lte('metric_date', date)
      .order('metric_date', { ascending: true })

    if (picMetrics && picMetrics.length > 0) {
      const picHistory: Record<string, typeof picMetrics> = {}
      for (const m of picMetrics) {
        if (!m.pic) continue
        if (!picHistory[m.pic]) picHistory[m.pic] = []
        picHistory[m.pic].push(m)
      }

      for (const [pic, history] of Object.entries(picHistory)) {
        if (history.length < 3) continue

        const latest      = history[history.length - 1]
        const activeRatio = latest.total_agents > 0 ? latest.active_agents / latest.total_agents : 0

        // PIC dengan active ratio < 30%
        if (activeRatio < 0.3 && latest.total_agents >= 5) {
          const impactScore    = Math.min(10, latest.total_agents / 20)
          const urgencyScore   = 7
          const reachScore     = 9

          insights.push({
            insight_date:       date,
            category:           'pic_risk',
            entity_type:        'pic',
            entity_id:          pic,
            entity_name:        pic,
            priority_score:     priorityScore(impactScore, urgencyScore, reachScore),
            impact_score:       Math.round(impactScore * 100) / 100,
            urgency_score:      urgencyScore,
            reachability_score: reachScore,
            summary:            `Hanya ${Math.round(activeRatio * 100)}% agen aktif (${latest.active_agents} dari ${latest.total_agents}). Perlu investigasi segera.`,
            data_snapshot: {
              total_agents:  latest.total_agents,
              active_agents: latest.active_agents,
              active_ratio:  Math.round(activeRatio * 100),
              total_fee:     latest.total_fee,
            },
          })
        }
      }
    }

    // ── 5. FOCUS TODAY ───────────────────────────────────────────────────────
    // Top 3 entitas berdasarkan kombinasi risiko dan ukuran
    const riskInsights = insights
      .filter(i => ['dormancy_risk', 'pic_risk', 'mitra_risk'].includes(i.category as string))
      .sort((a, b) => (b.priority_score as number) - (a.priority_score as number))
      .slice(0, 3)

    for (const risk of riskInsights) {
      insights.push({
        ...risk,
        insight_date: date,
        category:     'focus_today',
        summary:      `[Prioritas] ${risk.summary}`,
      })
    }

    // ── Upsert semua insights ────────────────────────────────────────────────
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
        dormancy_risk: insights.filter(i => i.category === 'dormancy_risk').length,
        hidden_gem:    insights.filter(i => i.category === 'hidden_gem_agent').length,
        mitra_risk:    insights.filter(i => i.category === 'mitra_risk').length,
        pic_risk:      insights.filter(i => i.category === 'pic_risk').length,
        focus_today:   insights.filter(i => i.category === 'focus_today').length,
      },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/run-insights]', message)
    return res.status(500).json({ error: 'Run insights gagal', details: message })
  }
}
