import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import Layout from '@/components/Layout'

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
      } else {
        setLoading(false)
      }
    })
  }, [router])

  if (loading) return null

  return (
    <Layout title="Overview komunitas">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total WAG aktif', value: '2', sub: 'Pilot komunitas' },
          { label: 'Total Ranger', value: '2', sub: 'dari 50 target' },
          { label: 'Perlu perhatian', value: '1', color: '#E24B4A', sub: '1 kritis' },
          { label: 'Upload minggu ini', value: '2/2', color: '#3B6D11', sub: 'Lengkap' },
        ].map((card) => (
          <div key={card.label} style={{
            background: '#FFFFFF',
            border: '1px solid #e5e5e5',
            borderRadius: '10px',
            padding: '16px',
          }}>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '6px' }}>{card.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '600', color: card.color ?? '#000000' }}>{card.value}</div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Status komunitas</div>
        {[
          { dot: '#E24B4A', name: 'WAG Ranger Budi — Jakarta Barat', meta: 'Tidak aktif 9 hari · 6 agen belum disambut · 0 reaktivasi' },
          { dot: '#639922', name: 'WAG Ranger Sari — Tangerang', meta: 'Aktif 6 hari/minggu · Onboarding 87% · Respons avg 3.2 jam' },
        ].map((item) => (
          <div key={item.name} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 0',
            borderBottom: '1px solid #f0f0f0',
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.dot, minWidth: '8px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '500' }}>{item.name}</div>
              <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>{item.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  )
}
