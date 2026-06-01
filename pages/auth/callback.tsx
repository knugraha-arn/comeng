import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/')
      } else {
        router.push('/login')
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
