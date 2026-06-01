import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

const navItems = [
  { href: '/', label: 'Overview', icon: '▦' },
  { href: '/ranger', label: 'Ranger', icon: '👤' },
  { href: '/members', label: 'Member Alert', icon: '👥' },
  { href: '/trends', label: 'Tren', icon: '📈' },
  { href: '/rekomendasi', label: 'Rekomendasi', icon: '💡' },
  { href: '/upload', label: 'Upload WAG', icon: '↑' },
  { href: '/config', label: 'Konfigurasi', icon: '⚙' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
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
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f5f5f5' }}>
      
      {/* Sidebar */}
      <div style={{
        width: '200px',
        minWidth: '200px',
        background: '#fafafa',
        borderRight: '1px solid #e5e5e5',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e5e5' }}>
          <img src="/arranet-logo-black.png" alt="Arranet" style={{ width: '100px' }} />
          <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>COMENG</div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '8px', flex: 1 }}>
          {navItems.map((item) => (
            <div
              key={item.href}
              onClick={() => router.push(item.href)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                marginBottom: '2px',
                background: router.pathname === item.href ? '#f0f0f0' : 'transparent',
                fontWeight: router.pathname === item.href ? '500' : '400',
                color: router.pathname === item.href ? '#111' : '#555',
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px', borderTop: '1px solid #e5e5e5' }}>
          <div style={{ fontSize: '11px', color: '#999', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email}
          </div>
          <div
            onClick={handleLogout}
            style={{ fontSize: '11px', color: '#999', cursor: 'pointer' }}
          >
            Logout
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {children}
      </div>

    </div>
  )
}
