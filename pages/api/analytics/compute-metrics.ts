import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: { bodyParser: true },
}

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
    // ── 1. Ambil semua attributed transactions untuk tanggal ini ─────────────
    // Join NOBU → ESA via refnum → Master via terminal_id + serial_number
    const { data: transactions, error: txError } = await supabase
      .from('am_attributed_transactions')
      .select('*')
      .eq('transaction_date', date)

    if (txError) throw new Error(`Fetch transactions failed: ${txError.message}`)
    if (!transactions || transactions.length === 0) {
      return res.status(200).json({ success: true, message: `Tidak ada transaksi untuk ${date}` })
    }

    // ── 2. Compute Agent Daily Metrics ───────────────────────────────────────
    const agentMap: Record<string, {
      terminal_id: string
      serial_number: string
      kode_sub_ca: string | null
      nama_sub_ca: string | null
      pic: string | null
      nama_merchant: string | null
      kota: string | null
      provinsi: string | null
      total_trx: number
      transfer_trx: number
      cek_saldo_trx: number
      total_fee: number
      transfer_fee: number
      cek_saldo_fee: number
    }> = {}

    for (const trx of transactions) {
      if (!trx.serial_number || !trx.terminal_id) continue  // skip unattributed

      const key = `${trx.terminal_id}__${trx.serial_number}`

      if (!agentMap[key]) {
        agentMap[key] = {
          terminal_id:  trx.terminal_id,
          serial_number: trx.serial_number,
          kode_sub_ca:  trx.kode_sub_ca,
          nama_sub_ca:  trx.mitra,
          pic:          trx.pic,
          nama_merchant: trx.nama_merchant,
          kota:         trx.kota,
          provinsi:     trx.provinsi,
          total_trx: 0, transfer_trx: 0, cek_saldo_trx: 0,
          total_fee: 0, transfer_fee: 0, cek_saldo_fee: 0,
        }
      }

      const agent = agentMap[key]
      const fee = Number(trx.sharing_fee) || 0
      const isTransfer = trx.type_transaksi === 'TRANSFER'

      agent.total_trx++
      agent.total_fee += fee

      if (isTransfer) {
        agent.transfer_trx++
        agent.transfer_fee += fee
      } else {
        agent.cek_saldo_trx++
        agent.cek_saldo_fee += fee
      }
    }

    const agentMetrics = Object.values(agentMap).map(a => ({
      metric_date:    date,
      ...a,
      is_active:      a.total_trx > 0,
    }))

    // Upsert agent metrics
    for (const batch of chunk(agentMetrics, 500)) {
      const { error } = await supabase
        .from('am_agent_daily_metrics')
        .upsert(batch, { onConflict: 'metric_date,terminal_id,serial_number' })
      if (error) throw new Error(`Agent metrics upsert failed: ${error.message}`)
    }

    // ── 3. Compute Mitra Daily Metrics ───────────────────────────────────────
    const mitraMap: Record<string, {
      kode_sub_ca: string
      nama_sub_ca: string | null
      active_agent_keys: Set<string>
      total_trx: number
      transfer_trx: number
      cek_saldo_trx: number
      total_fee: number
    }> = {}

    for (const agent of agentMetrics) {
      if (!agent.kode_sub_ca) continue

      if (!mitraMap[agent.kode_sub_ca]) {
        mitraMap[agent.kode_sub_ca] = {
          kode_sub_ca:      agent.kode_sub_ca,
          nama_sub_ca:      agent.nama_sub_ca,
          active_agent_keys: new Set(),
          total_trx: 0, transfer_trx: 0, cek_saldo_trx: 0, total_fee: 0,
        }
      }

      const mitra = mitraMap[agent.kode_sub_ca]
      if (agent.is_active) mitra.active_agent_keys.add(`${agent.terminal_id}__${agent.serial_number}`)
      mitra.total_trx    += agent.total_trx
      mitra.transfer_trx += agent.transfer_trx
      mitra.cek_saldo_trx += agent.cek_saldo_trx
      mitra.total_fee    += agent.total_fee
    }

    // Hitung total_agents dari master (semua agen di bawah mitra, bukan hanya yang aktif hari ini)
    const { data: masterCounts } = await supabase
      .from('am_agent_master')
      .select('kode_sub_ca')
      .not('kode_sub_ca', 'is', null)
      .eq('is_test_terminal', false)

    const masterCountByMitra: Record<string, number> = {}
    for (const row of masterCounts ?? []) {
      if (row.kode_sub_ca) {
        masterCountByMitra[row.kode_sub_ca] = (masterCountByMitra[row.kode_sub_ca] ?? 0) + 1
      }
    }

    const mitraMetrics = Object.values(mitraMap).map(m => {
      const active_agents  = m.active_agent_keys.size
      const total_agents   = masterCountByMitra[m.kode_sub_ca] ?? active_agents
      const inactive_agents = Math.max(0, total_agents - active_agents)

      // Partner Health Score (0–100)
      // Komponen: active ratio, volume trend (hari ini saja untuk sekarang)
      const active_ratio = total_agents > 0 ? active_agents / total_agents : 0
      const health_score = Math.round(active_ratio * 100 * 100) / 100

      return {
        metric_date:     date,
        kode_sub_ca:     m.kode_sub_ca,
        nama_sub_ca:     m.nama_sub_ca,
        total_agents,
        active_agents,
        inactive_agents,
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
        .upsert(batch, { onConflict: 'metric_date,kode_sub_ca' })
      if (error) throw new Error(`Mitra metrics upsert failed: ${error.message}`)
    }

    // ── 4. Compute PIC Daily Metrics ─────────────────────────────────────────
    const picMap: Record<string, {
      pic: string
      active_agent_keys: Set<string>
      total_trx: number
      transfer_trx: number
      cek_saldo_trx: number
      total_fee: number
    }> = {}

    for (const agent of agentMetrics) {
      if (!agent.pic) continue

      if (!picMap[agent.pic]) {
        picMap[agent.pic] = {
          pic:              agent.pic,
          active_agent_keys: new Set(),
          total_trx: 0, transfer_trx: 0, cek_saldo_trx: 0, total_fee: 0,
        }
      }

      const pic = picMap[agent.pic]
      if (agent.is_active) pic.active_agent_keys.add(`${agent.terminal_id}__${agent.serial_number}`)
      pic.total_trx     += agent.total_trx
      pic.transfer_trx  += agent.transfer_trx
      pic.cek_saldo_trx += agent.cek_saldo_trx
      pic.total_fee     += agent.total_fee
    }

    // Hitung total_agents per PIC dari master
    const { data: masterPicCounts } = await supabase
      .from('am_agent_master')
      .select('pic')
      .not('pic', 'is', null)
      .eq('is_test_terminal', false)

    const masterCountByPic: Record<string, number> = {}
    for (const row of masterPicCounts ?? []) {
      if (row.pic) {
        masterCountByPic[row.pic] = (masterCountByPic[row.pic] ?? 0) + 1
      }
    }

    const picMetrics = Object.values(picMap).map(p => {
      const active_agents   = p.active_agent_keys.size
      const total_agents    = masterCountByPic[p.pic] ?? active_agents
      const inactive_agents = Math.max(0, total_agents - active_agents)

      // PIC Health Score (0–100)
      const active_ratio = total_agents > 0 ? active_agents / total_agents : 0
      const health_score = Math.round(active_ratio * 100 * 100) / 100

      return {
        metric_date:    date,
        pic:            p.pic,
        total_agents,
        active_agents,
        inactive_agents,
        total_trx:      p.total_trx,
        transfer_trx:   p.transfer_trx,
        cek_saldo_trx:  p.cek_saldo_trx,
        total_fee:      p.total_fee,
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
        agents_computed:  agentMetrics.length,
        mitra_computed:   mitraMetrics.length,
        pic_computed:     picMetrics.length,
      },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/compute-metrics]', message)
    return res.status(500).json({ error: 'Compute metrics gagal', details: message })
  }
}
