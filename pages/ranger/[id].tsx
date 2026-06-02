import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import WeeklyChart from '@/components/WeeklyChart'
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

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{ fontSize: '11px', color: '#bbb', cursor: 'help' }}>ⓘ</span>
      {show && (
        <div style={{
          position: 'absolute', left: '0', top: '20px', zIndex: 100,
          background: '#1A1F2E', color: '#FFFFFF', fontSize: '11px', lineHeight: '1.6',
          padding: '8px 12px', borderRadius: '8px', width: '240px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)', pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </div>
  )
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

  if (loading) return (
    <Layout title="Detail Ranger">
      <div style={{ color: '#999', fontSize: '13px' }}>Memuat data...</div>
    </Layout>
  )

  if (!ranger) return (
    <Layout title="Detail Ranger">
      <div style={{ color: '#999', fontSize: '13px' }}>Ranger tidak ditemukan</div>
    </Layout>
  )

  const sortedMetrics = [...(ranger.weekly_metrics || [])].sort((a, b) => a.week_key.localeCompare(b.week_key))
  const latest = sortedMetrics[sortedMetrics.length - 1]
  const status = (latest?.status || 'healthy') as keyof typeof statusConfig
  const s = statusConfig[status]

  const barMetrics = [
    { label: 'Hari aktif', value: latest?.active_days ?? 0, pct: ((latest?.active_days ?? 0) / 7) * 100, tooltip: 'Jumlah hari Ranger mengirim minimal 1 pesan di WAG. Target: ≥ 3 hari/minggu.' },
    { label: 'Total pesan', value: latest?.total_messages ?? 0, pct: ((latest?.total_messages ?? 0) / 50) * 100, tooltip: 'Total pesan Ranger di WAG minggu ini. Target: ≥ 10 pesan/minggu.' },
    { label: 'Proactive posts', value: latest?.proactive_posts ?? 0, pct: ((latest?.proactive_posts ?? 0) / 30) * 100, tooltip: 'Pesan inisiasi Ranger — bukan balasan. Tips, motivasi, info promo. Target: > 50% dari total.' },
    { label: 'Participation rate', value: `${latest?.participation_rate ?? 0}%`, pct: latest?.participation_rate ?? 0, tooltip: '% agen yang aktif mengirim pesan dalam 30 hari terakhir. Target: > 40%.' },
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

      {/* Header */}
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

      {/* Metric cards */}
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

        {/* Bar metrics */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Metrik minggu terakhir</div>
          {barMetrics.map(m => (
            <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '130px', flexShrink: 0 }}>
                <span style={{ fontSize: '12px', color: '#555' }}>{m.label}</span>
                <Tooltip text={m.tooltip} />
              </div>
              <div style={{ flex: 1, height: '6px', background: '#F8F9FB', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(m.pct, 100)}%`, height: '100%', background: m.pct < 30 ? '#E24B4A' : m.pct < 60 ? '#FFC128' : '#0344D8', borderRadius: '3px' }} />
              </div>
              <div style={{ fontSize: '12px', fontWeight: '500', width: '36px', textAlign: 'right' }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Weekly trend — pakai WeeklyChart */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>
            Tren total pesan
            <span style={{ fontSize: '11px', color: '#999', fontWeight: '400', marginLeft: '6px' }}>{sortedMetrics.length} periode</span>
          </div>
          {sortedMetrics.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#999' }}>Belum ada data</div>
          ) : (
            <WeeklyChart
              data={sortedMetrics.map(m => ({ week_key: m.week_key, value: m.total_messages, status: m.status }))}
              target={10}
              height={90}
            />
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>

        {/* Dormant */}
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

        {/* Ungreeted */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '12px' }}>
            Belum disambut
            <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: ungretedMembers.length > 0 ? '#FFF3CD' : '#EAF3DE', color: ungretedMembers.length > 0 ? '#856404' : '#27500A' }}>
              {ungretedMembers.length}
            </span>
          </div>
          {ungretedMembers.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#999' }}>Semua agen sudah disambut 👍</div>
          ) : (
            ungretedMembers.slice(0, 5).map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: '12px' }}>
                <span style={{ fontWeight: '500' }}>{m.display_name}</span>
                <span style={{ color: '#999' }}>
                  {m.joined_at ? new Date(m.joined_at).toLocaleDateString('id-ID') : '—'}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Top 3 */}
        <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '12px' }}>
            Top 3 agen paling aktif
            <span style={{ marginLeft: '8px', fontSize: '11px', color: '#999', fontWeight: '400' }}>all time</span>
          </div>
          {topMembers.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#999' }}>Belum ada data</div>
          ) : (
            topMembers.map((m, i) => (
              <div key={m.display_name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: i < topMembers.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: i === 0 ? '#D1EA2C' : i === 1 ? '#e5e5e5' : '#F8F9FB', color: i === 0 ? '#1A1F2E' : '#555', fontSize: '11px', fontWeight: '700', minWidth: '22px' }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.display_name}</div>
                <div style={{ fontSize: '12px', color: '#999', whiteSpace: 'nowrap' }}>{m.total} pesan</div>
              </div>
            ))
          )}
        </div>
      </div>

    </Layout>
  )
}
