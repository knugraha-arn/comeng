import { GetServerSideProps } from 'next'
import { createServerSideClient } from '@/lib/supabase-server'

export const getServerSideProps: GetServerSideProps = async ({ req, res, query }) => {
  const code = query.code as string

  if (code) {
    const supabase = createServerSideClient(req, res)
    await supabase.auth.exchangeCodeForSession(code)
  }

  return {
    redirect: {
      destination: '/',
      permanent: false,
    },
  }
}

export default function AuthCallback() {
  return null
}
