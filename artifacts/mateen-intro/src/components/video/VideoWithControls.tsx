import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Repeat, Volume2, VolumeX, ChevronDown, ChevronUp } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';
import { titles } from './content';
function Progress({ active, paused, tick, jump }: { active: number; paused: boolean; tick: number; jump: (i:number)=>void }) {
  const times = Object.values(SCENE_DURATIONS);
  const [elapsed, setElapsed] = useState(0);
  const base = useRef(0);
  useEffect(() => { base.current = 0; setElapsed(0); }, [tick]);
  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const timer = setInterval(() => setElapsed(base.current + performance.now() - start), 60);
    return () => { clearInterval(timer); base.current += performance.now() - start; };
  }, [tick, paused]);
  const seconds = Math.floor((times.slice(0, active).reduce((a,b)=>a+b,0) + Math.min(elapsed,times[active])) / 1000);
  return <><div style={{ display:'flex',gap:6,flex:1 }}>{times.map((t,i) => <button title={titles[i]} aria-label={`المشهد ${i+1}: ${titles[i]}`} key={i} onClick={()=>jump(i)} style={{ flex:1,height:12,borderRadius:10,border:0,padding:0,background:'#ffffff33',overflow:'hidden' }}><div style={{ width: i===active ? `${Math.min(100,elapsed/t*100)}%` : '0%',height:'100%',background:'#fff' }}/></button>)}</div><span style={{fontFamily:'monospace',whiteSpace:'nowrap'}}>{active+1}/{times.length} · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} / 2:00</span></>;
}
export default function VideoWithControls() {
  const c = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const sensor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!c.paused) return;
    const animations = document.getAnimations().filter(a=>a.playState==='running');
    animations.forEach(a=>a.pause()); return ()=>animations.forEach(a=>a.play());
  }, [c.paused]);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if(e.pointerType!=='mouse'&&!sensor.current?.contains(e.target as Node))setPinned(false); };
    document.addEventListener('pointerdown',outside); return ()=>document.removeEventListener('pointerdown',outside);
  }, []);
  if (window.self === window.top) return <VideoTemplate/>;
  const visible = !collapsed || hover || pinned;
  const jump = (i:number) => {
    c.jumpTo(i);
    window.parent.postMessage({type:'REPLIT_VIDEO_SCENE_SELECTED',payload:{sceneIndex:i,sceneCount:Object.keys(SCENE_DURATIONS).length,sceneTitle:titles[i],filePath:'src/components/video/FilmScenes.tsx',lineNumber:1}},'*');
  };
  const buttonStyle = { background:'transparent',border:0,color:'white',width:44,height:44,display:'grid',placeItems:'center' };
  return <div style={{position:'relative',height:'100vh'}}>
    <VideoTemplate key={c.mountKey} durations={c.durations} paused={c.paused} muted={muted} onSceneChange={c.onSceneChange}/>
    <div ref={sensor} style={{position:'absolute',bottom:0,left:0,right:0,height:'25%',zIndex:50,display:'flex',flexDirection:'column',justifyContent:'end'}}
      onPointerEnter={e=>e.pointerType==='mouse'&&setHover(true)} onPointerLeave={e=>e.pointerType==='mouse'&&setHover(false)} onPointerDown={e=>e.pointerType!=='mouse'&&setPinned(true)}>
      <div style={{flex:1}}/>
      <div aria-hidden={!visible} style={{display:'flex',gap:10,alignItems:'center',padding:'8px 16px',color:'white',background:'#241b16e8',transform:visible?'none':'translateY(100%)',opacity:visible?1:0,pointerEvents:visible?'auto':'none',transition:'transform .2s,opacity .2s'}}>
        <button style={buttonStyle} aria-label={c.paused?'تشغيل':'إيقاف'} onClick={c.togglePause}>{c.paused?<Play/>:<Pause/>}</button>
        <button style={{...buttonStyle,background:c.locked?'#ffffff33':'transparent'}} aria-label="تكرار المشهد" aria-pressed={c.locked} onClick={c.toggleLock}><Repeat/></button>
        <button style={buttonStyle} aria-label={muted?'تشغيل الصوت':'كتم الصوت'} onClick={()=>setMuted(v=>!v)}>{muted?<VolumeX/>:<Volume2/>}</button>
        <Progress active={c.activeIndex} paused={c.paused} tick={c.tick} jump={jump}/>
        <button style={buttonStyle} aria-label="إظهار أو إخفاء التحكم" onClick={()=>{setCollapsed(v=>!v);setHover(false);setPinned(false);}}>{collapsed?<ChevronUp/>:<ChevronDown/>}</button>
      </div>
    </div>
  </div>;
}
