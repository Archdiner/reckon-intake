// The Reckon mark: an open loop with a point inside it.
export default function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="mark">
      <path d="M19.5 8.2A8.5 8.5 0 1 0 20.5 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.6" fill="var(--accent)" />
    </svg>
  );
}
