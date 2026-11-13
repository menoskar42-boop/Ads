import { useCallback, useMemo, useState } from 'react';
function rotate(durations: Record<string, number>, index: number) {
 const keys = Object.keys(durations); const out: Record<string, number> = {};
 keys.forEach((_, offset) => { const key = keys[(index + offset) % keys.length]; out[key] = durations[key]; });
 return out;
}
export function useSceneControls(baseDurations: Record<string, number>) {
 const keys = useMemo(() => Object.keys(baseDurations), [baseDurations]);
 const [activeIndex, setActiveIndex] = useState(0); const [paused, setPaused] = useState(false); const [muted, setMuted] = useState(false); const [locked, setLocked] = useState(false); const [mountKey, setMountKey] = useState(0); const [tick, setTick] = useState(0);
 const durations = useMemo(() => locked ? { [keys[activeIndex] + '_r1']: baseDurations[keys[activeIndex]], [keys[activeIndex] + '_r2']: baseDurations[keys[activeIndex]] } : rotate(baseDurations, activeIndex), [activeIndex, baseDurations, keys, locked]);
 const jumpTo = useCallback((index: number) => { setActiveIndex(index); setPaused(false); setMountKey(value => value + 1); setTick(value => value + 1); }, []);
 const toggleLock = useCallback(() => { setLocked(value => !value); setPaused(false); setMountKey(value => value + 1); setTick(value => value + 1); }, []);
 const onSceneChange = useCallback((key: string) => { const base = key.replace(/_r[12]$/, ''); const index = keys.indexOf(base); if (index >= 0) setActiveIndex(index); setTick(value => value + 1); }, [keys]);
 return { keys, activeIndex, paused, muted, locked, mountKey, tick, durations, jumpTo, toggleLock, onSceneChange, togglePause: () => setPaused(value => !value), toggleMute: () => setMuted(value => !value) };
}
