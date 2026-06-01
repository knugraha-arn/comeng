import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type WagHealth = {
  id: string
  name: string
  status: string
  last_processed_at: string
  weekly_metrics: {
    week_key: string
    active_days: number
    total_messages: number
    participation_rate: number
    status: string
  }[]
  rangers: {
    full_name: string
    display_name: string
  }[]
}

type Alert = {
  type: 'critical' | 'warning'
  title: string
  desc: string
  href: string
}

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [wags, setWags] = useState<WagHealth[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [stats, setStats] = useState({ totalWags: 0, totalRangers: 0, needAttention: 0, uploadsThisWeek: 0 })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      fetchData()
    })
  }, [router])

  const fetchData = async () => {
    const [wagRes, uploadRes] = await Promise.all([
      supabase.from('wags')
        .select('id, name, status, last_processed_at, weekly_metrics(week_key, active_days, total_messages, participation_rate, status), rangers(full_name, display_name)')
        .eq('status', 'active'),
      supabase.from('uploads')
        .select('id')
        .eq('status', 'done')
        .gte('uploaded_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ])

    const wagData = (wagRes.data || []) as WagHealth[]
    setWags(wagData)

    // Hitung stats
    const needAttention = wagData.filter(w => {
      const latest = w.weekly_metrics?.sort((a, b) => b.week_key.localeCompare(a.week_key))[0]
      return latest?.status === 'critical' || latest?.status === 'warning'
    }).length

    setStats({
      totalWags: wagData.length,
      totalRangers: wagData.reduce((acc, w) => acc + (w.rangers?.length || 0), 0),
      needAttention,
      uploadsThisWeek: uploadRes.data?.length || 0,
    })

    // Build alerts
    const newAlerts: Alert[] = []
    for (const wag of wagData) {
      const latest = wag.weekly_metrics?.sort((a, b) => b.week_key.localeCompare(a.week_key))[0]
      if (latest?.status === 'critical') {
        newAlerts.push({
          type: 'critical',
          title: `${wag.rangers?.[0]?.full_name || wag.name} — Aktivitas sangat rendah`,
          desc: `${latest.total_messages} pesan minggu ini · ${latest.active_days} hari aktif · Perlu perhatian segera`,
          href: '/ranger',
        })
      } else if (latest?.status === 'warning') {
        newAlerts.push({
          type: 'warning',
          title: `${wag.rangers?.[0]?.full_name || wag.name} — Aktivitas menurun`,
          desc: `${latest.total_messages} pesan minggu ini · ${latest.active_days} hari aktif`,
          href: '/ranger',
        })
      }
    }
    setAlerts(newAlerts)
    setLoading(false)
  }

  const getWagStatus = (wag: WagHealth) => {
    const latest = wag.weekly_metrics?.sort((a, b) => b.week_key.localeCompare(a.week_key))[0]
    return latest?.status || 'healthy'
  }

  const dotColor = { critical: '#E24B4A', warning: '#FFC128', healthy: '#639922' }
  const statusLabel = { critical: 'Kritis', warning: 'Waspada', healthy: 'Sehat' }
  const statusBg = { critical: '#FDECEA', warning: '#FFF3CD', healthy: '#EAF3DE' }
  const statusColor = { critical: '#B00020', warning: '#856404', healthy: '#27500A' }

  if (loading) return (
    <Layout title="Overview komunitas">
      <div style={{ color: '#999', fontSize: '13px' }}>Memuat data...</div>
    </Layout>
  )

  return (
    <Layout title="Overview komunitas">

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total WAG aktif', value: stats.totalWags, sub: 'komunitas' },
          { label: 'Total Ranger', value: stats.totalRangers, sub: 'aktif' },
          { label: 'Perlu perhatian', value: stats.needAttention, sub: 'WAG', color: stats.needAttention > 0 ? '#B00020' : '#27500A' },
          { label: 'Upload minggu ini', value: stats.uploadsThisWeek, sub: 'file', color: stats.uploadsThisWeek > 0 ? '#27500A' : '#856404' },
        ].map((card) => (
          <div key={card.label} style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '6px' }}>{card.label}</div>
            <div style={{ fontSize: '28px', fontWeight: '600', color: card.color ?? '#000000' }}>{card.value}</div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Status komunitas */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Status komunitas</div>
          {wags.length === 0 && (
            <div style={{ fontSize: '12px', color: '#999' }}>Belum ada WAG — tambahkan di Konfigurasi</div>
          )}
          {wags.map(w => {
            const status = getWagStatus(w) as keyof typeof dotColor
            const latest = w.weekly_metrics?.sort((a, b) => b.week_key.localeCompare(a.week_key))[0]
            return (
              <div
                key={w.id}
                onClick={() => router.push('/ranger')}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor[status], minWidth: '8px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '500' }}>{w.name}</div>
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                    {w.rangers?.[0]?.full_name || '—'} &nbsp;·&nbsp;
                    {latest ? `${latest.total_messages} pesan · ${latest.active_days} hari aktif` : 'Belum ada data'}
                  </div>
                </div>
                <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: statusBg[status], color: statusColor[status], fontWeight: '500', whiteSpace: 'nowrap' }}>
                  {statusLabel[status]}
                </span>
              </div>
            )
          })}
        </div>

        {/* Tren 4 minggu */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Tren aktivitas Ranger — 4 minggu</div>
          {wags.map(w => {
            const metrics = [...(w.weekly_metrics || [])].sort((a, b) => a.week_key.localeCompare(b.week_key)).slice(-4)
            const maxMsg = Math.max(...metrics.map(m => m.total_messages), 1)
            return (
              <div key={w.id} style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>{w.rangers?.[0]?.full_name || w.name}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '60px' }}>
                  {metrics.map(m => {
                    const pct = (m.total_messages / maxMsg) * 100
                    const barColor = m.status === 'critical' ? '#E24B4A' : m.status === 'warning' ? '#FFC128' : '#0344D8'
                    return (
                      <div key={m.week_key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', height: '100%', justifyContent: 'flex-end' }}>
                        <div style={{ fontSize: '10px', fontWeight: '500', color: barColor }}>{m.total_messages}</div>
                        <div style={{ width: '100%', height: `${Math.max(pct, 5)}%`, background: barColor, borderRadius: '3px 3px 0 0' }} />
                        <div style={{ fontSize: '9px', color: '#999', whiteSpace: 'nowrap' }}>{m.week_key.replace('2026-', '')}</div>
                      </div>
                    )
                  })}
                  {metrics.length === 0 && <div style={{ fontSize: '12px', color: '#999' }}>Belum ada data</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '12px' }}>Yang perlu tindakan sekarang</div>
          {alerts.map((alert, i) => (
            <div
              key={i}
              onClick={() => router.push(alert.href)}
              style={{
                display: 'flex', gap: '12px', padding: '12px 14px', borderRadius: '10px', marginBottom: '8px', cursor: 'pointer',
                background: alert.type === 'critical' ? '#FDECEA' : '#FFF3CD',
                border: `1px solid ${alert.type === 'critical' ? '#F09595' : '#FAC775'}`,
              }}
            >
              <div style={{ fontSize: '16px', marginTop: '1px' }}>{alert.type === 'critical' ? '🔴' : '🟡'}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', color: alert.type === 'critical' ? '#791F1F' : '#633806' }}>{alert.title}</div>
                <div style={{ fontSize: '11px', color: alert.type === 'critical' ? '#A32D2D' : '#854F0B', marginTop: '3px' }}>{alert.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

    </Layout>
  )
}
