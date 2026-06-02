import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { formatWeekKey } from '@/lib/utils'

type Metric = {
  week_key: string
  active_days: number
  total_messages: number
  participation_rate: number
  proactive_posts: number
  dormant_actioned: number
  avg_response_hrs: number
  status: string
}

type RangerDetail = {
  id: string
  full_name: string
  display_name: string
  phone_number: string
  wags: { id: string; name: string }
  weekly_metrics: Metric[]
}

type Member = {
  id: string
  display_name: string
  status: string
  last_active_at: string
  joined_at: string
  greeted_at: string | null
}

const statusConfig = {
  critical: { label: 'Kritis', bg: '#FDECEA', color: '#B00020' },
  warning: { label: 'Waspada', bg: '#FFF3CD', color: '#856404' },
  healthy: { label: 'Sehat', bg: '#EAF3DE', color: '#27500A' },
}

export default function RangerDetail() {
  const router = useRouter()
  const { id } = router.query
  const [ranger, setRanger] = useState<RangerDetail | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [topMembers, setTopMembers] = useState<{ display_name: string; total: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetchRanger(id as string)
  }, [id])

  const fetchRanger = async (rangerId: string) => {
    const { data: rangerData } = await supabase
      .from('rangers')
      .select('id, full_name, display_name, phone_number, wags(id, name), weekly_metrics(week_key, active_days, total_messages, participation_rate, proactive_posts, dormant_actioned, avg_response_hrs, status)')
      .eq('id', rangerId)
      .single()

    if (rangerData) {
      setRanger(rangerData as unknown as RangerDetail)
      const wagId = (rangerData as unknown as RangerDetail).wags?.id
      if (wagId) {
        const [memberRes, msgRes] = await Promise.all([
          supabase.from('members').select('id, display_name, status, last_active_at, joined_at, greeted_at').eq('wag_id', wagId).order('last_active_at', { ascending: false }),
          supabase.from('messages').select('sender_name').eq('wag_id', wagId).eq('sender_type', 'member'),
        ])
        if (memberRes.data) setMembers(memberRes.data as Member[])
        if (msgRes.data) {
          const counts = msgRes.data.reduce((acc: Record<string, number>, m) => {
            acc[m.sender_name] = (acc[m.sender_name] || 0) + 1
            return acc
          }, {})
          const sorted = Object.entries(counts)
            .map(([display_name, total]) => ({ display_name, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 3)
          setTopMembers(sorted)
        }
      }
    }
    setLoading(false)
  }

  if (loading) return <Layout title="Detail Ranger"><div style={{ color: '#999', fontSize: '13px' }}>Memuat data...</div></Layout>
  if (!ranger) return <Layout title="Detail Ranger"><div style={{ color: '#999', fontSize: '13px' }}>Ranger tidak ditemukan</div></Layout>

  const sortedMetrics = [...(ranger.weekly_metrics || [])].sort((a, b) => a.week_key.localeCompare(b.week_key))
  const latest = sortedMetrics[sortedMetrics.length - 1]
  const status = (latest?.status || 'healthy') as keyof typeof statusConfig
  const s = statusConfig[status]
  const maxMsg = Math.max(...sortedMetrics.map(m => m.total_messages), 1)

  const barMetrics = [
    { label: 'Hari aktif', value: latest?.active_days ?? 0, pct: ((latest?.active_days ?? 0) / 7) * 100 },
    { label: 'Total pesan', value: latest?.total_messages ?? 0, pct: ((latest?.total_messages ?? 0) / 50) * 100 },
    { label: 'Proactive posts', value: latest?.proactive_posts ?? 0, pct: ((latest?.proactive_posts ?? 0) / 30) * 100 },
    { label: 'Participation rate', value: `${latest?.participation_rate ?? 0}%`, pct: latest?.participation_rate ?? 0 },
  ]

  const dormantMembers = members.filter(m => {
    if (!m.last_active_at) return true
    return (Date.now() - new Date(m.last_active_at).getTime()) / (1000 * 60 * 60 * 24) > 14
  })

  const ungretedMembers = members.filter(m => !m.greeted_at)

  return (
    <Layout title={ranger.full_name}>
      <div onClick={() => router.push('/ranger')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0344D8', cursor: 'pointer', marginBottom: '16px' }}>
        ← Kembali ke daftar Ranger
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '600' }}>
          {ranger.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '600' }}>{ranger.full_name}</div>
          <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
            {ranger.wags?.name} &nbsp;·&nbsp; {members.length} agen &nbsp;·&nbsp; display: {ranger.display_name}
          </div>
          {latest && (
            <div style={{ fontSize: '11px', color: '#bbb', marginTop: '2px' }}>
              Periode: {formatWeekKey(latest.week_key)}
            </div>
          )}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 14px', borderRadius: '999px', background: s.bg, color: s.color, fontWeight: '500' }}>
          {s.label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Hari aktif (minggu ini)', value: `${latest?.active_days ?? 0}/7`, color: (latest?.active_days ?? 0) <= 2 ? '#B00020' : (latest?.active_days ?? 0) <= 4 ? '#856404' : '#27500A' },
          { label: 'Total pesan (minggu ini)', value: latest?.total_messages ?? 0, color: (latest?.total_messages ?? 0) < 3 ? '#B00020' : (latest?.total_messages ?? 0) < 10 ? '#856404' : '#27500A' },
          { label: 'Participation rate', value: `${latest?.participation_rate ?? 0}%`, color: (latest?.participation_rate ?? 0) < 40 ? '#B00020' : '#27500A' },
        ].map(m => (
          <div key={m.label} style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '6px' }}>{m.label}</div>
            <div style={{ fontSize: '26px', fontWeight: '600', color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Metrik minggu terakhir</div>
          {barMetrics.map(m => (
            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#999', width: '120px', flexShrink: 0 }}>{m.label}</div>
              <div style={{ flex: 1, height: '6px', background: '#F8F9FB', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(m.pct, 100)}%`, height: '100%', background: m.pct < 30 ? '#E24B4A' : m.pct < 60 ? '#FFC128' : '#0344D8', borderRadius: '3px' }} />
              </div>
              <div style={{ fontSize: '12px', fontWeight: '500', width: '36px', textAlign: 'right' }}>{m.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Tren total pesan — {sortedMetrics.length} periode</div>
          {sortedMetrics.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#999' }}>Belum ada data</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '80px' }}>
                {sortedMetrics.map(m => {
                  const pct = (m.total_messages / maxMsg) * 100
                  const barColor = m.status === 'critical' ? '#E24B4A' : m.status === 'warning' ? '#FFC128' : '#0344D8'
                  return (
                    <div key={m.week_key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ fontSize: '10px', fontWeight: '500', color: barColor }}>{m.total_messages}</div>
                      <div style={{ width: '100%', height: `${Math.max(pct, 5)}%`, background: barColor, borderRadius: '3px 3px 0 0' }} />
                      <div style={{ fontSize: '9px', color: '#999', whiteSpace: 'nowrap' }}>{formatWeekKey(m.week_key)}</div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '12px' }}>
            Tidak aktif &gt; 14 hari
            <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: dormantMembers.length > 0 ? '#FDECEA' : '#EAF3DE', color: dormantMembers.length > 0 ? '#B00020' : '#27500A' }}>
              {dormantMembers.length}
            </span>
          </div>
          {dormantMembers.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#999' }}>Semua agen aktif 👍</div>
          ) : (
            dormantMembers.slice(0, 5).map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: '12px' }}>
                <span style={{ fontWeight: '500' }}>{m.display_name}</span>
                <span style={{ color: '#999' }}>
                  {m.last_active_at ? `${Math.floor((Date.now() - new Date(m.last_active_at).getTime()) / (1000 * 60 * 60 * 24))} hari` : 'Belum aktif'}
                </span>
              </div>
            ))
          )}
        </div>

        <div style={{ background: '#F
