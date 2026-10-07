import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, NextRequest, NextFetchEvent } from 'next/server'
import { neon } from '@neondatabase/serverless'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { checkRateLimit } from './lib/rateLimit'
import { isUserContentHost } from './lib/userContent'

const isPublicRoute = createRouteMatcher(['/', '/(en|hr|de|fr|es|hi|ja|pt)', '/pricing(.*)', '/templates(.*)', '/auth(.*)', '/sign-in(.*)', '/sign-up(.*)', '/gang(.*)', '/publish(.*)', '/api/webhooks(.*)', '/api/billing/webhook(.*)'])
const isBuilderRoute = createRouteMatcher(['/builder(.*)', '/builder-blocks(.*)', '/dashboard(.*)', '/voiie(.*)', '/gysmlink(.*)', '/shield(.*)', '/admin(.*)', '/shell(.*)'])

// Item #9 of GYSM_IO_HANDOFF.md: "add rate limiting ... 100 req/min per
// IP". Applied to every /api/* route EXCEPT inbound webhooks and Vercel
// Cron hits -- those are server-to-server, already authenticated
// (Stripe/Clerk signatures, svix, WHATSAPP_APP_SECRET, CRON_SECRET
// Bearer auth) rather than IP-trustworthy in the first place, and several
// of them (Stripe, WhatsApp, Twitter) can legitimately arrive from a
// shared IP pool serving many unrelated accounts -- IP-based limiting
// there risks blocking other tenants' real deliveries, not just abuse.
const isRateLimitExempt = createRouteMatcher([
  '/api/webhooks(.*)',
  '/api/billing/webhook(.*)',
  '/api/voiie/webhooks(.*)',
  '/api/voiie/cron(.*)',
  '/api/cron(.*)',
  '/api/shield/ingest(.*)',
])

// Locale-aware homepage. Scoped narrowly on purpose: this repo has ~80
// routes, and next-intl only needs to run where there's actually a
// [locale] segment -- right now that's just the homepage
// (app/[locale]/page.tsx). Every other route (dashboard, builder, admin,
// api, publish, pricing, templates...) never touches this block and
// behaves exactly as it did before.
const handleI18nRouting = createIntlMiddleware(routing)
const LOCALE_ROOT_PATHS = new Set<string>(['/', ...routing.locales.map((l) => `/${l}`)])

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isBuilderRoute(req)) {
    const { userId } = await auth()
    if (!userId) {
      // Previously redirected to /pricing, which isn't a login screen --
      // an unauthenticated visitor hitting /builder just saw a paywall with
      // no way to actually sign in. Send them to Clerk's sign-in page and
      // carry the page they wanted so they land back on it after login.
      //
      // Bug fix: carry the query string too, not just the path.
      // /builder reads ?projectId=/?template=/?prompt= and /builder-blocks
      // reads ?id= to decide what to load (see their page.tsx files) --
      // dropping the search here meant a deep link straight to a specific
      // project or template silently lost that context the moment the
      // visitor had to sign in first, landing them on a blank builder
      // instead of the thing they clicked.
      const signInUrl = new URL('/sign-in', req.url)
      signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search)
      return NextResponse.redirect(signInUrl)
    }
  }

  const pathname = req.nextUrl.pathname
  if (LOCALE_ROOT_PATHS.has(pathname)) {
    // No IP-country or Accept-Language redirect: "/" always serves English
    // (see localeDetection in i18n/routing.js).
    return handleI18nRouting(req)
  }
})

// Custom domains (see db/migrations/0006, lib/vercelDomains.ts): a request
// arriving on a user's own verified domain (not gysm.io / *.vercel.app /
// localhost) gets rewritten straight to that build's /publish/[id] page,
// entirely bypassing Clerk -- these visitors are the public viewing
// someone's published app, not signing into GYSM itself. Falls straight
// through to the existing Clerk middleware for every known GYSM host,
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

  // The isolated user-content host (USER_CONTENT_ORIGIN, see lib/userContent.ts)
  // serves generated apps under /a/ and nothing else: no Clerk, no APIs, no
  // pages. Anything else on that host is a 404, so even if an app tries to
  // reach /api/... on its own origin there is nothing there to call.
  if (isUserContentHost(host)) {
    if (req.nextUrl.pathname.startsWith('/a/')) return NextResponse.next()
    return new NextResponse('Not found', { status: 404 })
  }

  // Rate limiting runs before everything else below (custom-domain
  // lookup, Clerk auth, i18n) so an abusive caller gets rejected as
  // cheaply as possible -- no DB round-trip, no auth check.
  if (req.nextUrl.pathname.startsWith('/api/') && !isRateLimitExempt(req)) {
    // req.ip is populated on Vercel's Edge Network; x-forwarded-for is the
    // fallback for local dev and any proxy in between that sets it.
    const ip =
      (req as any).ip ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'
    const { success, limit, remaining, reset } = await checkRateLimit(ip)
    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down and try again shortly.' },
        {
          status: 429,
          headers: {
            'Retry-After': reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)).toString() : '60',
            ...(limit !== undefined ? { 'X-RateLimit-Limit': String(limit) } : {}),
            ...(remaining !== undefined ? { 'X-RateLimit-Remaining': String(remaining) } : {}),
          },
        }
      )
    }
  }

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
