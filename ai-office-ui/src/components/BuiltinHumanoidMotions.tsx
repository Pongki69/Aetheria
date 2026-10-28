import { useState } from 'react';
import type { AnimationClip, Group } from 'three';
import { builtinHumanoidPack, HUMANOID_MOTIONS, HUMANOID_PACK_ID, HUMANOID_MOTION_VERSION, humanoidMotionName } from '../services/builtinHumanoidMotions';
import { suggestAnimationBones } from '../services/animationImport';
import type { MotionSettings } from './AnimationRetargetingControls';
import { DEFAULT_RETARGETING, type AnimationSource } from '../services/animationRetargeting';
import { HumanoidMotionDesigner } from './HumanoidMotionDesigner';

type Props=MotionSettings & {scene:Group;clips:AnimationClip[];hasSkeleton:boolean;onPreview:(value:string)=>void};
export function BuiltinHumanoidMotions({scene,clips,hasSkeleton,onPreview,animationRetargeting,onAnimationRetargeting,idleAnimation,walkingAnimation,onIdleAnimation,onWalkingAnimation}:Props){
  const [notice,setNotice]=useState('');const [error,setError]=useState('');
  const [designerOpen,setDesignerOpen]=useState(false);
  const installed=animationRetargeting?.sources?.find((source)=>source.id===HUMANOID_PACK_ID);
  const useMotion=(index:number,customPack?:AnimationSource,customSpeed?:number)=>{
    if(!onAnimationRetargeting)return;
    try{
      const config=animationRetargeting||DEFAULT_RETARGETING;
      const existing=config.sources?.find((source)=>source.id===HUMANOID_PACK_ID);
      const pack=customPack||(existing?.motionVersion===HUMANOID_MOTION_VERSION?existing:builtinHumanoidPack(existing?.gait,existing));
      const suggested=suggestAnimationBones(scene,pack);
      const boneMap={...suggested,...config.boneMap};
      const sources=existing?config.sources!.map((source)=>source.id===HUMANOID_PACK_ID?pack:source):[...(config.sources||[]),pack];
      if(JSON.stringify(sources).length>30_000_000)throw new Error('Remove an unused animation source before adding the starter pack.');
      onAnimationRetargeting({...config,sources,boneMap,speed:customSpeed??config.speed});
      if(!idleAnimation)onIdleAnimation?.(humanoidMotionName('idle'));
      if(!walkingAnimation)onWalkingAnimation?.(humanoidMotionName('walk'));
      const clipName=pack.clips[index].name;const currentIndex=clips.findIndex((clip)=>clip.name===clipName);
      const installedStart=existing?clips.findIndex((clip)=>existing.clips.some((item)=>item.name===clip.name)):clips.length;
      onPreview(String(currentIndex>=0?currentIndex:Math.max(0,installedStart)+index));
      const mapped=Object.keys(pack.bones).filter((name)=>boneMap[name]&&boneMap[name]!=='__ignore').length;
      setError('');setNotice(`${HUMANOID_MOTIONS[index].label} ready · ${mapped}/${Object.keys(pack.bones).length} bones assigned. Fine-tune Rig matching if needed.`);
      if(customPack)setDesignerOpen(false);
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not add this motion.');if(customPack)throw reason;}
  };
  return <section className="agent-builtin-motions" aria-label="Built-in humanoid motions"><h3>Humanoid starter motions</h3><p>Preview movement on a human dummy first, then customize it before applying it to your character.</p>
    <button className="agent-open-motion-designer" type="button" onClick={()=>setDesignerOpen(true)}>Customize on human dummy</button>
    {installed?.motionVersion!==HUMANOID_MOTION_VERSION && installed && <p>The updated rig lowers Spine2 away from the shoulders and adds optional chest/glute joints. Pick a starter motion or open the dummy designer to update this pack while keeping your bone assignments.</p>}
    {installed && installed.motionVersion!==HUMANOID_MOTION_VERSION && <button type="button" disabled={!hasSkeleton||!onAnimationRetargeting} onClick={()=>useMotion(0,builtinHumanoidPack(installed.gait,installed))}>Update starter rig</button>}
    {designerOpen&&<HumanoidMotionDesigner canApply={hasSkeleton&&!!onAnimationRetargeting} source={animationRetargeting?.sources?.find((source)=>source.id===HUMANOID_PACK_ID)} speed={animationRetargeting?.speed||1} onClose={()=>setDesignerOpen(false)} onApply={(pack,speed,index)=>useMotion(index,pack,speed)}/>}
    <div>{HUMANOID_MOTIONS.map((motion,index)=><button type="button" key={motion.id} aria-label={`Preview built-in ${motion.label}`} disabled={!hasSkeleton||!onAnimationRetargeting} onClick={()=>useMotion(index)}><strong>{motion.label}</strong><small>{motion.loop?'Loop':'One-shot'}</small></button>)}</div>
    {!hasSkeleton&&<p>A skeleton is required. Import a rigged character to use these motions.</p>}
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
    <p>The shoulder branches rise from the lower chest in a V, with the neck continuing up the center. Idle and Walk are assigned when those slots are empty. Keep your adjustments with Save model changes or a named motion preset.</p>
  </section>;
}
