/** Where to conduct, relative to your body and the camera frame (a diagram, not a live view). */
export function FrameGuide() {
  return (
    <svg viewBox="0 0 320 200" className="w-full max-w-md rounded-sm border hairline bg-ink-950" role="img" aria-label="Diagram of the conducting space between waist and eyes, inside the camera frame">
      <rect x="6" y="6" width="308" height="188" rx="3" fill="none" stroke="#c4a35a" strokeOpacity=".35" strokeDasharray="4 4" />
      <text x="14" y="22" fill="#8f8878" fontSize="9">camera frame — keep both hands inside</text>
      <circle cx="160" cy="46" r="18" fill="none" stroke="#c9c0ad" strokeOpacity=".7" />
      <path d="M160 64 L160 138 M110 82 L210 82 M160 138 L135 188 M160 138 L185 188" fill="none" stroke="#c9c0ad" strokeOpacity=".7" />
      <rect x="64" y="44" width="192" height="94" rx="4" fill="#c4a35a" fillOpacity=".08" stroke="#c4a35a" strokeOpacity=".7" />
      <text x="72" y="58" fill="#d9bf82" fontSize="9">conducting space: eyes ↔ waist, shoulder width</text>
      <text x="76" y="128" fill="#c9c0ad" fontSize="9">left hand: loud ↑ / soft ↓</text>
      <text x="182" y="128" fill="#c9c0ad" fontSize="9">right hand: the beat</text>
    </svg>
  )
}
