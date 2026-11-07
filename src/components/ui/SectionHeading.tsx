import type { ReactNode } from 'react'

export function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-4xl leading-tight sm:text-5xl">{title}</h2>
      {children && <p className="mt-4 text-base leading-relaxed text-ivory-dim">{children}</p>}
    </header>
  )
}
