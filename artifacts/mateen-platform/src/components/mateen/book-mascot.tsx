import { useId } from 'react';
import './book-mascot.css';

type Mood = 'cheer' | 'calm' | 'rest';
export type MascotPose = 'idle' | 'wave' | 'happy';

const INK = 'hsl(20 38% 15%)';

/** Mateen's original companion: a small bound book with a gentle face. `still` freezes all motion. */
export default function BookMascot({ size = 96, mood = 'cheer', className = '', title, pose = 'idle', still = false }: { size?: number; mood?: Mood; className?: string; title?: string; pose?: MascotPose; still?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const cover = `mbc-${uid}`;
  const pages = `mbp-${uid}`;
  const shine = `mbs-${uid}`;
  const mouth = mood === 'cheer' ? 'M53 74 Q62 84 71 74' : mood === 'calm' ? 'M55 76 Q62 81 69 76' : 'M56 77 Q62 79 68 77';
  const cls = `${className} ${still ? 'mateen-still' : ''} mateen-pose-${pose}`.trim();
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={`shrink-0 mateen-mascot ${cls}`} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={cover} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(24 78% 46%)" />
          <stop offset="1" stopColor="hsl(14 66% 34%)" />
        </linearGradient>
        <linearGradient id={pages} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="hsl(40 55% 86%)" />
          <stop offset="1" stopColor="hsl(42 70% 96%)" />
        </linearGradient>
        <radialGradient id={shine} cx=".35" cy=".25" r=".7">
          <stop offset="0" stopColor="hsl(40 100% 92% / .35)" />
          <stop offset="1" stopColor="hsl(40 100% 92% / 0)" />
        </radialGradient>
      </defs>
      <ellipse cx="62" cy="111" rx="30" ry="4.5" fill="hsl(20 40% 20% / .16)" />
      <g className="mateen-bob"><g className="mateen-hop">
        {/* page block (right edge + bottom) */}
        <path d="M30 20 H90 Q98 20 98 28 V96 Q98 104 90 104 H30 Z" fill={`url(#${pages})`} stroke="hsl(20 30% 30% / .35)" strokeWidth="1" />
        <g stroke="hsl(30 30% 60% / .55)" strokeWidth=".8" fill="none">
          <path d="M94 30 V94" /><path d="M91.5 27 V97" /><path d="M35 100.5 H88" />
        </g>
        {/* cover */}
        <path d="M24 16 H84 Q93 16 93 25 V91 Q93 100 84 100 H24 Q19 100 19 95 V21 Q19 16 24 16 Z" fill={`url(#${cover})`} stroke="hsl(14 60% 22%)" strokeWidth="1.4" />
        <path d="M24 16 H84 Q93 16 93 25 V91 Q93 100 84 100 H24 Q19 100 19 95 V21 Q19 16 24 16 Z" fill={`url(#${shine})`} />
        {/* spine */}
        <path d="M19 21 Q19 16 24 16 H31 V100 H24 Q19 100 19 95 Z" fill="hsl(14 60% 26%)" />
        <g stroke="hsl(42 85% 66%)" strokeWidth="1.6" strokeLinecap="round"><path d="M21.5 28 H29" /><path d="M21.5 88 H29" /></g>
        {/* gilt frame + corners */}
        <rect x="37" y="23" width="49" height="70" rx="7" fill="none" stroke="hsl(42 85% 68% / .75)" strokeWidth="1.3" />
        <g fill="hsl(42 85% 68%)">
          <path d="M37 30 Q37 23 44 23 L37 35 Z" /><path d="M86 30 Q86 23 79 23 L86 35 Z" />
          <path d="M37 86 Q37 93 44 93 L37 81 Z" /><path d="M86 86 Q86 93 79 93 L86 81 Z" />
        </g>
        {/* eight-point star emblem */}
        <g transform="translate(61.5 35)" fill="hsl(42 90% 72%)" stroke="hsl(30 70% 40% / .5)" strokeWidth=".6">
          <rect x="-5" y="-5" width="10" height="10" rx="1" />
          <rect x="-5" y="-5" width="10" height="10" rx="1" transform="rotate(45)" />
          <circle r="2" fill="hsl(14 60% 34%)" stroke="none" />
        </g>
        {/* fluttering page */}
        {mood !== 'rest' && <path className="mateen-page" d="M93 30 Q103 31 104 46 Q99 44 93 46 Z" fill="hsl(42 70% 96%)" stroke="hsl(30 30% 50% / .45)" strokeWidth=".9" />}
        {/* face plate */}
        <ellipse cx="62" cy="66" rx="19" ry="15" fill="hsl(40 70% 93% / .14)" />
        {mood === 'rest' ? (
          <g stroke={INK} strokeWidth="2.8" fill="none" strokeLinecap="round">
            <path d="M48 63 Q53 67.5 58 63" /><path d="M66 63 Q71 67.5 76 63" />
          </g>
        ) : (
          <g>
            <ellipse className="mateen-eye" cx="53" cy="63" rx="5.6" ry="6.8" fill={INK} />
            <ellipse className="mateen-eye" cx="71" cy="63" rx="5.6" ry="6.8" fill={INK} />
            <circle cx="55" cy="60.4" r="2.2" fill="hsl(42 100% 97%)" /><circle cx="73" cy="60.4" r="2.2" fill="hsl(42 100% 97%)" />
            <circle cx="51.4" cy="66" r="1" fill="hsl(42 100% 97% / .7)" /><circle cx="69.4" cy="66" r="1" fill="hsl(42 100% 97% / .7)" />
          </g>
        )}
        {/* brows */}
        <g stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".75">
          {mood === 'cheer' ? <><path d="M48 53 Q53 50 57 52" /><path d="M67 52 Q71 50 76 53" /></> : <><path d="M48.5 54 Q53 52.5 57 54" /><path d="M67 54 Q71 52.5 75.5 54" /></>}
        </g>
        <ellipse cx="45" cy="73" rx="4.6" ry="3" fill="hsl(4 85% 68% / .55)" />
        <ellipse cx="79" cy="73" rx="4.6" ry="3" fill="hsl(4 85% 68% / .55)" />
        {mood === 'cheer'
          ? <path d="M53 74 Q62 85 71 74 Q62 77 53 74 Z" fill="hsl(4 60% 34%)" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
          : <path d={mouth} stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />}
        {/* ribbon bookmark */}
        <path d="M78 99 V113 L81.5 109.5 L85 113 V99 Z" fill="hsl(46 88% 54%)" stroke="hsl(36 70% 36%)" strokeWidth=".9" strokeLinejoin="round" />
        {/* little feet */}
        <ellipse cx="40" cy="104" rx="6" ry="3" fill="hsl(14 60% 26%)" />
        <ellipse cx="70" cy="105" rx="6" ry="3" fill="hsl(14 60% 26%)" />
        {/* arm + hand */}
        <g className="mateen-hand">
          <path d="M20 70 Q13 70 12 62" stroke="hsl(14 60% 26%)" strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <circle cx="12" cy="58" r="5.4" fill="hsl(24 78% 46%)" stroke="hsl(42 85% 68%)" strokeWidth="1.6" />
        </g>
      </g></g>
    </svg>
  );
}
