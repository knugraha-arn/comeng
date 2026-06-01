import { useRouter } from 'next/router'

export default function Unauthorized() {
  const router = useRouter()

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
      background: '#F8F9FB',
    }}>
      <div style={{
        background: '#FFFFFF',
        padding: '48px',
        borderRadius: '12px',
        border: '1px solid #e5e5e5',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>🚫</div>
        <h1 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#000000' }}>
          Akses Ditolak
        </h1>
        <p style={{ fontSize: '13px', color: '#999', marginBottom: '32px', lineHeight: '1.6' }}>
          Akun kamu tidak memiliki akses ke COMENG. Hubungi administrator untuk mendapatkan akses.
        </p>
        <button
          onClick={() => router.replace('/login')}
          style={{
            padding: '10px 24px',
            background: '#0344D8',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          Kembali ke Login
        </button>
      </div>
    </main>
  )
}
