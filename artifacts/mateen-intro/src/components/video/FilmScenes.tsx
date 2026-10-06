import { useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useSceneTimer, VideoPausedContext } from '@/lib/video';
import { shots, type Shot } from './content';

const base = import.meta.env.BASE_URL;
const src = (name: string) => `${base}${name.startsWith('recitation') ? 'images' : 'captures'}/${name}`;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

function useAfter(ms: number) {
  const [on, setOn] = useState(ms <= 0);
  useSceneTimer(ms > 0 ? [{ time: ms, callback: () => setOn(true) }] : []);
  return on;
}

function Capture({ shot }: { shot: Shot }) {
  const paused = useContext(VideoPausedContext);
  const video = useRef<HTMLVideoElement>(null);
  const isVideo = shot.media.endsWith('.mp4');
  const showNote = useAfter(shot.note?.at ?? 1100);
  const showIntro = !useAfter(shot.intro ? 1700 : 0);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (paused) el.pause();
    else void el.play().catch(() => {});
  }, [paused]);

  const aspect = shot.aspect ?? 16 / 9;
  const height = aspect < 1.5 ? 79 : 80;
  const width = (height * 1080 * aspect) / 1920;
  const box: CSSProperties = { width: `${width}%`, height: `${height}%` };

  const n = shot.note;
  const x0 = n ? clamp(n.rect[0]) : 0, y0 = n ? clamp(n.rect[1]) : 0;
  const x1 = n ? clamp(n.rect[0] + n.rect[2]) : 1, y1 = n ? clamp(n.rect[1] + n.rect[3]) : 1;
  const origin = n ? `${((x0 + x1) / 2) * 100}% ${((y0 + y1) / 2) * 100}%` : '50% 42%';
  const zoom: CSSProperties = { transformOrigin: origin, animationName: isVideo ? 'zoom-soft' : 'zoom-in' };
  const noteStyle: CSSProperties = n ? {
    left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%`,
  } : {};

  return <div className="shot">
    {shot.demo && <p className="demo-label">بيانات تجريبية</p>}
    <div className="shot-media" style={box}>
      <div className="shot-zoom" style={zoom}>
        {isVideo
          ? <video ref={video} src={src(shot.media)} muted playsInline autoPlay={!paused} preload="auto"
              className={shot.fit ?? ''}
              onLoadedMetadata={() => {
                const el = video.current;
                if (!el) return;
                el.currentTime = shot.start ?? 0;
                el.playbackRate = shot.rate ?? 1;
              }} />
          : <img src={src(shot.media)} alt={shot.heading} />}
        {n && showNote ? <div className={`note ${y0 < 0.14 ? 'below' : ''}`} style={noteStyle}>
          <span className="note-tag">{n.text}</span>
        </div> : null}
      </div>
      <p className="shot-label">{shot.label}</p>
    </div>
    {shot.intro && showIntro ? <div className="intro-cover">
      <img src={`${base}images/logo.png`} alt="مَتِين" /><h2>رفيقك في دراسة المتون</h2>
    </div> : null}
  </div>;
}

function Closing() {
  return <div className="closing closing-colorful"><div className="closing-orbit closing-orbit-one"/><div className="closing-orbit closing-orbit-two"/><div className="closing-frame"/><img src={`${base}images/logo.png`} alt="مَتِين" /><h2>متين يساعدك في دراسة المتون</h2><div className="closing-accent" aria-hidden="true"><i/><i/><i/></div><small>تعليق صوتي مولّد بالذكاء الاصطناعي · لقطات من حسابات تجريبية</small></div>;
}

export function FilmScene({ index }: { index: number }) {
  const shot = shots[index];
  return <motion.section data-scene={index} className="scene" dir="rtl"
    initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: .4, ease: 'easeOut' }}>
    {shot ? <Capture shot={shot} /> : <Closing />}
  </motion.section>;
}
