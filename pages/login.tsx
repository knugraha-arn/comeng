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
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
      background: '#F8F9FB',
    }}>
      {/* Left panel — branding */}
      <div style={{
        width: '420px',
        minWidth: '420px',
        background: '#1A1F2E',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '40px',
      }}>
        {/* Top: Arranet logo */}
        <img src="/arranet-logo-black.png" alt="Arranet" style={{ width: '90px', filter: 'invert(1)', opacity: 0.7 }} />

        {/* Middle: AMARIS branding */}
        <div>
          <img src="/LogoAmaris.png" alt="AMARIS" style={{ width: '64px', height: '64px', borderRadius: '16px', marginBottom: '20px' }} />
          <div style={{ fontSize: '36px', fontWeight: '700', color: '#FFFFFF', letterSpacing: '0.04em', marginBottom: '12px' }}>
            AMARIS
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.7', maxWidth: '280px' }}>
            AI-driven Monitoring, Action, Retention, and Intelligent Smart Engagement
          </div>
          <div style={{ marginTop: '32px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['Monitoring', 'Retensi', 'AI Insight'].map(tag => (
              <span key={tag} style={{
                fontSize: '10px', padding: '4px 10px', borderRadius: '999px',
                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>{tag}</span>
            ))}
          </div>
        </div>

        {/* Bottom: version */}
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
          AMARIS · by Arranet · v1.0
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
      }}>
        <div style={{ width: '100%', maxWidth: '360px' }}>
          <div style={{ marginBottom: '40px' }}>
            <div style={{ fontSize: '22px', fontWeight: '600', color: '#000000', marginBottom: '8px' }}>
              Selamat datang
            </div>
            <div style={{ fontSize: '13px', color: '#999' }}>
              Masuk menggunakan akun Google Arranet kamu untuk melanjutkan.
            </div>
          </div>

          <button
            onClick={handleLogin}
            style={{
              width: '100%',
              padding: '13px 20px',
              background: '#FFFFFF',
              color: '#333',
              border: '1px solid #e5e5e5',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Masuk dengan Google
          </button>

          <div style={{ marginTop: '24px', fontSize: '11px', color: '#bbb', textAlign: 'center', lineHeight: '1.6' }}>
            Hanya akun dengan domain @arranetwork.com<br />yang dapat mengakses platform ini.
          </div>
        </div>
      </div>
    </main>
  )
}
