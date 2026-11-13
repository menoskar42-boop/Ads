import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { VideoCanvas, VideoPausedContext, useVideoPlayer, type VideoAspectRatio } from '@/lib/video';
import { Shot01 } from './scenes/Shot01';
import { Shot02 } from './scenes/Shot02';
import { Shot03 } from './scenes/Shot03';
import { Shot04 } from './scenes/Shot04';
import { Shot05 } from './scenes/Shot05';
import { Shot06 } from './scenes/Shot06';

export const SCENE_DURATIONS = {
  shot01: 4500,
  shot02: 5000,
  shot03: 5500,
  shot04: 5000,
  shot05: 5000,
  shot06: 5000,
};
const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9';
const SCENE_COMPONENTS = [Shot01, Shot02, Shot03, Shot04, Shot05, Shot06];
const SCENE_START_SEC: Record<string, number> = (() => {
  const starts: Record<string, number> = {};
  let total = 0;
  Object.entries(SCENE_DURATIONS).forEach(([key, ms]) => { starts[key] = total / 1000; total += ms; });
  return starts;
})();
const AUDIO_EPSILON = 0.18;

export default function VideoTemplate({ durations = SCENE_DURATIONS, paused = false, muted = false, onSceneChange }: { durations?: Record<string, number>; paused?: boolean; muted?: boolean; onSceneChange?: (key: string) => void } = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop: true, paused });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSceneRef = useRef<string | null>(null);
  const baseKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseKey);
  const Scene = SCENE_COMPONENTS[Math.max(0, sceneIndex)];

  useEffect(() => { onSceneChange?.(currentSceneKey); }, [currentSceneKey, onSceneChange]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.48;
    if (paused) { audio.pause(); return; }
    if (lastSceneRef.current !== currentSceneKey) {
      lastSceneRef.current = currentSceneKey;
      const target = SCENE_START_SEC[baseKey] ?? 0;
      if (Math.abs(audio.currentTime - target) > AUDIO_EPSILON) audio.currentTime = target;
    }
    audio.play().catch(() => {});
  }, [baseKey, currentSceneKey, muted, paused]);

  return <VideoPausedContext.Provider value={paused}><VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} className="oscar-canvas" style={{ backgroundColor: 'var(--color-bg-dark)' }}>
    <div className="film-world"><AnimatePresence mode="sync">{Scene && <Scene key={currentSceneKey}/>}</AnimatePresence></div>
    <audio ref={audioRef} src={import.meta.env.BASE_URL + 'audio/bg_music.mp3'} preload="auto" autoPlay muted={muted}/>
  </VideoCanvas></VideoPausedContext.Provider>;
}
