import Image from 'next/image'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
      background: '#f5f5f5',
    }}>
      <div style={{
        background: 'white',
        padding: '48px',
        borderRadius: '12px',
        border: '1px solid #e5e5e5',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%',
      }}>
        <img
          src="/arranet-logo-black.png"
          alt="Arranet"
          style={{ width: '140px', marginBottom: '24px' }}
        />
        <h1 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>
          COMENG
        </h1>
        <p style={{ color: '#888', marginBottom: '32px', fontSize: '13px' }}>
          Community Engagement Monitoring Platform
        </p>
        <button
          onClick={handleLogin}
          style={{
            width: '100%',
            padding: '12px',
            background: '#1a73e8',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          Masuk dengan Google
        </button>
      </div>
    </main>
  )
}
