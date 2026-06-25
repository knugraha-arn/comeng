import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

const navItems = [
  { href: '/', label: 'Overview', icon: '◈' },
  { href: '/ranger', label: 'Ranger', icon: '◈' },
  { href: '/members', label: 'Member Alert', icon: '◈' },
  { href: '/trends', label: 'Tren', icon: '◈' },
  { href: '/rekomendasi', label: 'Rekomendasi', icon: '◈' },
]

const analyticsNavItems = [
  { href: '/analytics/pulse',           label: 'Business Pulse',        icon: '◈' },
  { href: '/analytics/agents',          label: 'Kinerja 14 Hari',       icon: '◈' },
  { href: '/analytics/hidden-gem',      label: 'Produktifitas Agen',    icon: '◈' },
  { href: '/analytics/agent-liquidity', label: 'Likuiditas Agen', icon: '◈' },
  { href: '/analytics/mitra',           label: 'Kekuatan Mitra',  icon: '◈' },
  { href: '/analytics/pic',             label: 'Kekuatan PIC',    icon: '◈' },
  { href: '/analytics/dashboard-3500',  label: 'Lite & Plus',     icon: '◈' },
  { href: '/analytics/agent-profile',   label: 'Cari Agen',       icon: '◈' },
]

const adminNavItems = [
  { href: '/analytics/upload',         label: 'Upload Transaksi',    icon: '↑',  strictAdmin: false },
  { href: '/analytics/history',        label: 'History Upload Transaksi', icon: '◎', strictAdmin: false },
  { href: '/upload',                   label: 'Upload WAG', icon: '◈',            strictAdmin: false },
  { href: '/analytics/target-simple',  label: 'Target Bisnis',       icon: '◎',  strictAdmin: true },
  { href: '/config',                   label: 'Konfigurasi',         icon: '◈',  strictAdmin: false },
]

// Cache di module level — persist selama session browser, tidak reset saat ganti halaman
let sessionChecked = false
let sessionApproved = false
let sessionEmail = ''
let sessionName = ''
let sessionAvatar = ''
let sessionRole = ''

export default function Layout({ children, title }: { children: React.ReactNode; title?: string }) {
  const router = useRouter()
  const [ready, setReady] = useState(sessionChecked && sessionApproved)
  const [email, setEmail] = useState(sessionEmail)
  const [name, setName] = useState(sessionName)
  const [avatar, setAvatar] = useState(sessionAvatar)
  const [role, setRole] = useState(sessionRole)

  useEffect(() => {
    if (sessionChecked) {
      if (!sessionApproved) {
        router.replace('/unauthorized')
      }
      return
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        return
      }

      const userEmail = session.user.email ?? ''
      const userName = session.user.user_metadata?.full_name ?? ''
      const userAvatar = session.user.user_metadata?.avatar_url ?? ''

      setEmail(userEmail)
      setName(userName)
      setAvatar(userAvatar)

      supabase.from('users').upsert({
        id: session.user.id,
        email: userEmail,
        full_name: userName,
        avatar_url: userAvatar,
        last_login_at: new Date().toISOString(),
      }, { onConflict: 'id' }).then(() => {})

      const { data: userData } = await supabase
        .from('users')
        .select('is_approved, role')
        .eq('id', session.user.id)
        .single()

      sessionChecked = true
      sessionEmail = userEmail
      sessionName = userName
      sessionAvatar = userAvatar
      sessionRole = userData?.role ?? ''

      setRole(sessionRole)

      if (!userData?.is_approved) {
        sessionApproved = false
        router.replace('/unauthorized')
        return
      }

      sessionApproved = true
      setReady(true)
    })
  }, [router])

  const handleLogout = async () => {
    sessionChecked = false
    sessionApproved = false
    sessionEmail = ''
    sessionName = ''
    sessionAvatar = ''
    sessionRole = ''
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  const isSuperAdmin = true // TODO: restore role check after RLS fix

  if (!ready) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#F8F9FB' }}>
      <div style={{ textAlign: 'center' }}>
        <img src="/LogoAmaris.png" alt="AMARIS" style={{ width: '48px', height: '48px', borderRadius: '12px', marginBottom: '12px', opacity: 0.7 }} />
        <div style={{ fontSize: '12px', color: '#bbb' }}>Memuat...</div>
      </div>
    </div>
  )

  function NavItem({ href, label, icon }: { href: string, label: string, icon: string }) {
    const isActive = router.pathname === href || (href !== '/' && href !== '/analytics' && router.pathname.startsWith(href))
    return (
      <div onClick={() => router.push(href)}
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
        <span style={{ fontSize: '14px', minWidth: '16px', textAlign: 'center' }}>{icon}</span>
        <span>{label}</span>
      </div>
    )
  }

  function SectionLabel({ label }: { label: string }) {
    return (
      <div style={{ margin: '10px 8px 6px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', fontWeight: '600', paddingLeft: '4px', marginBottom: '4px' }}>
          {label}
        </div>
      </div>
    )
  }

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
        <nav style={{ padding: '10px 8px', flex: 1, overflowY: 'auto' }}>

          {/* AI Assistant — paling atas, berdiri sendiri */}
          <NavItem href="/ai-assistant" label="AI Assistant" icon="✦" />
          <div style={{ margin: '8px 4px', borderTop: '1px solid rgba(255,255,255,0.08)' }} />

          {/* TRX Analytics — di atas WAG */}
          <SectionLabel label="TRX ANALYTICS" />
          {analyticsNavItems.map(item => <NavItem key={item.href} {...item} />)}

          {/* WAG Analytics */}
          <SectionLabel label="WAG ANALYTICS" />
          {navItems.map(item => <NavItem key={item.href} {...item} />)}

          {/* Admin */}
          {isSuperAdmin && (
            <>
              <SectionLabel label="ADMIN" />
              {adminNavItems
                .filter(item => !item.strictAdmin || ['admin', 'super_admin'].includes(role))
                .map(item => <NavItem key={item.href} {...item} />)}
            </>
          )}

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
        <div style={{ padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: '500', color: '#000000' }}>{title || 'AMARIS'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '11px', color: '#999', background: '#F8F9FB', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e5e5e5' }}>
              {dateStr}
            </span>
            <img src="/arranet-logo-black.png" alt="Arranet" style={{ height: '18px', opacity: 0.45 }} />
          </div>
        </div>
        <div style={{ padding: '24px', flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
