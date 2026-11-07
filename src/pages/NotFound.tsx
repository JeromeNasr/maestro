import { Link } from 'react-router'

export function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-32 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-5xl">Out of tempo</h1>
      <p className="mt-4 text-ivory-dim">That page doesn't exist.</p>
      <Link to="/" className="btn btn-gold mt-8">Back to the start</Link>
    </section>
  )
}
