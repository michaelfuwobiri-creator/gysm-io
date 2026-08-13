import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const protectedPaths = ['/builder', '/dashboard']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isProtected = protectedPaths.some(p => pathname === p || pathname.startsWith(p + "/"))

  // public pages -> let through
  if (!isProtected) {
    return NextResponse.next()
  }

  // protected pages -> check auth, if no auth go to pricing (not login)
  const hasAuth = request.cookies.get('sb-access-token') || request.cookies.get('supabase-auth-token') || request.cookies.get('sb-lhtagndikscbmzwjwfae-auth-token')

  if (!hasAuth) {
    return NextResponse.redirect(new URL('/pricing', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/builder/:path*', '/dashboard/:path*']
}
