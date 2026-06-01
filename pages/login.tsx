import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient()
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
        <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          COMENG
        </h1>
        <p style={{ color: '#666', marginBottom: '32px', fontSize: '14px' }}>
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
