import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    // Beri waktu Supabase establish session
    setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.replace('/login')
        return
      }

      // Upsert user
      await supabase.from('users').upsert({
        id: session.user.id,
        email: session.user.email,
        full_name: session.user.user_metadata?.full_name ?? '',
        avatar_url: session.user.user_metadata?.avatar_url ?? '',
        last_login_at: new Date().toISOString(),
      }, { onConflict: 'id' })

      // Cek is_approved
      const { data: userData } = await supabase
        .from('users')
        .select('is_approved')
        .eq('id', session.user.id)
        .single()

      if (!userData?.is_approved) {
        router.replace('/unauthorized')
        return
      }

      router.replace('/')
    }, 1000)
  }, [router])

  return (
    <main style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: 'system-ui, sans-serif',
      background: '#F8F9FB', flexDirection: 'column', gap: '12px',
    }}>
      <img src="/LogoAmaris.png" alt="AMARIS" style={{ width: '48px', height: '48px', borderRadius: '12px', opacity: 0.7 }} />
      <p style={{ color: '#999', fontSize: '13px' }}>Memproses login...</p>
    </main>
  )
}
