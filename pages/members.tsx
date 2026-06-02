import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type MemberAlert = {
  id: string
  display_name: string
  status: string
  last_active_at: string | null
  joined_at: string | null
  greeted_at: string | null
  wag_name: string
  ranger_name: string
  signal: 'ungreeted' | 'dormant' | 'active'
  days_inactive: number
}

export default function MembersPage() {
  const [members, setMembers] = useState<MemberAlert[]>([])
  const [filtered, setFiltered] = useState<MemberAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('semua')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchMembers() }, [])

  useEffect(() => {
    let result = members
    if (filter === 'ungreeted') result = result.filter(m => m.signal === 'ungreeted')
    else if (filter === 'dormant') result = result.filter(m => m.signal === 'dormant')
    if (search) result = result.filter(m =>
      m.display_name.toLowerCase().includes(search.toLowerCase()) ||
      m.wag_name.toLowerCase().includes(search.toLowerCase())
    )
    setFiltered(result)
  }, [filter, search, members])

  const fetchMembers = async () => {
    const { data: wags } = await supabase
      .from('wags')
      .select('id, name, rangers(full_name)')
      .eq('status', 'active')

    if (!wags) { setLoading(false); return }

    const allMembers: MemberAlert[] = []

    for (const wag of wags) {
      const w = wag as unknown as { id: string; name: string; rangers: { full_name: string }[] }
      const { data: memberData } = await supabase
        .from('members')
        .select('id, display_name, status, last_active_at, joined_at, greeted_at')
        .eq('wag_id', w.id)

      if (!memberData) continue

      for (const m of memberData) {
        const daysInactive = m.last_active_at
          ? Math.floor((Date.now() - new Date(m.last_active_at).getTime()) / (1000 * 60 * 60 * 24))
          : 999

        let signal: 'ungreeted' | 'dormant' | 'active' = 'active'
        if (!m.greeted_at) signal = 'ungreeted'
        else if (daysInactive > 14) signal = 'dormant'

        allMembers.push({
          ...m,
          wag_name: w.name,
          ranger_name: w.rangers?.[0]?.full_name || '—',
          signal,
          days_inactive: daysInactive,
        })
      }
    }

    // Sort: ungreeted dulu, lalu dormant, lalu active — dalam tiap grup sort by days_inactive desc
    allMembers.sort((a, b) => {
      const order = { ungreeted: 0, dormant: 1, active: 2 }
      if (order[a.signal] !== order[b.signal]) return order[a.signal] - order[b.signal]
      return b.days_inactive - a.days_inactive
    })

    setMembers(allMembers)
    setFiltered(allMembers)
    setLoading(false)
  }

  const signalConfig = {
    ungreeted: { label: 'Belum disambut', bg: '#FDECEA', color: '#B00020', dot: '#E24B4A' },
    dormant: { label: 'Dormant', bg: '#FFF3CD', color: '#856404', dot: '#FFC128' },
    active: { label: 'Aktif', bg: '#EAF3DE', color: '#27500A', dot: '#639922' },
  }

  const counts = {
    ungreeted: members.filter(m => m.signal === 'ungreeted').length,
    dormant: members.filter(m => m.signal === 'dormant').length,
    active: members.filter(m => m.signal === 'active').length,
  }

  if (loading) return (
    <Layout title="Member Alert">
      <div style={{ color: '#999', fontSize: '13px' }}>Memuat data...</div>
    </Layout>
  )

  return (
    <Layout title="Member Alert">

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Belum disambut', value: counts.ungreeted, bg: '#FDECEA', color: '#B00020', sub: 'agen perlu disapa' },
          { label: 'Dormant > 14 hari', value: counts.dormant, bg: '#FFF3CD', color: '#856404', sub: 'agen tidak aktif' },
          { label: 'Aktif', value: counts.active, bg: '#EAF3DE', color: '#27500A', sub: 'agen dalam 14 hari' },
        ].map(c => (
          <div key={c.label} style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '6px' }}>{c.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '600', color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter & search */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Cari nama agen atau WAG..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', outline: 'none' }}
        />
        <span style={{ fontSize: '12px', color: '#999', whiteSpace: 'nowrap' }}>{filtered.length} agen</span>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {[
          { key: 'semua', label: 'Semua' },
          { key: 'ungreeted', label: `● Belum disambut (${counts.ungreeted})` },
          { key: 'dormant', label: `● Dormant (${counts.dormant})` },
          { key: 'active', label: `● Aktif (${counts.active})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '5px 14px', borderRadius: '999px', border: '1px solid',
              borderColor: filter === f.key ? '#0344D8' : '#e5e5e5',
              background: filter === f.key ? '#0344D8' : '#FFFFFF',
              color: filter === f.key ? '#FFFFFF' : '#555',
              fontSize: '12px', cursor: 'pointer',
              fontWeight: filter === f.key ? '500' : '400',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
              {['Agen', 'WAG', 'Ranger', 'Status', 'Tidak aktif', 'Join', 'Disambut'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#999', fontWeight: '500' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                Tidak ada data
              </td></tr>
            )}
            {filtered.map(m => {
              const sig = signalConfig[m.signal]
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid #f5f5f5' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8F9FB')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: sig.dot, minWidth: '7px' }} />
                      <span style={{ fontWeight: '500' }}>{m.display_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '11px 14px', color: '#555', fontSize: '12px' }}>{m.wag_name}</td>
                  <td style={{ padding: '11px 14px', color: '#555', fontSize: '12px' }}>{m.ranger_name}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: sig.bg, color: sig.color, fontWeight: '500' }}>
                      {sig.label}
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px', color: m.days_inactive > 14 ? '#B00020' : '#999', fontSize: '12px' }}>
                    {m.days_inactive === 999 ? 'Belum pernah' : `${m.days_inactive} hari`}
                  </td>
                  <td style={{ padding: '11px 14px', color: '#999', fontSize: '12px' }}>
                    {m.joined_at ? new Date(m.joined_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                  </td>
                  <td style={{ padding: '11px 14px', color: '#999', fontSize: '12px' }}>
                    {m.greeted_at ? new Date(m.greeted_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' }) : (
                      <span style={{ color: '#B00020' }}>Belum</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </Layout>
  )
}
