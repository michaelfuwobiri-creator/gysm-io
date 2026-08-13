import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher(['/', '/pricing(.*)', '/templates(.*)', '/auth(.*)', '/gang(.*)', '/publish(.*)', '/api/webhooks(.*)', '/api/billing/webhook(.*)'])
const isBuilderRoute = createRouteMatcher(['/builder(.*)', '/dashboard(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isBuilderRoute(req)) {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.redirect(new URL('/pricing', req.url))
    }
  }
})

export const config = {
  matcher: ['/((?!.*\\.).*)', '/(api|trpc)(.*)'],
}
