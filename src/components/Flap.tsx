/** Split-flap departure-board text (static tiles, styled in index.css). */
export default function Flap({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`flap-row ${className}`} aria-label={text}>
      {text.split('').map((ch, i) =>
        ch === ' ' ? (
          <span key={i} className="flap flap--space" />
        ) : (
          <span key={i} className="flap">
            {ch}
          </span>
        ),
      )}
    </span>
  )
}
