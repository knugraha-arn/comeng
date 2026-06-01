import { createServerClient } from '@supabase/ssr'
import type { IncomingMessage, ServerResponse } from 'http'

export function createServerSideClient(req: IncomingMessage, res: ServerResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookies = req.headers.cookie ?? ''
          return cookies.split(';').filter(Boolean).map((cookie) => {
            const [name, ...rest] = cookie.trim().split('=')
            return { name: name.trim(), value: rest.join('=').trim() }
          })
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          const existing = res.getHeader('Set-Cookie')
          const existingArray = existing
            ? Array.isArray(existing)
              ? existing
              : [String(existing)]
            : []
          const newCookies = cookiesToSet.map(({ name, value, options }) => {
            let cookie = `${name}=${value}`
            if (options?.path) cookie += `; Path=${options.path}`
            if (options?.maxAge) cookie += `; Max-Age=${options.maxAge}`
            if (options?.httpOnly) cookie += `; HttpOnly`
            if (options?.secure) cookie += `; Secure`
            if (options?.sameSite) cookie += `; SameSite=${options.sameSite}`
            return cookie
          })
          res.setHeader('Set-Cookie', [...existingArray, ...newCookies])
        },
      },
    }
  )
}
