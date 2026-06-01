import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'

export default function Home() {
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
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif',
      background: '#f5f5f5',
    }}>
      <div style={{
        background: 'white',
        padding: '48px',
        borderRadius: '12px',
        border: '1px solid #e5e5e5',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%',
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
          COMENG
        </h1>
        <p style={{ color: '#888', fontSize: '13px', marginBottom: '24px' }}>
          Login sebagai: {email}
        </p>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 20px',
            background: 'transparent',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </div>
    </main>
  )
}
