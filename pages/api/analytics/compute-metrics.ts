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
    // ── 1. Window 14 hari ────────────────────────────────────────────────────
    const since = new Date(date)
    since.setDate(since.getDate() - 13)
    const sinceStr = since.toISOString().split('T')[0]

    // ── 2. Ambil SEMUA transaksi 14 hari ─────────────────────────────────────
    // Ini basis untuk bucket calculation
    const { data: historicalTrx, error: histError } = await supabase
      .from('am_transactions')
      .select('serial_number, transaction_date, trntype, sharing_fee, mitra, pic, merchant_name, alamat_struk, brand, tipe_mesin, source_app, terminal_data_source')
      .gte('transaction_date', sinceStr)
      .lte('transaction_date', date)

    if (histError) throw new Error(`Fetch historical failed: ${histError.message}`)

    // ── 3. Ambil transaksi hari ini ───────────────────────────────────────────
    const todayTrx = (historicalTrx ?? []).filter(r => r.transaction_date === date)

    // ── 4. Build agent profile dari 14 hari ──────────────────────────────────
    type AgentProfile = {
      serial_number:        string
      merchant_name:        string | null
      mitra:                string | null
      pic:                  string | null
      alamat_struk:         string | null
      brand:                string | null
      tipe_mesin:           string | null
      source_app:           string | null
      terminal_data_source: string | null
      activeDays:           Set<string>
      transferTrxByDay:     Record<string, number>
      // today's metrics
      total_trx:            number
      transfer_trx:         number
      cek_saldo_trx:        number
      total_fee:            number
      transfer_fee:         number
      cek_saldo_fee:        number
      is_active_today:      boolean
    }

    const agentProfiles: Record<string, AgentProfile> = {}

    // Build dari semua 14 hari — semua agen yang pernah aktif masuk
    for (const trx of historicalTrx ?? []) {
      const sn = trx.serial_number
      if (!sn) continue

      if (!agentProfiles[sn]) {
        agentProfiles[sn] = {
          serial_number:        sn,
          merchant_name:        trx.merchant_name,
          mitra:                trx.mitra,
          pic:                  trx.pic,
          alamat_struk:         trx.alamat_struk,
          brand:                trx.brand,
          tipe_mesin:           trx.tipe_mesin,
          source_app:           trx.source_app,
          terminal_data_source: trx.terminal_data_source,
          activeDays:           new Set(),
          transferTrxByDay:     {},
          total_trx:            0,
          transfer_trx:         0,
          cek_saldo_trx:        0,
          total_fee:            0,
          transfer_fee:         0,
          cek_saldo_fee:        0,
          is_active_today:      false,
        }
      }

      const agent = agentProfiles[sn]
      agent.activeDays.add(trx.transaction_date)

      if (trx.trntype === 'TRANSFER') {
        const d = trx.transaction_date
        agent.transferTrxByDay[d] = (agent.transferTrxByDay[d] ?? 0) + 1
      }

      // Today's metrics
      if (trx.transaction_date === date) {
        agent.is_active_today = true
        const fee = Number(trx.sharing_fee) || 0
        agent.total_trx++
        agent.total_fee += fee
        if (trx.trntype === 'TRANSFER') {
          agent.transfer_trx++
          agent.transfer_fee += fee
        } else {
          agent.cek_saldo_trx++
          agent.cek_saldo_fee += fee
        }
      }
    }

    if (Object.keys(agentProfiles).length === 0) {
      return res.status(200).json({ success: true, message: `Tidak ada data untuk ${date}` })
    }

    // ── 5. Hitung bucket untuk setiap agen ───────────────────────────────────
    const MIN_TRX_POTENTIAL = 5 // threshold trx transfer per hari aktif

    function calcBucket(profile: AgentProfile): string {
      const activeDays = profile.activeDays.size
      if (activeDays === 0) return 'dormant'

      const totalTransferTrx = Object.values(profile.transferTrxByDay).reduce((a, b) => a + b, 0)
      const avgTransferPerActiveDay = totalTransferTrx / activeDays

      if (activeDays >= 8) return 'growing'
      if (activeDays >= 1 && avgTransferPerActiveDay >= MIN_TRX_POTENTIAL) return 'potential'
      return 'at_risk'
    }

    // ── 6. Build agent daily metrics (semua agen 14 hari, bukan hanya aktif hari ini) ──
    const agentMetrics = Object.values(agentProfiles).map(agent => {
      const activeDays = agent.activeDays.size
      const totalTransferTrx = Object.values(agent.transferTrxByDay).reduce((a, b) => a + b, 0)
      const avgTransfer = activeDays > 0 ? Math.round((totalTransferTrx / activeDays) * 100) / 100 : 0
      const bucket = calcBucket(agent)

      return {
        metric_date:                 date,
        serial_number:               agent.serial_number,
        merchant_name:               agent.merchant_name,
        mitra:                       agent.mitra,
        pic:                         agent.pic,
        alamat_struk:                agent.alamat_struk,
        brand:                       agent.brand,
        tipe_mesin:                  agent.tipe_mesin,
        source_app:                  agent.source_app,
        terminal_data_source:        agent.terminal_data_source,
        total_trx:                   agent.total_trx,
        transfer_trx:                agent.transfer_trx,
        cek_saldo_trx:               agent.cek_saldo_trx,
        total_fee:                   agent.total_fee,
        transfer_fee:                agent.transfer_fee,
        cek_saldo_fee:               agent.cek_saldo_fee,
        is_active:                   agent.is_active_today,
        active_days_14:              activeDays,
        avg_transfer_per_active_day: avgTransfer,
        bucket,
      }
    })

    // Upsert agent metrics
    for (const batch of chunk(agentMetrics, 500)) {
      const { error } = await supabase
        .from('am_agent_daily_metrics')
        .upsert(batch, { onConflict: 'metric_date,serial_number' })
      if (error) throw new Error(`Agent metrics upsert failed: ${error.message}`)
    }

    // ── 7. Compute Mitra Daily Metrics ───────────────────────────────────────
    type MitraAccum = {
      mitra:           string
      all_agent_sns:   Set<string>  // semua agen dalam 14 hari
      active_agent_sns: Set<string> // agen aktif hari ini
      potential_count: number
      growing_count:   number
      at_risk_count:   number
      dormant_count:   number
      total_trx:       number
      transfer_trx:    number
      cek_saldo_trx:   number
      total_fee:       number
    }

    const mitraMap: Record<string, MitraAccum> = {}

    for (const agent of agentMetrics) {
      if (!agent.mitra) continue
      if (!mitraMap[agent.mitra]) {
        mitraMap[agent.mitra] = {
          mitra:            agent.mitra,
          all_agent_sns:    new Set(),
          active_agent_sns: new Set(),
          potential_count:  0,
          growing_count:    0,
          at_risk_count:    0,
          dormant_count:    0,
          total_trx:        0,
          transfer_trx:     0,
          cek_saldo_trx:    0,
          total_fee:        0,
        }
      }

      const m = mitraMap[agent.mitra]
      m.all_agent_sns.add(agent.serial_number)
      if (agent.is_active) m.active_agent_sns.add(agent.serial_number)
      if (agent.bucket === 'potential') m.potential_count++
      if (agent.bucket === 'growing')   m.growing_count++
      if (agent.bucket === 'at_risk')   m.at_risk_count++
      if (agent.bucket === 'dormant')   m.dormant_count++
      m.total_trx     += agent.total_trx
      m.transfer_trx  += agent.transfer_trx
      m.cek_saldo_trx += agent.cek_saldo_trx
      m.total_fee     += agent.total_fee
    }

    const mitraMetrics = Object.values(mitraMap).map(m => {
      const total_agents_14 = m.all_agent_sns.size
      const active_agents   = m.active_agent_sns.size
      const active_ratio    = total_agents_14 > 0 ? active_agents / total_agents_14 : 0
      const health_score    = Math.min(100, Math.round(active_ratio * 100 * 100) / 100)

      return {
        metric_date:     date,
        mitra:           m.mitra,
        active_agents,
        total_agents_14,
        potential_count: m.potential_count,
        growing_count:   m.growing_count,
        at_risk_count:   m.at_risk_count,
        dormant_count:   m.dormant_count,
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

    // ── 8. Compute PIC Daily Metrics ─────────────────────────────────────────
    type PicAccum = {
      pic:              string
      mitra:            string | null
      all_agent_sns:    Set<string>
      active_agent_sns: Set<string>
      potential_count:  number
      growing_count:    number
      at_risk_count:    number
      dormant_count:    number
      total_trx:        number
      transfer_trx:     number
      cek_saldo_trx:    number
      total_fee:        number
    }

    const picMap: Record<string, PicAccum> = {}

    for (const agent of agentMetrics) {
      if (!agent.pic) continue
      if (!picMap[agent.pic]) {
        picMap[agent.pic] = {
          pic:              agent.pic,
          mitra:            agent.mitra,
          all_agent_sns:    new Set(),
          active_agent_sns: new Set(),
          potential_count:  0,
          growing_count:    0,
          at_risk_count:    0,
          dormant_count:    0,
          total_trx:        0,
          transfer_trx:     0,
          cek_saldo_trx:    0,
          total_fee:        0,
        }
      }

      const p = picMap[agent.pic]
      p.all_agent_sns.add(agent.serial_number)
      if (agent.is_active) p.active_agent_sns.add(agent.serial_number)
      if (agent.bucket === 'potential') p.potential_count++
      if (agent.bucket === 'growing')   p.growing_count++
      if (agent.bucket === 'at_risk')   p.at_risk_count++
      if (agent.bucket === 'dormant')   p.dormant_count++
      p.total_trx     += agent.total_trx
      p.transfer_trx  += agent.transfer_trx
      p.cek_saldo_trx += agent.cek_saldo_trx
      p.total_fee     += agent.total_fee
    }

    const picMetrics = Object.values(picMap).map(p => {
      const total_agents_14 = p.all_agent_sns.size
      const active_agents   = p.active_agent_sns.size
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
        dormant_count:   p.dormant_count,
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

    // Bucket summary
    const bucketSummary = {
      potential: agentMetrics.filter(a => a.bucket === 'potential').length,
      growing:   agentMetrics.filter(a => a.bucket === 'growing').length,
      at_risk:   agentMetrics.filter(a => a.bucket === 'at_risk').length,
      dormant:   agentMetrics.filter(a => a.bucket === 'dormant').length,
    }

    return res.status(200).json({
      success: true,
      summary: {
        date,
        agents_computed: agentMetrics.length,
        mitra_computed:  mitraMetrics.length,
        pic_computed:    picMetrics.length,
        buckets:         bucketSummary,
      },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/compute-metrics]', message)
    return res.status(500).json({ error: 'Compute metrics gagal', details: message })
  }
}
