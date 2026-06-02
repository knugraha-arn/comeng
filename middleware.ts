import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/unauthorized',
  '/auth/callback',
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Izinkan path publik dan static files
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Cek ada session cookie dari Supabase
  const hasSession = Array.from(req.cookies.getAll()).some(
    c => c.name.includes('auth-token') || c.name.includes('sb-')
  )

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|LogoAmaris\\.png|arranet-logo-black\\.png|api/).*)',
  ],
}
