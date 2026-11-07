import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { Logo } from '@/components/ui/Logo'

/** Shown while a lazily-loaded page (the Studio) is fetched on first navigation. */
export function PageLoading() {
  return (
    <div role="status" className="flex min-h-[50vh] items-center justify-center text-sm text-ivory-dim">
      Loading…
    </div>
  )
}

/** Route error boundary: a clear message and a way back, instead of a blank screen or a stack trace. */
export function RouteError() {
  const err = useRouteError()
  const message = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : 'Something went wrong.'
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-4xl">That page could not be shown</h1>
      <p role="alert" className="max-w-md text-sm text-ivory-dim">{message}</p>
      <p className="max-w-md text-xs text-ivory-mute">Your camera and audio are released whenever a page closes. Reloading is safe; your saved sessions and Academy progress are kept in this browser.</p>
      <Link to="/" className="btn btn-gold">Back to the start</Link>
    </div>
  )
}
