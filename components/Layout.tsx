import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

const navItems = [
  { href: '/', label: 'Overview', icon: '▦' },
  { href: '/ranger', label: 'Ranger', icon: '◉' },
  { href: '/members', label: 'Member Alert', icon: '◎' },
  { href: '/trends', label: 'Tren', icon: '↗' },
  { href: '/rekomendasi', label: 'Rekomendasi', icon: '◈' },
  { href: '/upload', label: 'Upload WAG', icon: '↑' },
  { href: '/config', label: 'Konfigurasi', icon: '⚙' },
]

export default function Layout({ children, title }: { children: React.ReactNode; title?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
      } else {
        setEmail(session.user.email ?? '')
      }
    })
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F8F9FB' }}>

      {/* Sidebar */}
      <div style={{
        width: '208px',
        minWidth: '208px',
        background: '#1A1F2E',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/LogoAmaris.png" alt="AMARIS" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#FFFFFF', letterSpacing: '0.05em' }}>AMARIS</div>
            <div style={{ fontSize: '9px', color: '#D1EA2C', marginTop: '1px', letterSpacing: '0.05em' }}>by Arranet</div>
          </div>
        </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {navItems.map((item) => {
            const isActive = router.pathname === item.href
            return (
              <div
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  marginBottom: '2px',
                  background: isActive ? '#0344D8' : 'transparent',
                  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                  fontWeight: isActive ? '500' : '400',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: '14px' }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email}
          </div>
          <div
            onClick={handleLogout}
            style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
          >
            Logout
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Topbar */}
        {title && (
          <div style={{
            padding: '14px 24px',
            background: '#FFFFFF',
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '15px', fontWeight: '500', color: '#000000' }}>{title}</span>
            <span style={{ fontSize: '11px', color: '#999', background: '#F8F9FB', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e5e5e5' }}>
              Minggu ke-23, 2025
            </span>
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '24px', flex: 1 }}>
          {children}
        </div>

      </div>
    </div>
  )
}
