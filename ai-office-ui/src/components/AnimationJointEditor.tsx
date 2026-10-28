import { useState } from 'react';
import type { AnimationSource } from '../services/animationRetargeting';
import { canDeleteAnimationJoint, editAnimationJoint } from '../services/animationJointEditing';

export function AnimationJointEditor({source,selected,onChange}: {source:AnimationSource;selected?:string;onChange:(source:AnimationSource,selection?:string)=>void}) {
  const [name,setName]=useState(''),[position,setPosition]=useState<[number,number,number]>([0,.05,0]),[error,setError]=useState('');
  const parent=source.bones[selected||''];
  return <details className="agent-animation-joint-editor"><summary>Add or delete animation joints</summary><div>
    <p>Select a joint on the animation rig. Add creates a child joint; delete reconnects its children and preserves their source animation. Your character’s mesh and bones are unchanged.</p>
    <strong>{parent?`Selected: ${parent.name}`:'Select an animation joint first'}</strong>
    <label>New joint name<input aria-label="New animation joint name" maxLength={80} value={name} placeholder="e.g. LeftArmHelper" onChange={(event)=>setName(event.target.value)}/></label>
    <fieldset><legend>Offset from parent (model units)</legend>{(['X','Y','Z'] as const).map((axis,index)=><label key={axis}>{axis}<input type="number" aria-label={`New animation joint offset ${axis}`} step="0.01" value={position[index]} onChange={(event)=>{const value=event.currentTarget.valueAsNumber;if(Number.isFinite(value))setPosition((previous)=>previous.map((item,i)=>i===index?value:item) as [number,number,number]);}}/></label>)}</fieldset>
    <div className="agent-joint-edit-actions"><button type="button" disabled={!parent||!name.trim()} onClick={()=>{try{const id=crypto.randomUUID().replace(/-/g,'');const alias=`custom_${id}`;const next=editAnimationJoint(source,{kind:'add',id:`joint_${id}`,alias,name:name.trim(),parentAlias:selected!,position:[...position]});onChange(next,alias);setName('');setError('');}catch(reason){setError(reason instanceof Error?reason.message:'Could not add this joint.');}}}>Add child joint</button>
      <button type="button" disabled={!canDeleteAnimationJoint(source,selected)} onClick={()=>{try{const node=source.rig?.find((entry)=>entry.id===parent.nodeId);const parentAlias=Object.keys(source.bones).find((alias)=>source.bones[alias].nodeId===node?.parent);onChange(editAnimationJoint(source,{kind:'delete',alias:selected!}),parentAlias);setError('');}catch(reason){setError(reason instanceof Error?reason.message:'Could not delete this joint.');}}}>Delete selected joint</button></div>
    {!canDeleteAnimationJoint(source,selected)&&parent&&<small>The root joint is kept so the animation can still move as a whole.</small>}
    {error&&<p role="alert">{error}</p>}
    <small>Use Undo to recover a deleted joint. Save model changes or a motion preset to keep edits.</small>
  </div></details>;
}
