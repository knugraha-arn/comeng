import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'

const rangers = Array.from({ length: 50 }, (_, i) => {
  const names = ['Andi','Budi','Citra','Dedi','Eka','Fajar','Gina','Hadi','Indah','Joko','Kiki','Lina','Mira','Nana','Oki','Prita','Rudi','Sari','Tono','Umar','Vivi','Wati','Yudi','Zara','Agus','Bela','Dian','Erni','Gita','Hendra','Ika','Jaya','Koko','Lia','Miko','Nina','Oscar','Putri','Raka','Sinta','Tedi','Vera','Wira','Yoga','Zahra','Bayu','Ciko','Dewi','Fandi','Gilang']
  const statuses = ['critical','critical','warning','warning','warning','healthy','healthy','healthy','healthy','healthy']
  const status = statuses[Math.floor(Math.random() * statuses.length)]
  const days = status === 'critical' ? Math.floor(Math.random() * 2) + 1 : status === 'warning' ? Math.floor(Math.random() * 3) + 2 : Math.floor(Math.random() * 2) + 5
  const onboarding = status === 'critical' ? Math.floor(Math.random() * 30) + 10 : status === 'warning' ? Math.floor(Math.random() * 30) + 40 : Math.floor(Math.random() * 20) + 70
  const response = status === 'critical' ? '>24j' : status === 'warning' ? `${Math.floor(Math.random() * 10) + 8}j` : `${Math.floor(Math.random() * 5) + 1}j`
  return {
    id: i + 1,
    name: `Ranger ${names[i]}`,
    status,
    days,
    onboarding,
    response,
    agents: Math.floor(Math.random() * 30) + 10,
  }
})

const statusConfig = {
  critical: { label: 'Kritis', bg: '#FDECEA', color: '#B00020' },
  warning: { label: 'Waspada', bg: '#FFF3CD', color: '#856404' },
  healthy: { label: 'Sehat', bg: '#EAF3DE', color: '#27500A' },
}

const PER_PAGE = 10

export default function RangerPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('semua')
  const [page, setPage] = useState(1)

  const filtered = rangers.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'semua' || r.status === filter
    return matchSearch && matchFilter
  })

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <Layout title="Efektivitas Ranger">
      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Cari nama Ranger..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #e5e5e5',
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: '12px', color: '#999', whiteSpace: 'nowrap' }}>
          {filtered.length} Ranger
        </span>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {[
          { key: 'semua', label: 'Semua' },
          { key: 'critical', label: '● Kritis' },
          { key: 'warning', label: '● Waspada' },
          { key: 'healthy', label: '● Sehat' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1) }}
            style={{
              padding: '5px 14px',
              borderRadius: '999px',
              border: '1px solid',
              borderColor: filter === f.key ? '#0344D8' : '#e5e5e5',
              background: filter === f.key ? '#0344D8' : '#FFFFFF',
              color: filter === f.key ? '#FFFFFF' : '#555',
              fontSize: '12px',
              cursor: 'pointer',
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
              {['Ranger', 'Status', 'Hari Aktif', 'Onboarding', 'Avg Respons', 'Agen', ''].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#999', fontWeight: '500' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((r) => {
              const s = statusConfig[r.status as keyof typeof statusConfig]
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/ranger/${r.id}`)}
                  style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F8F9FB')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 14px', fontWeight: '500' }}>{r.name}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: s.bg, color: s.color, fontWeight: '500' }}>
                      {s.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: r.days <= 2 ? '#B00020' : r.days <= 4 ? '#856404' : '#27500A' }}>
                    {r.days}/7 hari
                  </td>
                  <td style={{ padding: '12px 14px', color: r.onboarding < 40 ? '#B00020' : r.onboarding < 70 ? '#856404' : '#27500A' }}>
                    {r.onboarding}%
                  </td>
                  <td style={{ padding: '12px 14px' }}>{r.response}</td>
                  <td style={{ padding: '12px 14px', color: '#999' }}>{r.agents}</td>
                  <td style={{ padding: '12px 14px', color: '#0344D8', fontSize: '12px' }}>Detail →</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '14px', alignItems: 'center' }}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid',
              borderColor: page === p ? '#0344D8' : '#e5e5e5',
              background: page === p ? '#0344D8' : '#FFFFFF',
              color: page === p ? '#FFFFFF' : '#555',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: page === p ? '500' : '400',
            }}
          >
            {p}
          </button>
        ))}
        <span style={{ fontSize: '12px', color: '#999', marginLeft: '4px' }}>
          dari {totalPages} halaman
        </span>
      </div>
    </Layout>
  )
}
