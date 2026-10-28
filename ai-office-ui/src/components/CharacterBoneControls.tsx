import { useMemo, useState } from 'react';
import { Box3, Vector3, type Group } from 'three';
import { DEFAULT_RETARGETING, rigBones, type AnimationRetargeting, type BoneAdjustment } from '../services/animationRetargeting';

export function CharacterBoneControls({scene, config = DEFAULT_RETARGETING, onChange, onShowSkeleton, onRestPose, onFocusBone}: {
  scene: Group; config?: AnimationRetargeting; onChange?: (value: AnimationRetargeting) => void;
  onShowSkeleton: (value: boolean) => void; onRestPose: () => void;
  onFocusBone?: (id: string) => void;
}) {
  const bones = useMemo(() => rigBones(scene), [scene]);
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState('');
  const selected = bones.find((bone) => bone.id === selection) || bones[0];
  const adjustment = config.boneAdjustments?.[selected?.id || ''] || {};
  const span = useMemo(() => {scene.updateWorldMatrix(true, true); return Math.max(new Box3().setFromObject(scene).getSize(new Vector3()).length() * .25, .01);}, [scene]);
  const change = (kind: keyof BoneAdjustment, axis: number, value: number) => {
    if (!selected || !Number.isFinite(value)) return;
    const values: [number,number,number] = [...(adjustment[kind] || [0,0,0])]; values[axis] = value;
    onChange?.({...config, boneAdjustments:{...config.boneAdjustments, [selected.id]:{...adjustment, [kind]:values}}});
  };
  return <section className="agent-character-bones" aria-label="Character bone adjustments">
    <h3>Adjust your character’s bones</h3>
    <p>No animation or comparison model needed. These controls move the actual joints and the mesh attached to them. Start small; position changes can stretch the character.</p>
    {!bones.length ? <p>No editable skeleton was found in this model.</p> : <>
      <button type="button" onClick={() => {onRestPose(); onShowSkeleton(true);}}>Edit in rest pose</button>
      <label><input type="checkbox" aria-label="Align mesh to skeleton rest pose" checked={!!config.rebindSkeleton} disabled={!onChange} onChange={(event)=>{onRestPose();onShowSkeleton(true);onChange?.({...config,rebindSkeleton:event.target.checked});}}/> Align mesh to skeleton rest pose</label>
      <p>Try this when the mesh and skeleton face different directions in rest pose. Uncheck to restore the original binding. If you previously tilted the whole model, reset its orientation under Adjust after aligning.</p>
      <label>Find character bone<input type="search" aria-label="Find character bone" placeholder="e.g. hips, spine, arm…" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
      <label>Character bone<select aria-label="Character bone to adjust" value={selected?.id || ''} onChange={(event) => {setSelection(event.target.value); onShowSkeleton(true);}}>
        {bones.filter((bone) => bone.id === selected?.id || bone.name.toLowerCase().includes(search.toLowerCase())).map((bone) => <option key={bone.id} value={bone.id}>{'· '.repeat(Math.min(bone.depth,5))}{bone.name}</option>)}
      </select></label>
      {onFocusBone && <button type="button" onClick={()=>{if(selected)onFocusBone(selected.id);}}>Focus selected bone</button>}
      {(['rotation','position'] as const).map((kind) => <fieldset key={kind}><legend>{kind === 'rotation' ? 'Local rotation (degrees)' : 'Local position offset (model units)'}</legend>
        {(['X','Y','Z'] as const).map((axis,index) => {const value=adjustment[kind]?.[index] || 0; const limit=kind==='rotation'?180:span; const step=kind==='rotation'?1:Math.max(Number((span/1000).toPrecision(2)),.00001);
          return <label className="agent-bone-axis" key={`${selected?.id}-${kind}-${axis}`}><span>{axis}</span>
            <input type="range" aria-label={`Character bone ${kind} ${axis} slider`} min={Math.min(-limit,value)} max={Math.max(limit,value)} step={step} value={value} disabled={!onChange} onChange={(event)=>change(kind,index,Number(event.target.value))}/>
            <input type="number" aria-label={`Character bone ${kind} ${axis}`} step={step} key={value} defaultValue={value} disabled={!onChange} onBlur={(event)=>change(kind,index,event.currentTarget.valueAsNumber)} onKeyDown={(event)=>{if(event.key==='Enter')event.currentTarget.blur();}}/>
          </label>;
        })}
      </fieldset>)}
      <button type="button" disabled={!onChange || !config.boneAdjustments?.[selected?.id || '']} onClick={()=>{if(!selected)return;const next={...config.boneAdjustments};delete next[selected.id];onChange?.({...config,boneAdjustments:next});}}>Reset this character bone</button>
      <button type="button" disabled={!onChange || !Object.keys(config.boneAdjustments || {}).length} onClick={()=>onChange?.({...config,boneAdjustments:{}})}>Reset all character bone adjustments</button>
      <p>Adjustments also apply during animations. Save model changes to keep them. This changes the pose; it does not rebuild how the mesh is attached to the skeleton.</p>
    </>}
  </section>;
}
