import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AnimationClip, AnimationMixer, LoopOnce, LoopRepeat, Mesh, SkeletonHelper, type AnimationAction } from 'three';
import { X } from 'lucide-react';
import { createHumanoidDummy } from '../services/humanoidDummy';
import { builtinHumanoidPack, DEFAULT_HUMANOID_GAIT, HUMANOID_MOTIONS, type HumanoidGait, type HumanoidBodyProfile } from '../services/builtinHumanoidMotions';
import { HumanoidRigLayoutControls } from './HumanoidRigLayoutControls';
import { DEFAULT_HUMANOID_LAYOUT } from '../services/builtinHumanoidMotions';
import type { AnimationSource } from '../services/animationRetargeting';

function AnimatedDummy({pack,index,speed,playing,loop,skeleton,onPlaying}: {pack:AnimationSource;index:number;speed:number;playing:boolean;loop:boolean;skeleton:boolean;onPlaying:(value:boolean)=>void}){
  const dummy=useMemo(()=>createHumanoidDummy(pack),[pack]);
  const mixer=useMemo(()=>new AnimationMixer(dummy),[dummy]);
  const action=useRef<AnimationAction|null>(null);
  const helper=useMemo(()=>new SkeletonHelper(dummy),[dummy]);
  useEffect(()=>{
    const clip=AnimationClip.parse(pack.clips[index]);const hips=Object.keys(pack.bones).find((key)=>pack.bones[key].name==='Hips');
    for(const track of clip.tracks)if(track.name===`${hips}.position`)for(let offset=0;offset<track.values.length;offset+=3){track.values[offset]=0;track.values[offset+2]=0;}
    action.current=mixer.clipAction(clip);action.current.setLoop(loop?LoopRepeat:LoopOnce,loop?Infinity:1);action.current.clampWhenFinished=!loop;action.current.play();mixer.update(0);
    const finished=()=>onPlaying(false);mixer.addEventListener('finished',finished);
    return()=>{mixer.removeEventListener('finished',finished);mixer.stopAllAction();mixer.uncacheRoot(dummy);action.current=null;};
  },[dummy,mixer,pack,index,loop,onPlaying]);
  useEffect(()=>{if(playing&&action.current&&action.current.time>=action.current.getClip().duration-1e-5)action.current.reset().play();},[playing]);
  useFrame((_,delta)=>{if(playing)mixer.update(Math.min(delta,.1)*speed);});
  useEffect(()=>()=>{
    const resources=new Set<{dispose:()=>void}>();dummy.traverse((node)=>{if(node instanceof Mesh){resources.add(node.geometry);(Array.isArray(node.material)?node.material:[node.material]).forEach((material)=>resources.add(material));}});resources.forEach((resource)=>resource.dispose());helper.dispose();
  },[dummy,helper]);
  return <><primitive object={dummy} dispose={null}/>{skeleton&&<primitive object={helper}/>}</>;
}
type Props={source?:AnimationSource;speed:number;canApply:boolean;onClose:()=>void;onApply:(pack:AnimationSource,speed:number,index:number)=>void};
function SittingReferenceChair(){
  return <group><mesh position={[0,.445,-.07]}><boxGeometry args={[.46,.055,.43]}/><meshStandardMaterial color="#496579" roughness={.8}/></mesh><mesh position={[0,.73,-.275]}><boxGeometry args={[.46,.52,.045]}/><meshStandardMaterial color="#496579" roughness={.8}/></mesh>{[-1,1].flatMap((x)=>[-1,1].map((z)=><mesh key={`${x}:${z}`} position={[x*.19,.215,-.07+z*.16]}><boxGeometry args={[.045,.43,.045]}/><meshStandardMaterial color="#263f52" roughness={.8}/></mesh>))}</group>;
}
export function HumanoidMotionDesigner({source,speed:initialSpeed,canApply,onClose,onApply}:Props){
  const [rigLayout,setRigLayout]=useState(source?.rigLayout || DEFAULT_HUMANOID_LAYOUT);
  const [bodyProfile,setBodyProfile]=useState<HumanoidBodyProfile>(source?.bodyProfile || 'neutral');
  const [gait,setGait]=useState<HumanoidGait>({...DEFAULT_HUMANOID_GAIT,...source?.gait});
  const [settledGait,setSettledGait]=useState(gait);const [speed,setSpeed]=useState(initialSpeed);const [index,setIndex]=useState(1);
  const [playing,setPlaying]=useState(true);const [loop,setLoop]=useState(true);const [skeleton,setSkeleton]=useState(false);const [restart,setRestart]=useState(0);
  const [error,setError]=useState('');const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const timer=window.setTimeout(()=>setSettledGait(gait),120);return()=>window.clearTimeout(timer);},[gait]);
  const pack=useMemo(()=>builtinHumanoidPack(settledGait,source,bodyProfile,rigLayout),[settledGait,source,bodyProfile,rigLayout]);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';close.current?.focus();return()=>{document.body.style.overflow=overflow;previous?.focus();};},[]);
  const controls:Array<{key:keyof HumanoidGait;label:string;min:number;max:number;step:number;unit:string}>=[
    {key:'strideLength',label:'Stride length',min:.2,max:1.8,step:.05,unit:'×'},
    {key:'armSwing',label:'Arm swing',min:0,max:2,step:.05,unit:'×'},
    {key:'bodyLean',label:'Body lean',min:-20,max:35,step:1,unit:'°'},
    {key:'bounce',label:'Body bounce',min:0,max:2,step:.05,unit:'×'},
    {key:'kneeLift',label:'Knee lift',min:.1,max:1.8,step:.05,unit:'×'},
  ];
  return createPortal(<div className="humanoid-designer-overlay" onMouseDown={(event)=>event.stopPropagation()} onKeyDown={(event)=>{
    event.stopPropagation();if(event.key==='Escape'){event.preventDefault();onClose();}
    if(event.key==='Tab'){const targets=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]'));const first=targets[0],last=targets[targets.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }}><section className="humanoid-designer" role="dialog" aria-modal="true" aria-label="Human motion designer"><header><div><h2>Human motion designer</h2><p>Try movement on the dummy first. Apply it to your model when you’re ready.</p></div><button ref={close} type="button" aria-label="Close human motion designer" onClick={onClose}><X size={20}/></button></header>
    <div className="humanoid-designer-body"><div className="humanoid-designer-preview"><Canvas camera={{position:[2.5,1.6,3.2],fov:40}} dpr={[1,1.5]}><ambientLight intensity={1.5}/><directionalLight position={[3,5,4]} intensity={2}/><directionalLight position={[-3,3,-2]} intensity={.8}/><AnimatedDummy key={restart} pack={pack} index={index} speed={speed} playing={playing} loop={loop} skeleton={skeleton} onPlaying={setPlaying}/>{(HUMANOID_MOTIONS[index].id.startsWith('sit')||HUMANOID_MOTIONS[index].id==='standUp')&&<SittingReferenceChair/>}<mesh position={[0,-.04,0]}><cylinderGeometry args={[.72,.78,.05,48]}/><meshStandardMaterial color="#142d3d" roughness={.9}/></mesh><OrbitControls makeDefault target={[0,1,0]} minDistance={1.2} maxDistance={8}/></Canvas><span>Human dummy · Drag to rotate · Scroll to zoom</span></div>
    <div className="humanoid-designer-controls"><label>Preview motion<select aria-label="Dummy preview motion" value={index} onChange={(event)=>{setIndex(Number(event.target.value));setPlaying(true);}}>{HUMANOID_MOTIONS.map((motion,position)=><option key={motion.id} value={position}>{motion.label}</option>)}</select></label>
      <div className="humanoid-designer-buttons"><button type="button" onClick={()=>setPlaying((value)=>!value)}>{playing?'Pause dummy':'Play dummy'}</button><button type="button" onClick={()=>{setRestart((value)=>value+1);setPlaying(true);}}>Restart dummy</button></div>
      <label><input type="checkbox" checked={loop} onChange={(event)=>setLoop(event.target.checked)}/> Loop preview</label><label><input type="checkbox" checked={skeleton} onChange={(event)=>setSkeleton(event.target.checked)}/> Show dummy skeleton</label>
      <label>Rig profile<select aria-label="Humanoid rig profile" value={bodyProfile} onChange={(event)=>setBodyProfile(event.target.value as HumanoidBodyProfile)}><option value="neutral">Neutral</option><option value="female">Female</option><option value="male">Male</option></select></label>
      <p>Profiles adjust the starter rig’s chest and glute joint spacing. Both include optional paired joints; your imported model needs matching bones and skin weights to use them. Show dummy skeleton to inspect the layout.</p>
      <HumanoidRigLayoutControls layout={rigLayout} onChange={setRigLayout}/>
      <h3>Movement style</h3><p>These adjustments shape Walk, Run, Sprint, and Dash. The other motions keep their starter poses.</p>
      <p>Smoother adventure-game motion: foot contact, eased steps, relaxed shoulders, and counter-swinging hips. Seated clips expect a chair-height surface.</p>
      <label>Cadence <output>{speed.toFixed(2)}×</output><input type="range" aria-label="Dummy cadence" min=".25" max="2" step=".05" value={speed} onChange={(event)=>setSpeed(Number(event.target.value))}/></label>
      {controls.map((control)=><label key={control.key}>{control.label}<output>{Number(gait[control.key].toFixed(2))}{control.unit}</output><input type="range" aria-label={`Dummy ${control.label.toLowerCase()}`} min={control.min} max={control.max} step={control.step} value={gait[control.key]} onChange={(event)=>setGait((value)=>({...value,[control.key]:Number(event.target.value)}))}/></label>)}
      <div className="humanoid-designer-buttons"><button type="button" onClick={()=>{setGait(DEFAULT_HUMANOID_GAIT);setSpeed(1);}}>Reset style</button><button type="button" onClick={()=>{setGait({strideLength:.75,armSwing:.65,bodyLean:0,bounce:.6,kneeLift:.75});setSpeed(.8);}}>Relaxed</button><button type="button" onClick={()=>{setGait({strideLength:1.2,armSwing:1.3,bodyLean:8,bounce:1.2,kneeLift:1.2});setSpeed(1.2);}}>Energetic</button></div>
      {error&&<p role="alert">{error}</p>}
      <footer><p>{canApply?'Applying updates the editable motion pack. Save model changes or a named preset to keep your version.':'Preview freely on the dummy. A rigged character is required before you can apply this motion.'}</p><div className="humanoid-designer-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={!canApply} onClick={()=>{try{onApply(builtinHumanoidPack(gait,source,bodyProfile,rigLayout),speed,index);}catch(reason){setError(reason instanceof Error?reason.message:'Could not apply this movement.');}}}>Apply to my model</button></div></footer>
    </div></div>
  </section></div>,document.body);
}
