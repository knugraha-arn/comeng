import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export const config = { api: { bodyParser: true } }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { date } = req.body as { date?: string }
  if (!date) return res.status(400).json({ error: 'date wajib diisi (YYYY-MM-DD)' })

  try {
    // ── 1. Ambil semua transaksi untuk tanggal ini ───────────────────────────
    const { data: transactions, error: txError } = await supabase
      .from('am_transactions')
      .select('*')
      .eq('transaction_date', date)

    if (txError) throw new Error(`Fetch transactions failed: ${txError.message}`)
    if (!transactions || transactions.length === 0) {
      return res.status(200).json({ success: true, message: `Tidak ada transaksi untuk ${date}` })
    }

    // ── 2. Ambil historical data 14 hari untuk bucket calculation ────────────
    const since = new Date(date)
    since.setDate(since.getDate() - 13)
    const sinceStr = since.toISOString().split('T')[0]

    const { data: historicalTrx } = await supabase
      .from('am_transactions')
      .select('serial_number, transaction_date, trntype, sharing_fee, mitra, pic')
      .gte('transaction_date', sinceStr)
      .lte('transaction_date', date)

    // ── 3. Compute agent stats dari 14 hari (untuk bucket) ───────────────────
    type AgentHistory = {
      activeDays: Set<string>
      transferTrxByDay: Record<string, number>
    }

    const agentHistory: Record<string, AgentHistory> = {}
    for (const trx of historicalTrx ?? []) {
      const sn = trx.serial_number
      if (!sn) continue
      if (!agentHistory[sn]) agentHistory[sn] = { activeDays: new Set(), transferTrxByDay: {} }

      agentHistory[sn].activeDays.add(trx.transaction_date)
      if (trx.trntype === 'TRANSFER') {
        const d = trx.transaction_date
        agentHistory[sn].transferTrxByDay[d] = (agentHistory[sn].transferTrxByDay[d] ?? 0) + 1
      }
    }

    // Fungsi hitung bucket
    function calcBucket(sn: string, targetMinTrxPotential = 5): string {
      const h = agentHistory[sn]
      if (!h) return 'dormant'

      const activeDays = h.activeDays.size
      if (activeDays === 0) return 'dormant'

      const totalTransferTrx = Object.values(h.transferTrxByDay).reduce((a, b) => a + b, 0)
      const avgTransferPerActiveDay = activeDays > 0 ? totalTransferTrx / activeDays : 0

      const isHighVolume = avgTransferPerActiveDay >= targetMinTrxPotential

      if (activeDays >= 8) return 'growing'
      if (activeDays >= 1 && isHighVolume) return 'potential'
      return 'at_risk'
    }

    // ── 4. Compute Agent Daily Metrics ───────────────────────────────────────
    type AgentMetric = {
      metric_date:          string
      serial_number:        string
      merchant_name:        string | null
      mitra:                string | null
      pic:                  string | null
      alamat_struk:         string | null
      brand:                string | null
      tipe_mesin:           string | null
      source_app:           string | null
      terminal_data_source: string | null
      total_trx:            number
      transfer_trx:         number
      cek_saldo_trx:        number
      total_fee:            number
      transfer_fee:         number
      cek_saldo_fee:        number
      is_active:            boolean
      active_days_14:       number
      avg_transfer_per_active_day: number
      bucket:               string
    }

    const agentMap: Record<string, AgentMetric> = {}

    for (const trx of transactions) {
      const sn = trx.serial_number
      if (!sn) continue

      if (!agentMap[sn]) {
        const h = agentHistory[sn]
        const activeDays = h?.activeDays.size ?? 0
        const totalTransferTrx = Object.values(h?.transferTrxByDay ?? {}).reduce((a, b) => a + b, 0)
        const avgTransfer = activeDays > 0 ? Math.round((totalTransferTrx / activeDays) * 100) / 100 : 0

        agentMap[sn] = {
          metric_date:          date,
          serial_number:        sn,
          merchant_name:        trx.merchant_name,
          mitra:                trx.mitra,
          pic:                  trx.pic,
          alamat_struk:         trx.alamat_struk,
          brand:                trx.brand,
          tipe_mesin:           trx.tipe_mesin,
          source_app:           trx.source_app,
          terminal_data_source: trx.terminal_data_source,
          total_trx:            0,
          transfer_trx:         0,
          cek_saldo_trx:        0,
          total_fee:            0,
          transfer_fee:         0,
          cek_saldo_fee:        0,
          is_active:            true,
          active_days_14:       activeDays,
          avg_transfer_per_active_day: avgTransfer,
          bucket:               calcBucket(sn),
        }
      }

      const agent = agentMap[sn]
      const fee = Number(trx.sharing_fee) || 0
      const isTransfer = trx.trntype === 'TRANSFER'

      agent.total_trx++
      agent.total_fee += fee
      if (isTransfer) { agent.transfer_trx++; agent.transfer_fee += fee }
      else { agent.cek_saldo_trx++; agent.cek_saldo_fee += fee }
    }

    const agentMetrics = Object.values(agentMap)
    for (const batch of chunk(agentMetrics, 500)) {
      const { error } = await supabase
        .from('am_agent_daily_metrics')
        .upsert(batch, { onConflict: 'metric_date,serial_number' })
      if (error) throw new Error(`Agent metrics upsert failed: ${error.message}`)
    }

    // ── 5. Compute Mitra Daily Metrics ───────────────────────────────────────
    type MitraAccum = {
      mitra: string
      active_agent_sns: Set<string>
      potential_count:  number
      growing_count:    number
      at_risk_count:    number
      total_trx:        number
      transfer_trx:     number
      cek_saldo_trx:    number
      total_fee:        number
    }

    const mitraMap: Record<string, MitraAccum> = {}

    for (const agent of agentMetrics) {
      if (!agent.mitra) continue
      if (!mitraMap[agent.mitra]) {
        mitraMap[agent.mitra] = {
          mitra:           agent.mitra,
          active_agent_sns: new Set(),
          potential_count: 0,
          growing_count:   0,
          at_risk_count:   0,
          total_trx:       0,
          transfer_trx:    0,
          cek_saldo_trx:   0,
          total_fee:       0,
        }
      }
      const m = mitraMap[agent.mitra]
      m.active_agent_sns.add(agent.serial_number)
      if (agent.bucket === 'potential') m.potential_count++
      if (agent.bucket === 'growing')   m.growing_count++
      if (agent.bucket === 'at_risk')   m.at_risk_count++
      m.total_trx     += agent.total_trx
      m.transfer_trx  += agent.transfer_trx
      m.cek_saldo_trx += agent.cek_saldo_trx
      m.total_fee     += agent.total_fee
    }

    // Total unique agents per mitra dalam 14 hari
    const mitraTotalAgents: Record<string, Set<string>> = {}
    for (const trx of historicalTrx ?? []) {
      if (!trx.mitra || !trx.serial_number) continue
      if (!mitraTotalAgents[trx.mitra]) mitraTotalAgents[trx.mitra] = new Set()
      mitraTotalAgents[trx.mitra].add(trx.serial_number)
    }

    const mitraMetrics = Object.values(mitraMap).map(m => {
      const active_agents  = m.active_agent_sns.size
      const total_agents_14 = mitraTotalAgents[m.mitra]?.size ?? active_agents
      const dormant_count  = Math.max(0, total_agents_14 - active_agents)
      const active_ratio   = total_agents_14 > 0 ? active_agents / total_agents_14 : 0
      const health_score   = Math.min(100, Math.round(active_ratio * 100 * 100) / 100)

      return {
        metric_date:     date,
        mitra:           m.mitra,
        active_agents,
        total_agents_14,
        potential_count: m.potential_count,
        growing_count:   m.growing_count,
        at_risk_count:   m.at_risk_count,
        dormant_count,
        total_trx:       m.total_trx,
        transfer_trx:    m.transfer_trx,
        cek_saldo_trx:   m.cek_saldo_trx,
        total_fee:       m.total_fee,
        health_score,
      }
    })

    for (const batch of chunk(mitraMetrics, 500)) {
      const { error } = await supabase
        .from('am_mitra_daily_metrics')
        .upsert(batch, { onConflict: 'metric_date,mitra' })
      if (error) throw new Error(`Mitra metrics upsert failed: ${error.message}`)
    }

    // ── 6. Compute PIC Daily Metrics ─────────────────────────────────────────
    type PicAccum = {
      pic:             string
      mitra:           string | null
      active_agent_sns: Set<string>
      potential_count: number
      growing_count:   number
      at_risk_count:   number
      total_trx:       number
      transfer_trx:    number
      cek_saldo_trx:   number
      total_fee:       number
    }

    const picMap: Record<string, PicAccum> = {}

    for (const agent of agentMetrics) {
      if (!agent.pic) continue
      if (!picMap[agent.pic]) {
        picMap[agent.pic] = {
          pic:             agent.pic,
          mitra:           agent.mitra,
          active_agent_sns: new Set(),
          potential_count: 0,
          growing_count:   0,
          at_risk_count:   0,
          total_trx:       0,
          transfer_trx:    0,
          cek_saldo_trx:   0,
          total_fee:       0,
        }
      }
      const p = picMap[agent.pic]
      p.active_agent_sns.add(agent.serial_number)
      if (agent.bucket === 'potential') p.potential_count++
      if (agent.bucket === 'growing')   p.growing_count++
      if (agent.bucket === 'at_risk')   p.at_risk_count++
      p.total_trx     += agent.total_trx
      p.transfer_trx  += agent.transfer_trx
      p.cek_saldo_trx += agent.cek_saldo_trx
      p.total_fee     += agent.total_fee
    }

    // Total unique agents per PIC dalam 14 hari
    const picTotalAgents: Record<string, Set<string>> = {}
    for (const trx of historicalTrx ?? []) {
      if (!trx.pic || !trx.serial_number) continue
      if (!picTotalAgents[trx.pic]) picTotalAgents[trx.pic] = new Set()
      picTotalAgents[trx.pic].add(trx.serial_number)
    }

    const picMetrics = Object.values(picMap).map(p => {
      const active_agents   = p.active_agent_sns.size
      const total_agents_14 = picTotalAgents[p.pic]?.size ?? active_agents
      const dormant_count   = Math.max(0, total_agents_14 - active_agents)
      const active_ratio    = total_agents_14 > 0 ? active_agents / total_agents_14 : 0
      const health_score    = Math.min(100, Math.round(active_ratio * 100 * 100) / 100)

      return {
        metric_date:     date,
        pic:             p.pic,
        mitra:           p.mitra,
        active_agents,
        total_agents_14,
        potential_count: p.potential_count,
        growing_count:   p.growing_count,
        at_risk_count:   p.at_risk_count,
        dormant_count,
        total_trx:       p.total_trx,
        transfer_trx:    p.transfer_trx,
        cek_saldo_trx:   p.cek_saldo_trx,
        total_fee:       p.total_fee,
        health_score,
      }
    })

    for (const batch of chunk(picMetrics, 500)) {
      const { error } = await supabase
        .from('am_pic_daily_metrics')
        .upsert(batch, { onConflict: 'metric_date,pic' })
      if (error) throw new Error(`PIC metrics upsert failed: ${error.message}`)
    }

    return res.status(200).json({
      success: true,
      summary: {
        date,
        agents_computed: agentMetrics.length,
        mitra_computed:  mitraMetrics.length,
        pic_computed:    picMetrics.length,
        buckets: {
          potential: agentMetrics.filter(a => a.bucket === 'potential').length,
          growing:   agentMetrics.filter(a => a.bucket === 'growing').length,
          at_risk:   agentMetrics.filter(a => a.bucket === 'at_risk').length,
        }
      },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/compute-metrics]', message)
    return res.status(500).json({ error: 'Compute metrics gagal', details: message })
  }
}
