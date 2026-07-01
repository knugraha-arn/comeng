import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function buildContext(wagId?: string): Promise<string> {
  // Semua fetch dijalankan paralel untuk efisiensi
  const [
    { data: wags },
    { data: rangers },
    { data: metrics },
    { data: members },
    { data: observers },
    { data: lastRec },
    { data: mitraStats },
    { data: topAgentsByTrx },
    { data: bucketRaw },
    { data: dateData },
    { data: skillFiles },
    { data: mitraMtdStats },
    { data: topAgentsPerMitra },
    { data: mitraTargetProgress },
    { data: mitraHistorisSnap },
    { data: mitraHistorisTarget },
  ] = await Promise.all([
    supabase.from('wags').select('id, name, status, last_processed_at').eq('status', 'active'),
    supabase.from('rangers').select('id, full_name, display_name, phone_number, wag_id, wags(name)').eq('status', 'active'),
    supabase.from('weekly_metrics').select('wag_id, ranger_id, week_key, active_days, total_messages, participation_rate, proactive_posts, dormant_rate, unresponded_rate, status').order('week_key', { ascending: false }),
    supabase.from('members').select('wag_id, display_name, status, last_active_at, greeted_at, joined_at').order('last_active_at', { ascending: false }),
    supabase.from('observers').select('wag_id, display_name, note'),
    supabase.from('recommendations').select('week_key, generated_at, items').order('generated_at', { ascending: false }).limit(1).single(),
    supabase.rpc('get_mitra_list'),
    supabase.from('am_agent_daily_metrics').select('serial_number, merchant_name, mitra, pic, total_trx, total_fee, bucket, active_days_14, avg_transfer_per_active_day').order('total_trx', { ascending: false }).limit(10),
    supabase.from('am_agent_daily_metrics').select('bucket').not('bucket', 'is', null),
    supabase.from('am_agent_daily_metrics').select('metric_date').order('metric_date', { ascending: false }).limit(1).single(),
    supabase.from('am_ai_skill').select('name, content').eq('is_active', true).order('updated_at', { ascending: false }),
    // RPC untuk MTD — agregasi di DB, tidak kena batas 1000 baris client
    supabase.rpc('get_mitra_mtd_summary'),
    // RPC untuk top 5 agen per Mitra — idem
    supabase.rpc('get_top_agents_per_mitra'),
    // Target Mitra bulan ini
    supabase.rpc('get_mitra_target_progress'),
    // Achievement historis per Mitra (dari snapshot bulanan)
    supabase.from('am_monthly_summary').select('mitra, period_year, period_month, trx_transfer').gte('period_year', 2026).order('period_year').order('period_month').order('mitra'),
    supabase.from('am_mitra_targets').select('mitra, period_year, period_month, target_trx').gte('period_year', 2026).order('period_year').order('period_month'),
  ])

  // Build lookup MTD per Mitra dari RPC (sudah diagregasi di DB)
  const mitraMtdMap: Record<string, { trx: number, fee: number, amount: number }> = {}
  for (const row of mitraMtdStats ?? []) {
    mitraMtdMap[row.mitra] = {
      trx: Number(row.total_trx),
      fee: Number(row.total_fee),
      amount: Number(row.total_amount),
    }
  }

  // Build lookup top agen per Mitra dari RPC (sudah diagregasi di DB)
  const mitraAgentMap: Record<string, { serial_number: string, merchant_name: string, trx: number, amount: number, fee: number }[]> = {}
  for (const row of topAgentsPerMitra ?? []) {
    if (!mitraAgentMap[row.mitra]) mitraAgentMap[row.mitra] = []
    mitraAgentMap[row.mitra].push({
      serial_number: row.serial_number,
      merchant_name: row.merchant_name,
      trx: Number(row.total_trx),
      amount: Number(row.total_amount),
      fee: Number(row.total_fee),
    })
  }
  // Fetch messages terpisah karena ada kondisi wagId
  const msgQuery = supabase
    .from('messages')
    .select('wag_id, sender_name, sender_type, content, sent_at, week_key')
    .order('sent_at', { ascending: false })
  if (wagId) {
    msgQuery.eq('wag_id', wagId).limit(300)
  } else {
    msgQuery.limit(200)
  }
  const { data: messages } = await msgQuery

  const bucketCount = (bucketRaw ?? []).reduce((acc: Record<string, number>, r) => {
    acc[r.bucket] = (acc[r.bucket] || 0) + 1
    return acc
  }, {})

  const fmt = (n: number) => n >= 1_000_000_000
    ? `Rp ${(n / 1_000_000_000).toFixed(2)}M`
    : n >= 1_000_000
    ? `Rp ${(n / 1_000_000).toFixed(1)}jt`
    : n >= 1_000
    ? `Rp ${(n / 1_000).toFixed(0)}rb`
    : `Rp ${n}`

  // ── Build context string ──────────────────────────────────────────────────
  const lines: string[] = []

  lines.push('=== DATA PLATFORM AMARIS ===')
  lines.push(`Diambil pada: ${new Date().toLocaleString('id-ID')}`)
  lines.push('')

  // Skill file — konteks bisnis yang bisa diedit admin lewat Konfigurasi
  // Diinjeksi paling awal supaya jadi fondasi interpretasi AI sebelum data apapun
  if (skillFiles && skillFiles.length > 0) {
    lines.push('--- KONTEKS BISNIS (SKILL FILE) ---')
    for (const sf of skillFiles) {
      lines.push(sf.content)
    }
    lines.push('')
  }

  // Glossary istilah AMARIS — membantu AI interpretasi pertanyaan user
  lines.push('--- GLOSSARY ISTILAH ---')
  lines.push('MTD = Month-to-Date: akumulasi sejak awal bulan berjalan hingga tanggal data terakhir')
  lines.push('14H = 14 hari terakhir (window analisis utama, bergulir otomatis)')
  lines.push('W1 = 7 hari pertama dalam window 14H (hari 1-7)')
  lines.push('W2 = 7 hari terakhir dalam window 14H (hari 8-14)')
  lines.push('GMS = nama Mitra (CV. Griya Mitra Sejahtera), MAJU = PT. Meraki Jaya Usaha, SVD = nama Mitra')
  lines.push('TRX = jumlah transaksi, Fee = pendapatan sharing fee Arranet, Amount = nominal uang yang ditransfer agen')
  lines.push('Productive = agen aktif ≥8 hari dalam 14H, Moderate = aktif 1-7 hari + TRX cukup, Sporadic = agen kurang aktif')
  lines.push('Ranger = PIC (penanggung jawab agen) yang berada di bawah tiga Mitra Arranet: ARRANET, ARRANET ex Dinar, dan ARRANET ex SSDI. Ranger bertanggung jawab membina agen dan juga mengelola WAG komunitas sebagai salah satu aktivitasnya. Tidak semua PIC adalah Ranger — PIC dari Mitra lain (GMS, MAJU, SVD, dll) bukan Ranger.')
  lines.push('PIC = penanggung jawab agen di semua Mitra, termasuk non-Arranet. Ranger adalah subset dari PIC, khusus dari tiga Mitra Arranet.')
  lines.push('WAG = WhatsApp Group komunitas agen yang dikelola oleh Ranger')
  lines.push('Participation rate = % pesan Ranger dibanding total pesan di WAG')
  lines.push('')

  // WAG summary
  lines.push('--- DAFTAR WAG AKTIF ---')
  for (const wag of wags || []) {
    const wagRangers = (rangers || []).filter(r => r.wag_id === wag.id)
    const wagMembers = (members || []).filter(m => m.wag_id === wag.id)
    const dormant = wagMembers.filter(m => {
      if (!m.last_active_at) return true
      return (Date.now() - new Date(m.last_active_at).getTime()) / (1000 * 60 * 60 * 24) > 14
    }).length
    const ungreeted = wagMembers.filter(m => !m.greeted_at).length
    lines.push(`WAG: ${wag.name}`)
    lines.push(`  Ranger: ${wagRangers.map(r => r.full_name).join(', ') || 'tidak ada'}`)
    lines.push(`  Total agen: ${wagMembers.length} | Dormant >14 hari: ${dormant} | Belum disambut: ${ungreeted}`)
    lines.push(`  Terakhir diproses: ${wag.last_processed_at ? new Date(wag.last_processed_at).toLocaleDateString('id-ID') : 'belum pernah'}`)
    lines.push('')
  }

  // Ranger metrics
  lines.push('--- PERFORMA RANGER (8 MINGGU TERAKHIR) ---')
  for (const ranger of rangers || []) {
    const rangerMetrics = (metrics || [])
      .filter(m => m.ranger_id === ranger.id)
      .sort((a, b) => a.week_key.localeCompare(b.week_key))
      .slice(-8)
    const wagName = (ranger as unknown as { wags: { name: string } }).wags?.name || '—'
    lines.push(`Ranger: ${ranger.full_name} | WAG: ${wagName} | Display: ${ranger.display_name}`)
    if (rangerMetrics.length === 0) {
      lines.push('  Belum ada data metrik')
    } else {
      for (const m of rangerMetrics) {
        lines.push(`  ${m.week_key}: ${m.total_messages} pesan, ${m.active_days} hari aktif, participation ${m.participation_rate}%, proactive ${m.proactive_posts}, status: ${m.status}`)
      }
    }
    lines.push('')
  }

  // Member list per WAG
  lines.push('--- DATA AGEN PER WAG ---')
  for (const wag of wags || []) {
    const wagMembers = (members || []).filter(m => m.wag_id === wag.id)
    lines.push(`WAG ${wag.name} (${wagMembers.length} agen):`)
    for (const m of wagMembers.slice(0, 50)) {
      const daysInactive = m.last_active_at
        ? Math.floor((Date.now() - new Date(m.last_active_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999
      const greeted = m.greeted_at ? 'sudah disambut' : 'belum disambut'
      lines.push(`  ${m.display_name} | ${greeted} | terakhir aktif: ${daysInactive === 999 ? 'belum pernah' : daysInactive + ' hari lalu'} | join: ${m.joined_at ? new Date(m.joined_at).toLocaleDateString('id-ID') : '—'}`)
    }
    if (wagMembers.length > 50) lines.push(`  ... dan ${wagMembers.length - 50} agen lainnya`)
    lines.push('')
  }

  // Raw messages
  if (messages && messages.length > 0) {
    lines.push(`--- PESAN TERBARU (${messages.length} pesan) ---`)
    for (const m of messages) {
      const wag = (wags || []).find(w => w.id === m.wag_id)
      lines.push(`[${new Date(m.sent_at).toLocaleDateString('id-ID')} ${m.week_key}] WAG:${wag?.name || '?'} | ${m.sender_type === 'ranger' ? 'RANGER' : 'agen'} ${m.sender_name}: ${m.content?.slice(0, 100) || '(media)'}`)
    }
    lines.push('')
  }

  // Observers
  if (observers && observers.length > 0) {
    lines.push('--- OBSERVER (DIABAIKAN DARI ANALISIS) ---')
    for (const o of observers) {
      const wag = (wags || []).find(w => w.id === o.wag_id)
      lines.push(`${o.display_name} | WAG: ${wag?.name || '—'} | ${o.note || ''}`)
    }
    lines.push('')
  }

  // Last recommendation
  if (lastRec) {
    lines.push('--- REKOMENDASI AI TERAKHIR ---')
    lines.push(`Generate: ${new Date(lastRec.generated_at).toLocaleString('id-ID')}`)
    for (const item of lastRec.items || []) {
      const unitName = item.wag || item.ranger
      lines.push(`${unitName} [${item.priority}]: ${item.title}`)
      lines.push(`  ${item.body}`)
    }
    lines.push('')
  }

  // Data Transaksi — 14H
  if (dateData?.metric_date) {
    lines.push('--- DATA TRANSAKSI AGEN (14H) ---')
    lines.push(`Data per: ${dateData.metric_date}`)
    lines.push('Distribusi bucket agen:')
    lines.push(`  Productive: ${bucketCount['productive'] || 0} agen`)
    lines.push(`  Moderate:   ${bucketCount['moderate'] || 0} agen`)
    lines.push(`  Sporadic:   ${bucketCount['sporadic'] || 0} agen`)
    lines.push(`  Total agen aktif 14H: ${(bucketRaw ?? []).length}`)
    lines.push('')

    // Performa per Mitra — 14H + MTD sekaligus
    if (mitraStats && mitraStats.length > 0) {
      lines.push('Performa per Mitra (14H dan MTD):')
      for (const m of mitraStats) {
        const mtd = mitraMtdMap[m.mitra]
        const mtdStr = mtd
          ? ` | MTD: ${mtd.trx} TRX | ${fmt(mtd.fee)} fee | ${fmt(mtd.amount)} amount`
          : ''
        lines.push(`  ${m.mitra}: 14H → ${m.active_agents_14d} agen | ${m.total_trx_14d} TRX | ${fmt(m.total_fee_14d)} fee | Productive ${m.growing_pct}% | Sporadic ${m.declining_pct}%${mtdStr}`)
      }
      lines.push('')
    }

    // Top 10 agen platform (by TRX)
    if (topAgentsByTrx && topAgentsByTrx.length > 0) {
      lines.push('Top 10 agen platform — paling banyak TRX (14H):')
      for (const a of topAgentsByTrx) {
        lines.push(`  ${a.merchant_name} (${a.serial_number}) | Mitra: ${a.mitra} | ${a.total_trx} TRX | ${fmt(a.total_fee)} fee | ${a.bucket} | ${a.active_days_14} hari aktif`)
      }
      lines.push('')
    }

    // Top 5 agen per Mitra — supaya AI bisa jawab "top agen GMS/MAJU/dll"
    if (Object.keys(mitraAgentMap).length > 0) {
      lines.push('Top 5 agen per Mitra — berdasarkan TRX (14H):')
      for (const [mitraName, agents] of Object.entries(mitraAgentMap)) {
        lines.push(`  ${mitraName}:`)
        for (const a of agents) {
          lines.push(`    ${a.merchant_name} (${a.serial_number}) | ${a.trx} TRX | ${fmt(a.amount)} amount | ${fmt(a.fee)} fee`)
        }
      }
      lines.push('')
    }

    // Target TRX Transfer per Mitra bulan ini — hanya Mitra yang ada targetnya
    if (mitraTargetProgress && mitraTargetProgress.length > 0) {
      lines.push('Target TRX Transfer per Mitra bulan ini (hanya Mitra yang ada target):')
      for (const t of mitraTargetProgress) {
        const avgDekade = Number(t.avg_trx_current_dekade ?? 0)
        const projected = avgDekade > 0
          ? Math.round(t.actual_trx_mtd + avgDekade * (t.days_in_month - t.days_elapsed))
          : Math.round(t.actual_trx_mtd / Math.max(t.days_elapsed, 1) * t.days_in_month)
        const ontrackPct = Number(t.ontrack_threshold ?? 90)
        const atriskPct  = Number(t.atrisk_threshold ?? 70)
        const projPct    = t.target_trx > 0 ? (projected / t.target_trx) * 100 : 0
        const prediksi   = projPct >= ontrackPct ? 'ON TRACK ✅' : projPct >= atriskPct ? 'AT RISK ⚠️' : 'JAUH DARI TARGET 🔴'
        lines.push(`  ${t.mitra}: target ${t.target_trx.toLocaleString()} TRX | aktual MTD ${t.actual_trx_mtd.toLocaleString()} TRX | achievement ${t.achievement_pct}% | proyeksi akhir bulan ${projected.toLocaleString()} TRX (${Math.round(projPct)}% dari target) | prediksi: ${prediksi} | hari berjalan ${t.days_elapsed}/${t.days_in_month}`)
      }
      lines.push('')
    }

    // Achievement historis per Mitra — dari snapshot bulanan (am_monthly_summary) + target (am_mitra_targets)
    if (mitraHistorisSnap && mitraHistorisSnap.length > 0) {
      // Gabungkan snapshot + target per mitra+bulan
      const histMap = new Map<string, { mitra: string; year: number; month: number; actual: number; target: number | null }>()
      for (const s of mitraHistorisSnap) {
        const k = `${s.mitra}||${s.period_year}||${s.period_month}`
        histMap.set(k, { mitra: s.mitra, year: s.period_year, month: s.period_month, actual: Number(s.trx_transfer), target: null })
      }
      for (const t of mitraHistorisTarget ?? []) {
        const k = `${t.mitra}||${t.period_year}||${t.period_month}`
        const ex = histMap.get(k)
        if (ex) ex.target = Number(t.target_trx)
        else histMap.set(k, { mitra: t.mitra, year: t.period_year, month: t.period_month, actual: 0, target: Number(t.target_trx) })
      }
      // Kelompokkan per bulan supaya ringkas
      const byMonth = new Map<string, typeof histMap extends Map<string, infer V> ? V[] : never>()
      for (const v of histMap.values()) {
        const mk = `${v.year}-${String(v.month).padStart(2,'0')}`
        if (!byMonth.has(mk)) byMonth.set(mk, [])
        byMonth.get(mk)!.push(v)
      }
      const BULAN = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
      lines.push('Achievement historis TRX Transfer per Mitra (dari snapshot bulanan):')
      for (const [mk, rows] of Array.from(byMonth.entries()).sort()) {
        const [yr, mo] = mk.split('-')
        lines.push(`  ${BULAN[parseInt(mo)]} ${yr}:`)
        const sumActual = rows.reduce((s,r) => s + r.actual, 0)
        const sumTarget = rows.filter(r => r.target !== null).reduce((s,r) => s + (r.target ?? 0), 0)
        for (const r of rows.sort((a,b) => a.mitra.localeCompare(b.mitra))) {
          const pctStr = r.target ? ` (${Math.round(r.actual/r.target*100)}% dari target ${r.target.toLocaleString()})` : ' (tidak ada target)'
          lines.push(`    ${r.mitra}: ${r.actual.toLocaleString()} TRX${pctStr}`)
        }
        if (sumTarget > 0) {
          lines.push(`    → TOTAL: ${sumActual.toLocaleString()} / ${sumTarget.toLocaleString()} TRX = ${Math.round(sumActual/sumTarget*100)}% overall achievement`)
        }
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}
