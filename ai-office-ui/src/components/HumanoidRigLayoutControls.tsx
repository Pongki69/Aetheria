import type { HumanoidRigLayout } from '../services/animationRetargeting';
import { DEFAULT_HUMANOID_LAYOUT, normalizeHumanoidLayout } from '../services/builtinHumanoidMotions';

export function HumanoidRigLayoutControls({layout,onChange}: {layout?:HumanoidRigLayout;onChange:(value:HumanoidRigLayout)=>void}) {
  const current=normalizeHumanoidLayout(layout);
  const counts:Array<{key:keyof Pick<HumanoidRigLayout,'upperArmTwists'|'forearmTwists'|'upperLegTwists'|'lowerLegTwists'|'spineSegments'|'neckSegments'|'fingerSegments'>;label:string;min:number;max:number}>=[
    {key:'upperArmTwists',label:'Upper arm twist joints',min:0,max:3},{key:'forearmTwists',label:'Forearm twist joints',min:0,max:3},
    {key:'upperLegTwists',label:'Thigh twist joints',min:0,max:3},{key:'lowerLegTwists',label:'Shin twist joints',min:0,max:3},
    {key:'spineSegments',label:'Spine joints',min:1,max:3},{key:'neckSegments',label:'Neck joints',min:1,max:2},{key:'fingerSegments',label:'Joints per finger',min:0,max:3},
  ];
  return <details className="agent-rig-layout"><summary>Customize joint counts</summary><div className="agent-rig-layout-body">
    <p>Adjust the animation skeleton to match your model. Counts apply to each side. Core elbows and knees stay intact; this does not add bones or skin weights to your imported model.</p>
    <div className="agent-rig-layout-counts">{counts.map(({key,label,min,max})=><label key={key}>{label}<input type="number" aria-label={label} min={min} max={max} step="1" key={current[key]} defaultValue={current[key]} onBlur={(event)=>{const value=event.currentTarget.valueAsNumber;if(Number.isFinite(value))onChange(normalizeHumanoidLayout({...current,[key]:value}));}} onKeyDown={(event)=>{if(event.key==='Enter')event.currentTarget.blur();}}/></label>)}</div>
    <div className="agent-rig-layout-options">{([['shoulders','Shoulder joints'],['toeEnds','Toe end joints'],['chest','Paired chest joints'],['glutes','Paired glute joints']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={current[key]} onChange={(event)=>onChange({...current,[key]:event.target.checked})}/>{label}</label>)}</div>
    <p>Each arm: {3+Number(current.shoulders)+current.upperArmTwists+current.forearmTwists} joints, plus {5*current.fingerSegments} finger joints. Each leg: {4+current.upperLegTwists+current.lowerLegTwists+Number(current.toeEnds)} joints.</p>
    <div className="agent-rig-layout-actions"><button type="button" onClick={()=>onChange({...DEFAULT_HUMANOID_LAYOUT,upperArmTwists:0,forearmTwists:0,spineSegments:2,neckSegments:1,fingerSegments:0,toeEnds:false,chest:false,glutes:false})}>Simple rig</button><button type="button" onClick={()=>onChange({...DEFAULT_HUMANOID_LAYOUT})}>Default joints</button></div>
  </div></details>;
}
