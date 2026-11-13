import { useEffect, useRef, useState } from 'react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';
import { SCENE_DETAILS } from './sceneMeta';

const TITLES = ['افتتاحية', 'الفكرة والبناء', 'التجربة الرقمية', 'التفاصيل', 'الحضور', 'الختام'];
function PlaybackStatus({ keys, activeIndex, tick, paused, onJump }: { keys: string[]; activeIndex: number; tick: number; paused: boolean; onJump: (index: number) => void }) {
 const [elapsed, setElapsed] = useState(0); const base = useRef(0);
 useEffect(() => { setElapsed(0); base.current = 0; }, [tick]);
 useEffect(() => { if (paused) return; const started = performance.now(); const id = window.setInterval(() => setElapsed(base.current + performance.now() - started), 80); return () => { window.clearInterval(id); base.current += performance.now() - started; }; }, [tick, paused]);
 const durations = Object.values(SCENE_DURATIONS); const total = durations.reduce((a,b)=>a+b,0); const activeStart = durations.slice(0,activeIndex).reduce((a,b)=>a+b,0); const progress = Math.min(1, elapsed/(durations[activeIndex] || 1)); const current = Math.min(total, activeStart + elapsed); const fmt = (ms:number) => Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0');
 return <><div className="control-segments">{keys.map((key,i)=><button key={key} className="control-segment" aria-label={'انتقل إلى '+TITLES[i]} onClick={()=>onJump(i)}><span style={{ transform: 'scaleX('+(i===activeIndex?progress:i<activeIndex?1:0)+')' }}/></button>)}</div><div className="control-count">{String(activeIndex+1).padStart(2,'0')}<i>/</i>{String(keys.length).padStart(2,'0')}</div><div className="control-time">{fmt(current)} <i>/</i> {fmt(total)}</div></>;
}
export default function VideoWithControls() {
 const iframe = typeof window !== 'undefined' && window.self !== window.top;
 const state = useSceneControls(SCENE_DURATIONS); const [collapsed, setCollapsed] = useState(false); const [hover, setHover] = useState(false); const [touchPin, setTouchPin] = useState(false); const sensor = useRef<HTMLDivElement|null>(null);
 useEffect(() => { if (!state.paused) return; const running = document.getAnimations().filter(animation => animation.playState === 'running'); running.forEach(animation => animation.pause()); return () => running.forEach(animation => animation.play()); }, [state.paused]);
 useEffect(() => { if (!(collapsed && touchPin)) return; const onDown=(e:PointerEvent)=>{ if(e.pointerType!=='mouse' && sensor.current && !sensor.current.contains(e.target as Node)) setTouchPin(false); }; document.addEventListener('pointerdown',onDown); return()=>document.removeEventListener('pointerdown',onDown); },[collapsed,touchPin]);
 const handleJump = (index: number) => {
  state.jumpTo(index);
  const key = state.keys[index];
  const details = SCENE_DETAILS[key];
  if (details?.filePath && typeof window !== 'undefined' && window.self !== window.top) {
   window.parent.postMessage({ type: 'REPLIT_VIDEO_SCENE_SELECTED', payload: { sceneIndex: index, sceneCount: state.keys.length, sceneTitle: details.title, filePath: details.filePath, lineNumber: 1 } }, '*');
  }
 };
 if (!iframe) return <VideoTemplate/>;
 const visible = !collapsed || hover || touchPin;
 return <div className="video-with-controls"><VideoTemplate key={state.mountKey} durations={state.durations} paused={state.paused} muted={state.muted} onSceneChange={state.onSceneChange}/><div ref={sensor} className="control-sensor" onPointerEnter={e=>{if(e.pointerType==='mouse')setHover(true)}} onPointerLeave={e=>{if(e.pointerType==='mouse')setHover(false)}} onPointerDown={e=>{if(e.pointerType!=='mouse'&&collapsed)setTouchPin(true)}}><div className="control-spacer"/><div className={'control-bar '+(visible?'is-visible':'is-hidden')}>
 <button className="control-icon" onClick={state.togglePause} aria-label={state.paused?'تشغيل':'إيقاف مؤقت'}>{state.paused?'▶':'Ⅱ'}</button>
 <button className={'control-icon '+(state.locked?'control-active':'')} onClick={state.toggleLock} aria-label="تكرار المشهد الحالي" aria-pressed={state.locked}>↻</button>
 <button className="control-icon" onClick={state.toggleMute} aria-label={state.muted?'تشغيل الصوت':'كتم الصوت'}>{state.muted?'◖':'♫'}</button>
 <span className="control-divider"/><PlaybackStatus keys={state.keys} activeIndex={state.activeIndex} tick={state.tick} paused={state.paused} onJump={handleJump}/>
 <button className="control-icon control-collapse" onClick={()=>{setCollapsed(value=>!value);setHover(false);setTouchPin(false)}} aria-label={collapsed?'إظهار أدوات التشغيل':'إخفاء أدوات التشغيل'}>{collapsed?'⌃':'⌄'}</button>
 </div></div></div>;
}
