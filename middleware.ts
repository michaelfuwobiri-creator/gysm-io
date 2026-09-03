import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, NextRequest, NextFetchEvent } from 'next/server'
import { neon } from '@neondatabase/serverless'

const isPublicRoute = createRouteMatcher(['/', '/pricing(.*)', '/templates(.*)', '/auth(.*)', '/sign-in(.*)', '/sign-up(.*)', '/gang(.*)', '/publish(.*)', '/api/webhooks(.*)', '/api/billing/webhook(.*)'])
const isBuilderRoute = createRouteMatcher(['/builder(.*)', '/dashboard(.*)', '/voiie(.*)', '/admin(.*)'])

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isBuilderRoute(req)) {
    const { userId } = await auth()
    if (!userId) {
      // Previously redirected to /pricing, which isn't a login screen --
      // an unauthenticated visitor hitting /builder just saw a paywall with
      // no way to actually sign in. Send them to Clerk's sign-in page and
      // carry the page they wanted so they land back on it after login.
      const signInUrl = new URL('/sign-in', req.url)
      signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname)
      return NextResponse.redirect(signInUrl)
    }
  }
})

// Custom domains (see db/migrations/0006, lib/vercelDomains.ts): a request
// arriving on a user's own verified domain (not gysm.io / *.vercel.app /
// localhost) gets rewritten straight to that build's /publish/[id] page,
// entirely bypassing Clerk -- these visitors are the public viewing
// someone's published app, not signing into GYSM.IO itself. Falls straight
// through to the existing Clerk middleware for every known GYSM.IO host,
// so none of the platform auth behavior above changes for normal traffic.
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null

function isKnownHost(host: string): boolean {
  const bare = host.split(':')[0]
  if (bare === 'gysm.io' || bare === 'www.gysm.io' || bare === 'localhost' || bare === '127.0.0.1') return true
  if (bare.endsWith('.vercel.app')) return true
  return false
}

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const host = req.headers.get('host') || ''

  if (sql && host && !isKnownHost(host) && req.nextUrl.pathname === '/') {
    try {
      const rows = await sql`select id from projects where custom_domain = ${host} and custom_domain_status = 'verified' limit 1`
      const project = rows[0] as any
      if (project) {
        const url = req.nextUrl.clone()
        url.pathname = `/publish/${project.id}`
        return NextResponse.rewrite(url)
      }
    } catch (error) {
      console.error('[middleware] custom domain lookup failed:', (error as Error).message)
      // Fall through to normal routing rather than breaking the request.
    }
  }

  return clerkHandler(req, event)
}

export const config = {
  matcher: ['/((?!.*\\.).*)', '/(api|trpc)(.*)'],
}
