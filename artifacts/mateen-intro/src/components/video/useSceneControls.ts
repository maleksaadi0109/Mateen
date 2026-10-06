import { useCallback, useMemo, useState } from 'react';
export function useSceneControls(base: Record<string, number>) {
  const keys = useMemo(() => Object.keys(base), [base]);
  const [activeIndex, setActive] = useState(0);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mountKey, setMount] = useState(0);
  const [tick, setTick] = useState(0);
  const durations = useMemo(() => {
    const k = keys[activeIndex];
    if (locked) return { [`${k}_r1`]: base[k], [`${k}_r2`]: base[k] };
    return Object.fromEntries(keys.map((_, i) => {
      const key = keys[(i + activeIndex) % keys.length]; return [key, base[key]];
    }));
  }, [base, keys, activeIndex, locked]);
  const onSceneChange = useCallback((raw: string) => {
    setActive(keys.indexOf(raw.replace(/_r[12]$/, ''))); setTick(t => t + 1);
  }, [keys]);
  const jumpTo = (i: number) => { setActive(i); setPaused(false); setMount(k => k + 1); };
  const toggleLock = () => { setLocked(l => !l); setPaused(false); setMount(k => k + 1); };
  return { keys, activeIndex, locked, paused, mountKey, tick, durations, onSceneChange, jumpTo, toggleLock, togglePause: () => setPaused(p => !p) };
}
