export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M5 25 L11 7 L16 19 L21 7 L27 25" fill="none" stroke="#c4a35a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-serif text-xl tracking-[0.3em] text-ivory">MAESTRO</span>
    </span>
  )
}
