import { useMemo } from 'react';
import type { Group } from 'three';
import { DEFAULT_RETARGETING,rigBones,type AnimationRetargeting,type SecondaryMotionSettings } from '../services/animationRetargeting';
import { DEFAULT_SECONDARY_MOTION,secondaryBoneCandidates,type SecondaryChannel } from '../services/secondaryMotion';

export function SecondaryMotionControls({scene,config,onChange}:{scene:Group;config?:AnimationRetargeting;onChange?:(value:AnimationRetargeting)=>void}){
  const bones=useMemo(()=>rigBones(scene),[scene]);const current=config||DEFAULT_RETARGETING;
  const update=(channel:SecondaryChannel,values:Partial<SecondaryMotionSettings>)=>onChange?.({...current,secondaryMotion:{...current.secondaryMotion,[channel]:{...DEFAULT_SECONDARY_MOTION,...current.secondaryMotion?.[channel],...values}}});
  const controls:Array<{key:keyof Pick<SecondaryMotionSettings,'strength'|'damping'|'rate'|'delay'|'duration'>;label:string;min:number;max:number;step:number;unit:string}>=[
    {key:'strength',label:'Strength',min:0,max:2,step:.05,unit:'×'},
    {key:'damping',label:'Damping',min:0,max:1,step:.05,unit:''},
    {key:'rate',label:'Sway rate',min:.2,max:3,step:.1,unit:'Hz'},
    {key:'delay',label:'Start delay',min:0,max:60,step:.1,unit:'s'},
    {key:'duration',label:'Duration',min:.25,max:60,step:.25,unit:'s'},
  ];
  return <section className="agent-secondary-motion" aria-label="Secondary motion"><h3>Secondary motion & timing</h3><p>Optional bone-based motion for clothing and adult avatars. This needs suitable bones; it does not create cloth physics or new joints inside imported meshes.</p>
    {(['chest','clothes','glutes'] as const).map((channel)=>{
      const settings={...DEFAULT_SECONDARY_MOTION,...current.secondaryMotion?.[channel]};const candidates=secondaryBoneCandidates(bones,channel);const selected=settings.boneIds??candidates.map((bone)=>bone.id);const title=channel==='chest'?'Chest motion':channel==='glutes'?'Glute motion':'Clothing sway';
      return <details key={channel}><summary>{title}<span>{settings.enabled?'On':'Off'}</span></summary><label><input type="checkbox" checked={settings.enabled} onChange={(event)=>update(channel,{enabled:event.target.checked})}/> Enable {title.toLowerCase()}</label>
        {controls.map((control)=><label key={control.key}>{control.label}<span>{settings[control.key]} {control.unit}</span><input type="number" aria-label={`${title} ${control.label.toLowerCase()}`} min={control.min} max={control.max} step={control.step} key={`${channel}:${control.key}:${settings[control.key]}`} defaultValue={settings[control.key]} onBlur={(event)=>{const value=event.currentTarget.valueAsNumber;if(Number.isFinite(value))update(channel,{[control.key]:Math.min(control.max,Math.max(control.min,value))});}}/></label>)}
        <label><input type="checkbox" checked={settings.loop} onChange={(event)=>update(channel,{loop:event.target.checked})}/> Loop timed motion</label><p>Start delay runs once. Duration sets the active cycle; each cycle fades in and out softly.</p>
        <button type="button" onClick={()=>update(channel,{})}>Restart {title.toLowerCase()} preview</button>
        <h4>Affected bones ({selected.length})</h4>{!candidates.length&&!selected.length&&<p>No matching bones were detected. Select a suitable bone manually below.</p>}
        <div className="agent-secondary-bones">{selected.map((id)=><label key={id}><input type="checkbox" checked onChange={()=>update(channel,{boneIds:selected.filter((key)=>key!==id)})}/>{bones.find((bone)=>bone.id===id)?.name||'Missing bone'}</label>)}</div>
        <label>Add a bone<select aria-label={`${title} add bone`} value="" onChange={(event)=>{if(event.target.value)update(channel,{boneIds:[...new Set([...selected,event.target.value])]});}}><option value="">Choose a model bone…</option>{bones.filter((bone)=>!selected.includes(bone.id)).map((bone)=><option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label>
        <button type="button" onClick={()=>update(channel,{boneIds:undefined})}>Auto-detect {title.toLowerCase()} bones</button>
      </details>;
    })}
  </section>;
}
