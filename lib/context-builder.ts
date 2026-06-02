import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function buildContext(wagId?: string): Promise<string> {
  // 1. Fetch semua WAG aktif
  const { data: wags } = await supabase
    .from('wags')
    .select('id, name, status, last_processed_at')
    .eq('status', 'active')

  // 2. Fetch semua Ranger aktif
  const { data: rangers } = await supabase
    .from('rangers')
    .select('id, full_name, display_name, phone_number, wag_id, wags(name)')
    .eq('status', 'active')

  // 3. Fetch weekly metrics — 8 minggu terakhir per Ranger
  const { data: metrics } = await supabase
    .from('weekly_metrics')
    .select('wag_id, ranger_id, week_key, active_days, total_messages, participation_rate, proactive_posts, dormant_rate, unresponded_rate, status')
    .order('week_key', { ascending: false })

  // 4. Fetch members
  const { data: members } = await supabase
    .from('members')
    .select('wag_id, display_name, status, last_active_at, greeted_at, joined_at')
    .order('last_active_at', { ascending: false })

  // 5. Fetch raw messages — dibatasi per WAG kalau wagId ada, atau 500 pesan terbaru
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

  // 6. Fetch rekomendasi terakhir
  const { data: lastRec } = await supabase
    .from('recommendations')
    .select('week_key, generated_at, items')
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  // 7. Fetch observers
  const { data: observers } = await supabase
    .from('observers')
    .select('wag_id, display_name, note')

  // Build context string
  const lines: string[] = []

  lines.push('=== DATA PLATFORM AMARIS ===')
  lines.push(`Diambil pada: ${new Date().toLocaleString('id-ID')}`)
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
      lines.push(`${item.ranger} [${item.priority}]: ${item.title}`)
      lines.push(`  ${item.body}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
