import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.exchangeCodeForSession(window.location.href).then(({ error }) => {
      if (error) {
        router.push('/login')
      } else {
        router.push('/')
      }
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
