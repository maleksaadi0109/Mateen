const SKINS = [
  { cover: '#7a2f1d', spine: '#4d1b10', ink: '#f3dca0', page: '#f6ecd6' },
  { cover: '#1f4b45', spine: '#12302c', ink: '#e8d59a', page: '#f2ead3' },
  { cover: '#5a3d6b', spine: '#3a2547', ink: '#efdca8', page: '#f4ecd8' },
  { cover: '#8a6a1f', spine: '#5c4511', ink: '#fbefc4', page: '#f6edd5' },
];

/** Original decorative book cover drawn in code. Not a depiction of any published edition. */
export default function BookCover({ index = 0, locked = false, className = '' }: { index?: number; locked?: boolean; className?: string }) {
  const s = SKINS[index % SKINS.length];
  const m = index % 4;
  return (
    <svg viewBox="0 0 120 160" aria-hidden="true" focusable="false" className={className} style={locked ? { filter: 'saturate(.45) brightness(.95)' } : undefined}>
      <rect x="10" y="10" width="104" height="146" rx="6" fill={s.page} />
      <rect x="6" y="6" width="104" height="146" rx="6" fill={s.cover} />
      <rect x="6" y="6" width="14" height="146" rx="5" fill={s.spine} />
      <rect x="28" y="16" width="74" height="126" rx="3" fill="none" stroke={s.ink} strokeOpacity=".6" strokeWidth="1.4" />
      <g transform="translate(65 66)" fill="none" stroke={s.ink} strokeWidth="1.6">
        {m === 0 && <><rect x="-18" y="-18" width="36" height="36" /><rect x="-18" y="-18" width="36" height="36" transform="rotate(45)" /><circle r="6" fill={s.ink} /></>}
        {m === 1 && <><circle r="20" /><circle r="12" /><path d="M-20 0H20M0 -20V20" /></>}
        {m === 2 && <><path d="M0 -22L20 0L0 22L-20 0Z" /><path d="M0 -12L11 0L0 12L-11 0Z" fill={s.ink} /></>}
        {m === 3 && <><path d="M-20 14Q0 -26 20 14" /><path d="M-12 14Q0 -10 12 14" /><path d="M-22 18H22" /></>}
      </g>
      <path d="M40 108H90M48 118H82" stroke={s.ink} strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" />
      <path d="M92 152V138L97 143L102 138V152Z" fill={s.ink} />
    </svg>
  );
}
