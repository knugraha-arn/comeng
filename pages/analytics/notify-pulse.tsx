import { useState } from 'react'
import Head from 'next/head'
import Layout from '../../components/Layout'
import { createBrowserClient } from '@supabase/ssr'

export default function NotifyPulsePage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSend() {
    setStatus('sending')
    setMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setStatus('error')
        setMessage('Sesi tidak ditemukan — silakan login ulang')
        return
      }

      const res = await fetch('/api/notify/pulse-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setMessage(data.error ?? 'Gagal mengirim email')
        return
      }

      setStatus('done')
      setMessage(`Terkirim ke ${data.recipients} penerima`)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }
  }

  return (
    <Layout>
      <Head><title>Kirim Pulse MTD — AMARIS</title></Head>
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', marginBottom: '4px' }}>
            ADMIN
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
            Kirim Email Pulse MTD
          </h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
            Kirim ringkasan Pulse MTD (fee, proyeksi, TRX) ke daftar penerima yang sudah dikonfigurasi.
            Pastikan data hari ini sudah selesai di-compute sebelum mengirim.
          </p>
        </div>

        <button
          onClick={handleSend}
          disabled={status === 'sending'}
          style={{
            width: '100%', padding: '13px', borderRadius: '8px', border: 'none',
            backgroundColor: status === 'sending' ? '#93c5fd' : '#0344D8', color: '#fff',
            fontSize: '14px', fontWeight: '700',
            cursor: status === 'sending' ? 'not-allowed' : 'pointer',
          }}
        >
          {status === 'sending' ? 'Mengirim...' : '📧 Kirim Email Pulse MTD Sekarang'}
        </button>

        {status === 'done' && (
          <div style={{
            marginTop: '16px', padding: '14px 16px', backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0', borderRadius: '8px',
            fontSize: '13px', color: '#166534', fontWeight: '600', textAlign: 'center',
          }}>
            ✅ {message}
          </div>
        )}

        {status === 'error' && (
          <div style={{
            marginTop: '16px', padding: '14px 16px', backgroundColor: '#fef2f2',
            border: '1px solid #fecaca', borderRadius: '8px',
            fontSize: '13px', color: '#b00020', fontWeight: '600',
          }}>
            ⚠️ {message}
          </div>
        )}

        <div style={{ marginTop: '24px', padding: '14px 16px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.05em', marginBottom: '6px' }}>CATATAN</div>
          <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>
            Halaman ini sengaja tidak ditaruh di menu — diakses manual lewat URL ini setelah upload & compute metrics hari ini selesai.
            Daftar penerima diatur lewat environment variable <code>PULSE_NOTIFY_RECIPIENTS</code> di Vercel, bukan dari halaman ini.
          </div>
        </div>

      </div>
    </Layout>
  )
}
