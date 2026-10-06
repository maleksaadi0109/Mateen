import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { VideoCanvas, VideoPausedContext, useVideoPlayer } from '@/lib/video';
import { FilmScene } from './FilmScenes';
import { titles } from './content';
import './film.css';

// Fifteen product shots of 7.5 s plus a 7.5 s closing card: 120 s in total.
export const SCENE_DURATIONS: Record<string, number> = Object.fromEntries([
  ...Array.from({ length: 15 }, (_, i) => [`shot${String(i + 1).padStart(2, '0')}`, 7500]),
  ['closing', 7500],
]);
const SCENE_COUNT = Object.keys(SCENE_DURATIONS).length;
const VIDEO_ASPECT_RATIO = '16:9';
const starts: Record<string, number> = {};
let offset = 0;
Object.entries(SCENE_DURATIONS).forEach(([key, ms]) => { starts[key] = offset; offset += ms / 1000; });
export default function VideoTemplate({
  durations = SCENE_DURATIONS, loop = true, paused = false, muted = false, onSceneChange,
}: {
  durations?: Record<string, number>; loop?: boolean; paused?: boolean;
  muted?: boolean; onSceneChange?: (key: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  const key = currentSceneKey.replace(/_r[12]$/, '');
  const index = Object.keys(SCENE_DURATIONS).indexOf(key);
  const audio = useRef<HTMLAudioElement>(null);
  const lastKey = useRef('');
  useEffect(() => { onSceneChange?.(currentSceneKey); }, [currentSceneKey, onSceneChange]);
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (paused) { a.pause(); return; }
    if (lastKey.current !== currentSceneKey) {
      lastKey.current = currentSceneKey;
      if (Math.abs(a.currentTime - starts[key]) > .18) a.currentTime = starts[key];
    }
    void a.play().catch(() => { a.dataset.autoplayBlocked = 'true'; });
  }, [currentSceneKey, key, paused, muted]);
  return <VideoPausedContext.Provider value={paused}>
    <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} className={`film ${paused ? 'paused' : ''}`}>
      <AnimatePresence mode="sync">
        <FilmScene key={currentSceneKey} index={index} />
      </AnimatePresence>
      <div className="corner" dir="rtl"><span>مَتِين</span><span>{titles[index]}</span></div>
      <div className="counter">{String(index + 1).padStart(2, '0')} / {SCENE_COUNT}</div>
      <div className="timeline" style={{ width: `${((index + 1) / SCENE_COUNT) * 100}%` }} />
      <audio ref={audio} src={`${import.meta.env.BASE_URL}audio/composite_audio.mp3`} muted={muted} preload="auto" />
    </VideoCanvas>
  </VideoPausedContext.Provider>;
}
