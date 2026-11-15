import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'

/** Fades its children up as they scroll into view, once. Without IntersectionObserver they are simply shown. */
export function Reveal({ children, delay = 0, as: Tag = 'div', className = '', ...rest }: { children: ReactNode; delay?: number; as?: ElementType; className?: string; id?: string; 'aria-labelledby'?: string }) {
  const ref = useRef<HTMLElement | null>(null)
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (seen || !el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return (
    <Tag ref={ref} className={`reveal ${seen ? 'in' : ''} ${className}`} {...rest} style={{ ['--reveal-delay' as string]: `${delay}s` }}>
      {children}
    </Tag>
  )
}
