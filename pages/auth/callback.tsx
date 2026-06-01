import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
        return
      }

      // Cek apakah email ada di whitelist users table
      const { data: user, error } = await supabase
        .from('users')
        .select('id, role')
        .eq('email', session.user.email)
        .single()

      if (error || !user) {
        // Email tidak ada di whitelist — logout dan tolak
        await supabase.auth.signOut()
        router.replace('/unauthorized')
        return
      }

      router.replace('/')
    })
  }, [router])

  return (
    <main style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <p style={{ color: '#666' }}>Memproses login...</p>
    </main>
  )
}
