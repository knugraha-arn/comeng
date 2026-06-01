import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import type { IncomingMessage, ServerResponse } from 'http'

export function createServerSideClient(req: IncomingMessage, res: ServerResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(req.headers.cookie ?? '')
        },
        setAll(cookiesToSet) {
          res.setHeader(
            'Set-Cookie',
            cookiesToSet.map(({ name, value, options }) =>
              serializeCookieHeader(name, value, options)
            )
          )
        },
      },
    }
  )
}
