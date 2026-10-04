type Mood = 'cheer' | 'calm' | 'rest';

/** Mateen's original companion: a small bound book with a gentle face. */
export default function BookMascot({ size = 96, mood = 'cheer', className = '', title }: { size?: number; mood?: Mood; className?: string; title?: string }) {
  const mouth = mood === 'cheer' ? 'M50 74 Q60 84 70 74' : mood === 'calm' ? 'M52 76 Q60 81 68 76' : 'M53 77 L67 77';
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <g className="mateen-bob">
        <ellipse cx="60" cy="112" rx="34" ry="5" fill="hsl(var(--primary) / .15)" />
        {/* back cover + page block */}
        <rect x="22" y="18" width="78" height="88" rx="10" fill="hsl(var(--primary))" />
        <rect x="26" y="22" width="72" height="80" rx="7" fill="hsl(41 60% 92%)" />
        {/* front cover */}
        <rect x="20" y="14" width="74" height="88" rx="10" fill="hsl(var(--secondary))" />
        <rect x="20" y="14" width="12" height="88" rx="6" fill="hsl(var(--primary))" opacity=".55" />
        <rect x="38" y="22" width="48" height="72" rx="6" fill="none" stroke="hsl(45 90% 80% / .7)" strokeWidth="1.6" />
        {/* eight-point star emblem */}
        <g transform="translate(62 34)" fill="hsl(45 90% 82%)">
          <rect x="-6" y="-6" width="12" height="12" />
          <rect x="-6" y="-6" width="12" height="12" transform="rotate(45)" />
        </g>
        {/* fluttering page */}
        {mood !== 'rest' && <path className="mateen-page" d="M94 26 Q104 30 102 46 L94 44 Z" fill="hsl(41 60% 96%)" stroke="hsl(var(--primary) / .3)" />}
        {/* face */}
        <g fill="hsl(22 40% 14%)">
          {mood === 'rest'
            ? <><path d="M46 60 Q51 64 56 60" stroke="hsl(22 40% 14%)" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M68 60 Q73 64 78 60" stroke="hsl(22 40% 14%)" strokeWidth="3" fill="none" strokeLinecap="round" /></>
            : <><ellipse className="mateen-eye" cx="51" cy="60" rx="4.5" ry="6" /><ellipse className="mateen-eye" cx="73" cy="60" rx="4.5" ry="6" /><circle cx="52.5" cy="58" r="1.6" fill="#fff8ec" /><circle cx="74.5" cy="58" r="1.6" fill="#fff8ec" /></>}
        </g>
        <circle cx="43" cy="70" r="4" fill="hsl(10 80% 70% / .45)" />
        <circle cx="81" cy="70" r="4" fill="hsl(10 80% 70% / .45)" />
        <path d={mouth} stroke="hsl(22 40% 14%)" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* ribbon bookmark */}
        <path d="M84 102 L84 114 L88 110 L92 114 L92 102 Z" fill="hsl(45 80% 55%)" />
      </g>
    </svg>
  );
}
