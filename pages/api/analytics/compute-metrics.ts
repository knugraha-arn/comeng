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
    // ── 1. Ambil attributed transactions untuk tanggal ini ───────────────────
    // Hanya transaksi yang berhasil di-join ke Master (punya serial_number)
    const { data: transactions, error: txError } = await supabase
      .from('am_attributed_transactions')
      .select('*')
      .eq('transaction_date', date)
      .eq('attributed', true)           // hanya yang ter-join ke ESA
      .not('serial_number', 'is', null) // hanya yang punya SN (ter-join ke Master)
      .eq('is_test_terminal', false)    // exclude terminal test

    if (txError) throw new Error(`Fetch transactions failed: ${txError.message}`)
    if (!transactions || transactions.length === 0) {
      return res.status(200).json({ success: true, message: `Tidak ada transaksi attributed untuk ${date}` })
    }

    // ── 2. Compute Agent Daily Metrics ───────────────────────────────────────
    type AgentMetric = {
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
    }

    const agentMap: Record<string, AgentMetric> = {}

    for (const trx of transactions) {
      const key = `${trx.terminal_id}__${trx.serial_number}`

      if (!agentMap[key]) {
        agentMap[key] = {
          terminal_id:   trx.terminal_id,
          serial_number: trx.serial_number,
          kode_sub_ca:   trx.kode_sub_ca,
          nama_sub_ca:   trx.mitra,
          pic:           trx.pic,
          nama_merchant: trx.nama_merchant,
          kota:          trx.kota,
          provinsi:      trx.provinsi,
          total_trx: 0, transfer_trx: 0, cek_saldo_trx: 0,
          total_fee: 0, transfer_fee: 0, cek_saldo_fee: 0,
        }
      }

      const agent = agentMap[key]
      const fee = Number(trx.sharing_fee) || 0
      const isTransfer = trx.type_transaksi === 'TRANSFER'

      agent.total_trx++
      agent.total_fee += fee
      if (isTransfer) { agent.transfer_trx++; agent.transfer_fee += fee }
      else { agent.cek_saldo_trx++; agent.cek_saldo_fee += fee }
    }

    const agentMetrics = Object.values(agentMap).map(a => ({
      metric_date:    date,
      ...a,
      is_active:      true, // semua yang masuk sini pasti aktif (ada transaksi)
    }))

    for (const batch of chunk(agentMetrics, 500)) {
      const { error } = await supabase
        .from('am_agent_daily_metrics')
        .upsert(batch, { onConflict: 'metric_date,terminal_id,serial_number' })
      if (error) throw new Error(`Agent metrics upsert failed: ${error.message}`)
    }

    // ── 3. Compute Mitra Daily Metrics ───────────────────────────────────────
    // Basis: agen yang aktif hari ini (dari transaksi)
    // total_agents: jumlah unique agen yang pernah aktif di window 14 hari
    // active_agents: jumlah agen aktif hari ini
    
    type MitraAccum = {
      kode_sub_ca: string
      nama_sub_ca: string | null
      active_agent_keys: Set<string>
      total_trx: number
      transfer_trx: number
      cek_saldo_trx: number
      total_fee: number
    }

    const mitraMap: Record<string, MitraAccum> = {}

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
      const m = mitraMap[agent.kode_sub_ca]
      m.active_agent_keys.add(`${agent.terminal_id}__${agent.serial_number}`)
      m.total_trx     += agent.total_trx
      m.transfer_trx  += agent.transfer_trx
      m.cek_saldo_trx += agent.cek_saldo_trx
      m.total_fee     += agent.total_fee
    }

    // Hitung total_agents dari window 14 hari (unique agen yang pernah aktif)
    const since = new Date(date)
    since.setDate(since.getDate() - 13)
    const sinceStr = since.toISOString().split('T')[0]

    const { data: historicalAgents } = await supabase
      .from('am_agent_daily_metrics')
      .select('kode_sub_ca, terminal_id, serial_number')
      .gte('metric_date', sinceStr)
      .lte('metric_date', date)
      .not('kode_sub_ca', 'is', null)

    // Total unique agents per mitra dalam 14 hari
    const totalAgentsByMitra: Record<string, Set<string>> = {}
    for (const row of historicalAgents ?? []) {
      if (!row.kode_sub_ca) continue
      if (!totalAgentsByMitra[row.kode_sub_ca]) totalAgentsByMitra[row.kode_sub_ca] = new Set()
      totalAgentsByMitra[row.kode_sub_ca].add(`${row.terminal_id}__${row.serial_number}`)
    }

    const mitraMetrics = Object.values(mitraMap).map(m => {
      const active_agents  = m.active_agent_keys.size
      const total_agents   = totalAgentsByMitra[m.kode_sub_ca]?.size ?? active_agents
      const inactive_agents = Math.max(0, total_agents - active_agents)
      const active_ratio   = total_agents > 0 ? active_agents / total_agents : 0
      const health_score   = Math.min(100, Math.round(active_ratio * 100 * 100) / 100)

      return {
        metric_date:    date,
        kode_sub_ca:    m.kode_sub_ca,
        nama_sub_ca:    m.nama_sub_ca,
        total_agents,
        active_agents,
        inactive_agents,
        total_trx:      m.total_trx,
        transfer_trx:   m.transfer_trx,
        cek_saldo_trx:  m.cek_saldo_trx,
        total_fee:      m.total_fee,
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
    type PicAccum = {
      pic: string
      active_agent_keys: Set<string>
      total_trx: number
      transfer_trx: number
      cek_saldo_trx: number
      total_fee: number
    }

    const picMap: Record<string, PicAccum> = {}

    for (const agent of agentMetrics) {
      if (!agent.pic) continue
      if (!picMap[agent.pic]) {
        picMap[agent.pic] = {
          pic: agent.pic,
          active_agent_keys: new Set(),
          total_trx: 0, transfer_trx: 0, cek_saldo_trx: 0, total_fee: 0,
        }
      }
      const p = picMap[agent.pic]
      p.active_agent_keys.add(`${agent.terminal_id}__${agent.serial_number}`)
      p.total_trx     += agent.total_trx
      p.transfer_trx  += agent.transfer_trx
      p.cek_saldo_trx += agent.cek_saldo_trx
      p.total_fee     += agent.total_fee
    }

    // Total unique agents per PIC dalam 14 hari
    const totalAgentsByPic: Record<string, Set<string>> = {}
    for (const row of historicalAgents ?? []) {
      if (!row.kode_sub_ca) continue
      // Perlu pic dari agent metrics
    }
    
    // Ambil pic dari agent metrics historical
    const { data: historicalAgentsFull } = await supabase
      .from('am_agent_daily_metrics')
      .select('pic, terminal_id, serial_number')
      .gte('metric_date', sinceStr)
      .lte('metric_date', date)
      .not('pic', 'is', null)

    for (const row of historicalAgentsFull ?? []) {
      if (!row.pic) continue
      if (!totalAgentsByPic[row.pic]) totalAgentsByPic[row.pic] = new Set()
      totalAgentsByPic[row.pic].add(`${row.terminal_id}__${row.serial_number}`)
    }

    const picMetrics = Object.values(picMap).map(p => {
      const active_agents   = p.active_agent_keys.size
      const total_agents    = totalAgentsByPic[p.pic]?.size ?? active_agents
      const inactive_agents = Math.max(0, total_agents - active_agents)
      const active_ratio    = total_agents > 0 ? active_agents / total_agents : 0
      const health_score    = Math.min(100, Math.round(active_ratio * 100 * 100) / 100)

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
        agents_computed: agentMetrics.length,
        mitra_computed:  mitraMetrics.length,
        pic_computed:    picMetrics.length,
      },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analytics/compute-metrics]', message)
    return res.status(500).json({ error: 'Compute metrics gagal', details: message })
  }
}
