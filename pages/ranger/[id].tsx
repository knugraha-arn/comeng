import { useRouter } from 'next/router'
import Layout from '@/components/Layout'

const statusConfig = {
  critical: { label: 'Kritis', bg: '#FDECEA', color: '#B00020' },
  warning: { label: 'Waspada', bg: '#FFF3CD', color: '#856404' },
  healthy: { label: 'Sehat', bg: '#EAF3DE', color: '#27500A' },
}

const sampleData = {
  critical: { days: 1, onboarding: 30, response: '>24j', proactive: 1, dormant: 0, status: 'critical' },
  warning: { days: 3, onboarding: 55, response: '12j', proactive: 4, dormant: 1, status: 'warning' },
  healthy: { days: 6, onboarding: 87, response: '3.2j', proactive: 11, dormant: 3, status: 'healthy' },
}

const weeklyTrend = [
  { week: '12 Mei', days: 5 },
  { week: '19 Mei', days: 4 },
  { week: '26 Mei', days: 2 },
  { week: '2 Jun', days: 1 },
]

export default function RangerDetail() {
  const router = useRouter()
  const { id } = router.query
  const idNum = parseInt(id as string) || 1

  const names = ['Andi','Budi','Citra','Dedi','Eka','Fajar','Gina','Hadi','Indah','Joko','Kiki','Lina','Mira','Nana','Oki','Prita','Rudi','Sari','Tono','Umar','Vivi','Wati','Yudi','Zara','Agus','Bela','Dian','Erni','Gita','Hendra','Ika','Jaya','Koko','Lia','Miko','Nina','Oscar','Putri','Raka','Sinta','Tedi','Vera','Wira','Yoga','Zahra','Bayu','Ciko','Dewi','Fandi','Gilang']
  const statuses = ['critical','critical','warning','warning','warning','healthy','healthy','healthy','healthy','healthy']
  const status = statuses[(idNum - 1) % statuses.length] as keyof typeof statusConfig
  const data = sampleData[status]
  const s = statusConfig[status]
  const name = `Ranger ${names[(idNum - 1) % names.length]}`

  const metrics = [
    { label: 'Hari aktif minggu ini', value: `${data.days}/7`, color: data.days <= 2 ? '#B00020' : data.days <= 4 ? '#856404' : '#27500A' },
    { label: 'Onboarding rate', value: `${data.onboarding}%`, color: data.onboarding < 40 ? '#B00020' : data.onboarding < 70 ? '#856404' : '#27500A' },
    { label: 'Avg respons', value: data.response, color: data.response === '>24j' ? '#B00020' : '#27500A' },
  ]

  const barMetrics = [
    { label: 'Hari aktif', value: data.days, max: 7, pct: (data.days / 7) * 100 },
    { label: 'Onboarding rate', value: `${data.onboarding}%`, max: 100, pct: data.onboarding },
    { label: 'Proactive posts', value: data.proactive, max: 20, pct: (data.proactive / 20) * 100 },
    { label: 'Reaktivasi dormant', value: data.dormant, max: 10, pct: (data.dormant / 10) * 100 },
  ]

  const maxDays = Math.max(...weeklyTrend.map(w => w.days))

  return (
    <Layout title={name}>
      {/* Back */}
      <div
        onClick={() => router.push('/ranger')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0344D8', cursor: 'pointer', marginBottom: '16px' }}
      >
        ← Kembali ke daftar Ranger
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          background: s.bg, color: s.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', fontWeight: '600',
        }}>
          {name.split(' ').map(w => w[0]).join('').slice(0, 2)}
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '600' }}>{name}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>WAG Jakarta · {Math.floor(Math.random() * 20) + 10} agen</div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 12px', borderRadius: '999px', background: s.bg, color: s.color, fontWeight: '500' }}>
          {s.label}
        </span>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '6px' }}>{m.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '600', color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        {/* Bar metrics */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Metrik minggu ini</div>
          {barMetrics.map((m) => (
            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#999', width: '120px', flexShrink: 0 }}>{m.label}</div>
              <div style={{ flex: 1, height: '6px', background: '#F8F9FB', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${m.pct}%`, height: '100%', background: m.pct < 30 ? '#B00020' : m.pct < 60 ? '#FFC128' : '#0344D8', borderRadius: '3px' }} />
              </div>
              <div style={{ fontSize: '12px', fontWeight: '500', width: '32px', textAlign: 'right' }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Weekly trend chart */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Tren 4 minggu — hari aktif</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '80px' }}>
            {weeklyTrend.map((w) => {
              const pct = (w.days / maxDays) * 100
              const barColor = w.days <= 2 ? '#B00020' : w.days <= 4 ? '#FFC128' : '#0344D8'
              return (
                <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: barColor }}>{w.days}</div>
                  <div style={{ width: '100%', height: `${pct}%`, background: barColor, borderRadius: '4px 4px 0 0', minHeight: '4px' }} />
                  <div style={{ fontSize: '10px', color: '#999', whiteSpace: 'nowrap' }}>{w.week}</div>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: '11px', color: '#999', marginTop: '10px', textAlign: 'center' }}>
            {data.days <= 2 ? 'Tren menurun — perlu perhatian segera' : data.days <= 4 ? 'Tren tidak konsisten' : 'Konsisten aktif'}
          </div>
        </div>
      </div>
    </Layout>
  )
}
