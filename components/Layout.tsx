import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

const navItems = [
  { href: '/', label: 'Overview', icon: '▦' },
  { href: '/ranger', label: 'Ranger', icon: '◉' },
  { href: '/members', label: 'Member Alert', icon: '◎' },
  { href: '/trends', label: 'Tren', icon: '↗' },
  { href: '/rekomendasi', label: 'Rekomendasi', icon: '✦' },
  { href: '/ai-assistant', label: 'AI Assistant', icon: '◈' },
  { href: '/upload', label: 'Upload WAG', icon: '↑' },
  { href: '/config', label: 'Konfigurasi', icon: '⚙' },
]

export default function Layout({ children, title }: { children: React.ReactNode; title?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        return
      }

      const userEmail = session.user.email ?? ''
      setEmail(userEmail)
      setName(session.user.user_metadata?.full_name ?? '')
      setAvatar(session.user.user_metadata?.avatar_url ?? '')

      // Upsert user ke tabel users
      await supabase.from('users').upsert({
        id: session.user.id,
        email: userEmail,
        full_name: session.user.user_metadata?.full_name ?? '',
        avatar_url: session.user.user_metadata?.avatar_url ?? '',
        last_login_at: new Date().toISOString(),
      }, { onConflict: 'id' })

      // Cek apakah user sudah di-approve
      const { data: userData } = await supabase
        .from('users')
        .select('is_approved')
        .eq('id', session.user.id)
        .single()

      if (!userData?.is_approved) {
        router.replace('/unauthorized')
        return
      }

      setChecking(false)
    })
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F8F9FB' }}>
      <div style={{ textAlign: 'center' }}>
        <img src="/LogoAmaris.png" alt="AMARIS" style={{ width: '48px', height: '48px', borderRadius: '12px', marginBottom: '12px' }} />
        <div style={{ fontSize: '13px', color: '#999' }}>Memverifikasi akses...</div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F8F9FB' }}>

      {/* Sidebar */}
      <div style={{ width: '216px', minWidth: '216px', background: '#1A1F2E', display: 'flex', flexDirection: 'column' }}>

        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/LogoAmaris.png" alt="AMARIS" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#FFFFFF', letterSpacing: '0.05em' }}>AMARIS</div>
              <div style={{ fontSize: '9px', color: '#D1EA2C', marginTop: '1px', letterSpacing: '0.08em', fontWeight: '500' }}>by Arranet</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {navItems.map((item) => {
            const isActive = router.pathname === item.href || (item.href !== '/' && router.pathname.startsWith(item.href))
            return (
              <div key={item.href} onClick={() => router.push(item.href)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
                  fontSize: '13px', marginBottom: '2px',
                  background: isActive ? '#0344D8' : 'transparent',
                  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                  fontWeight: isActive ? '500' : '400',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: '14px', minWidth: '16px', textAlign: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            {avatar ? (
              <img src={avatar} alt={name || email} referrerPolicy="no-referrer"
                style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', minWidth: '30px', border: '2px solid rgba(255,255,255,0.15)' }}
              />
            ) : (
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#0344D8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '600', color: '#FFFFFF', minWidth: '30px' }}>
                {(name || email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{ overflow: 'hidden', flex: 1 }}>
              {name && (
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </div>
              )}
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email}
              </div>
            </div>
          </div>
          <div onClick={handleLogout}
            style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', paddingLeft: '2px' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            Logout
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Topbar */}
        <div style={{ padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: '500', color: '#000000' }}>{title || 'AMARIS'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '11px', color: '#999', background: '#F8F9FB', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e5e5e5' }}>
              {dateStr}
            </span>
            <img src="/arranet-logo-black.png" alt="Arranet" style={{ height: '18px', opacity: 0.45 }} />
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
