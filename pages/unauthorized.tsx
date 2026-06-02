import { useRouter } from 'next/router'

export default function UnauthorizedPage() {
  const router = useRouter()

  return (
    <main style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F8F9FB',
      padding: '24px',
    }}>
      <img src="/LogoAmaris.png" alt="AMARIS" style={{ width: '64px', height: '64px', borderRadius: '16px', marginBottom: '20px' }} />
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>🚫</div>
      <div style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px', color: '#000000' }}>Akses Ditolak</div>
      <div style={{ fontSize: '13px', color: '#999', textAlign: 'center', maxWidth: '320px', lineHeight: '1.6', marginBottom: '28px' }}>
        Akun kamu belum memiliki akses ke AMARIS. Hubungi administrator Arranet untuk mendapatkan akses.
      </div>
      <button
        onClick={() => router.push('/login')}
        style={{
          padding: '11px 28px', background: '#0344D8', color: '#FFFFFF',
          border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
        }}
      >
        Kembali ke Login
      </button>
      <div style={{ marginTop: '32px' }}>
        <img src="/arranet-logo-black.png" alt="Arranet" style={{ height: '16px', opacity: 0.3 }} />
      </div>
    </main>
  )
}
