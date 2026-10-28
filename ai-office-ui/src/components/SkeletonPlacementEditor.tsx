import { useLayoutEffect, useMemo, useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import { Group, type Group as ModelGroup } from 'three';
import type { AnimationRetargeting, SkeletonPlacement } from '../services/animationRetargeting';
import { DEFAULT_SKELETON_PLACEMENT, skeletonPivot } from '../services/skeletonPlacement';

export type SkeletonPlacementMode = 'translate' | 'rotate' | 'scale';
export type SkeletonEditor = {editing:boolean;mode:SkeletonPlacementMode;onEditing:(value:boolean)=>void;onMode:(value:SkeletonPlacementMode)=>void};

export function SkeletonPlacementControls({config,onChange,editor}: {config:AnimationRetargeting;onChange?:(value:AnimationRetargeting)=>void;editor:SkeletonEditor}) {
  const placement=config.skeletonPlacement || DEFAULT_SKELETON_PLACEMENT;
  const change=(kind:'position'|'rotation',axis:number,value:number)=>{
    if(!Number.isFinite(value))return;
    const values=[...placement[kind]] as [number,number,number];values[axis]=value;
    onChange?.({...config,skeletonPlacement:{...placement,[kind]:values}});
  };
  return <section className="agent-character-bones" aria-label="Whole skeleton placement"><h3>Place the whole skeleton</h3>
    <p>Move, rotate, or resize the skeleton over your model. The mesh stays in place; its existing skin weights are preserved.</p>
    <label><input type="checkbox" aria-label="Drag whole skeleton" checked={editor.editing} disabled={!onChange} onChange={(event)=>editor.onEditing(event.target.checked)}/> Drag whole skeleton</label>
    {editor.editing && <div className="agent-skeleton-modes">{(['translate','rotate','scale'] as const).map((mode)=><button type="button" aria-pressed={editor.mode===mode} key={mode} onClick={()=>editor.onMode(mode)}>{mode==='translate'?'Move':mode==='rotate'?'Rotate':'Scale'}</button>)}</div>}
    <p>{editor.editing?'Drag the colored arrows to move, rings to rotate, or scale handles to resize. Drag empty space to orbit.':'Enable dragging to show the 3D handles. Exact values below also work without dragging.'}</p>
    {(['position','rotation'] as const).map((kind)=><fieldset key={kind}><legend>{kind==='position'?'Skeleton position offset':'Skeleton rotation (degrees)'}</legend>{(['X','Y','Z'] as const).map((axis,index)=><label className="agent-skeleton-value" key={`${kind}-${axis}`}><span>{axis}</span><input type="number" aria-label={`Whole skeleton ${kind} ${axis}`} key={placement[kind][index]} defaultValue={placement[kind][index]} step={kind==='rotation'?1:.01} disabled={!onChange} onBlur={(event)=>change(kind,index,event.currentTarget.valueAsNumber)} onKeyDown={(event)=>{if(event.key==='Enter')event.currentTarget.blur();}}/></label>)}</fieldset>)}
    <label>Uniform scale<input aria-label="Whole skeleton scale" type="number" min="0.01" max="100" step="0.01" key={placement.scale} defaultValue={placement.scale} disabled={!onChange} onBlur={(event)=>{const value=event.currentTarget.valueAsNumber;if(Number.isFinite(value))onChange?.({...config,skeletonPlacement:{...placement,scale:Math.min(100,Math.max(.01,value))}});}} onKeyDown={(event)=>{if(event.key==='Enter')event.currentTarget.blur();}}/></label>
    <button type="button" disabled={!onChange||!config.skeletonPlacement} onClick={()=>onChange?.({...config,skeletonPlacement:undefined})}>Reset whole skeleton placement</button>
    <p>Turn off dragging when finished, then Save model changes. Placement can also be saved in a motion preset. Bone matching and individual joint adjustments remain separate.</p>
  </section>;
}

export function SkeletonPlacementGizmo({scene,modelRotation,placement=DEFAULT_SKELETON_PLACEMENT,mode,onChange,onEditStart,onEditEnd}: {scene:ModelGroup;modelRotation:[number,number,number];placement?:SkeletonPlacement;mode:SkeletonPlacementMode;onChange:(value:SkeletonPlacement)=>void;onEditStart?:()=>void;onEditEnd?:()=>void}) {
  const proxy=useMemo(()=>new Group(),[scene]);
  const pivot=useMemo(()=>skeletonPivot(scene),[scene]);
  const latest=useRef(placement);latest.current=placement;
  useLayoutEffect(()=>{
    proxy.position.set(...placement.position).add(pivot);
    proxy.rotation.set(...placement.rotation.map((angle)=>angle*Math.PI/180) as [number,number,number]);
    proxy.scale.setScalar(placement.scale);proxy.updateMatrixWorld(true);
  },[proxy,pivot,placement]);
  const update=()=>{
    const base=latest.current.scale;
    const values=proxy.scale.toArray().sort((a,b)=>Math.abs(b-base)-Math.abs(a-base));
    const scale=Math.max(.01,Math.min(100,Math.abs(values[0])));proxy.scale.setScalar(scale);
    onChange({position:proxy.position.clone().sub(pivot).toArray(),rotation:[proxy.rotation.x,proxy.rotation.y,proxy.rotation.z].map((angle)=>angle*180/Math.PI) as [number,number,number],scale});
  };
  return <group rotation={modelRotation}><group matrix={scene.matrix} matrixAutoUpdate={false}><primitive object={proxy}/><TransformControls object={proxy} mode={mode} space="local" size={.9} onObjectChange={update} onMouseDown={onEditStart} onMouseUp={onEditEnd}/></group></group>;
}
