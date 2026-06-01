import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/')
      } else {
        supabase.auth.onAuthStateChange((event, session) => {
          if (session) {
            router.replace('/')
          }
        })
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
