import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/', '/pricing(.*)', '/templates(.*)', '/auth(.*)', '/sign-in(.*)', '/sign-up(.*)', '/gang(.*)', '/publish(.*)', '/api/webhooks(.*)', '/api/billing/webhook(.*)'])
const isBuilderRoute = createRouteMatcher(['/builder(.*)', '/dashboard(.*)'])

export default clerkMiddleware(async (auth, req) => {
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

export const config = {
  matcher: ['/((?!.*\\.).*)', '/(api|trpc)(.*)'],
}
