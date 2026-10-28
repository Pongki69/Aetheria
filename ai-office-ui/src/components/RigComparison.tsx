import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Maximize2, Minimize2, X, ZoomIn, ZoomOut, Scan, Focus } from 'lucide-react';
import { Bone, Box3, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, PerspectiveCamera, Vector3, type Object3D } from 'three';
import { boneRestPose, rigBones, type AnimationSource } from '../services/animationRetargeting';
import { RigJointPicking } from './RigJointPicking';
import { PreviewCameraFocus, type CameraFocusRequest } from './PreviewCameraFocus';
import { AnimationJointEditor } from './AnimationJointEditor';
import type { EditHistory } from './useEditHistory';
import { HumanoidRigLayoutControls } from './HumanoidRigLayoutControls';
import { buildSourceRig, buildTargetRig } from '../services/rigAlignment';

function diagram(root: Object3D, keys: Map<Object3D,string>, offset: number, names:Record<string,string> = {}) {
  root.updateMatrixWorld(true);
  const entries: Array<{key: string; point: Vector3; node: Object3D; name:string}> = [];
  const bounds = new Box3();
  root.traverse((node) => {if (node instanceof Bone) {const point=node.getWorldPosition(new Vector3()); bounds.expandByPoint(point); entries.push({key:keys.get(node)||'',point,node,name:names[keys.get(node)||'']||node.name});}});
  const center=bounds.getCenter(new Vector3()); const size=bounds.getSize(new Vector3()); const scale=2/Math.max(size.y,size.x,.001);
  const points = entries.map((entry) => entry.point.clone().sub(center).multiplyScalar(scale).add(new Vector3(offset,0,0)));
  const lookup=new Map(entries.map((entry,index)=>[entry.node,points[index]])); const lines: Vector3[]=[];
  entries.forEach((entry,index)=>{const parent=entry.node.parent ? lookup.get(entry.node.parent) : undefined; if(parent)lines.push(parent,points[index]);});
  return {entries,points,segments:lines,geometry:new BufferGeometry().setFromPoints(points),lines:new BufferGeometry().setFromPoints(lines)};
}
type Diagram = ReturnType<typeof diagram>;
function FitRigCamera({data,reset,zoom}: {data: Diagram;reset:number;zoom:number}) {
  const {camera,controls,size,invalidate}=useThree();
  useEffect(()=>{
    if (!(camera instanceof PerspectiveCamera))return;
    const box=new Box3().setFromPoints(data.points); const center=box.getCenter(new Vector3()); const dimensions=box.getSize(new Vector3());
    const tangent=Math.tan(camera.fov*Math.PI/360);
    const distance=Math.max(dimensions.y/2/tangent,dimensions.x/2/tangent/(size.width/Math.max(size.height,1)))*1.25+dimensions.z;
    camera.position.copy(center).add(new Vector3(0,0,Math.max(distance,.5)));camera.near=.001;camera.far=100;camera.lookAt(center);camera.updateProjectionMatrix();
    if(controls){const orbit=controls as OrbitControlsImpl;orbit.target.copy(center);orbit.update();orbit.saveState();}
    invalidate();
  },[camera,controls,data,size.width,size.height,reset,invalidate]);
  useEffect(()=>{camera.zoom=zoom;camera.updateProjectionMatrix();invalidate();},[camera,zoom,invalidate]);
  return null;
}
function RigViewport({data,title,color,selected,onPick,onClear,highlightConnected,showJoints,showAllConnections,mappedColors,selectedName}: {data:Diagram;title:string;color:string;selected?:string;onPick:(key:string)=>void;onClear:()=>void;highlightConnected:boolean;showJoints:boolean;showAllConnections:boolean;mappedColors:Record<string,string>;selectedName?:string}) {
  const [reset,setReset]=useState(0);const [zoom,setZoom]=useState(1);const [focus,setFocus]=useState<CameraFocusRequest|null>(null);
  const [hover,setHover]=useState<number|null>(null);
  const [choices,setChoices]=useState<{indices:number[];x:number;y:number}|null>(null);
  useEffect(()=>{setHover(null);setChoices(null);},[data]);
  const dotTexture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
    const context=canvas.getContext('2d')!;const gradient=context.createRadialGradient(16,16,2,16,16,16);
    gradient.addColorStop(0,'#ffffffff');gradient.addColorStop(.65,'#ffffffcc');gradient.addColorStop(1,'#ffffff00');
    context.fillStyle=gradient;context.fillRect(0,0,32,32);return new CanvasTexture(canvas);
  },[]);
  const selectionTexture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
    const context=canvas.getContext('2d')!;
    // A dark separation ring stays legible over bright mapped dots and lines.
    context.beginPath();context.arc(48,48,31,0,Math.PI*2);context.fillStyle='#0b1728';context.fill();
    context.lineWidth=5;context.strokeStyle='#f8dba3';context.stroke();
    context.beginPath();context.arc(48,48,10,0,Math.PI*2);context.fillStyle='#fff4d6';context.fill();
    context.lineWidth=3;context.strokeStyle='#fff4d6';
    for(const [x,y,dx,dy] of [[48,6,0,13],[48,77,0,13],[6,48,13,0],[77,48,13,0]]){context.beginPath();context.moveTo(x,y);context.lineTo(x+dx,y+dy);context.stroke();}
    return new CanvasTexture(canvas);
  },[]);
  useEffect(()=>()=>selectionTexture.dispose(),[selectionTexture]);
  const selectedIndex=data.entries.findIndex((entry)=>entry.key===selected);
  const selectedPoint=selectedIndex>=0?data.points[selectedIndex]:undefined;
  const highlight=useMemo(()=>{
    const selectedEntry=data.entries.find((entry)=>entry.key===selected);
    const connected=new Set<Object3D>();
    if(selectedEntry && highlightConnected){
      selectedEntry.node.traverse((node)=>{if(node instanceof Bone)connected.add(node);});
      let parent=selectedEntry.node.parent;while(parent){if(parent instanceof Bone)connected.add(parent);parent=parent.parent;}
    }
    const points:Vector3[]=[];const lines:Vector3[]=[];const lookup=new Map(data.entries.map((entry,index)=>[entry.node,data.points[index]]));
    data.entries.forEach((entry,index)=>{if(connected.has(entry.node)){points.push(data.points[index]);if(entry.node.parent && connected.has(entry.node.parent)){const parent=lookup.get(entry.node.parent);if(parent)lines.push(parent,data.points[index]);}}});
    return {active:!!selectedEntry,selected:new BufferGeometry().setFromPoints(selectedEntry?[data.points[data.entries.indexOf(selectedEntry)]]:[]),points:new BufferGeometry().setFromPoints(points),segments:lines,lines:new BufferGeometry().setFromPoints(lines)};
  },[data,selected,highlightConnected]);
  const mappedGeometry=useMemo(()=>{
    const points:Vector3[]=[];const colors:number[]=[];
    data.entries.forEach((entry,index)=>{if(mappedColors[entry.key]){points.push(data.points[index]);new Color(mappedColors[entry.key]).toArray(colors,colors.length);}});
    const geometry=new BufferGeometry().setFromPoints(points);geometry.setAttribute('color',new Float32BufferAttribute(colors,3));return geometry;
  },[data,mappedColors]);
  useEffect(()=>()=>mappedGeometry.dispose(),[mappedGeometry]);
  useEffect(()=>()=>dotTexture.dispose(),[dotTexture]);
  useEffect(()=>()=>{highlight.selected.dispose();highlight.points.dispose();highlight.lines.dispose();},[highlight]);
  return <section className="agent-rig-viewport" aria-label={title}><header><strong>{title}</strong><div>
    <button type="button" aria-label={`Focus selected joint in ${title}`} title="Center and zoom to the selected joint" disabled={!selectedPoint} onClick={()=>{if(selectedPoint){setZoom(1);setFocus({point:selectedPoint.clone(),distance:.8});}}}><Focus size={15}/></button>
    <button type="button" aria-label={`Zoom in ${title}`} onClick={()=>setZoom((value)=>Math.min(8,value*1.3))}><ZoomIn size={15}/></button>
    <button type="button" aria-label={`Zoom out ${title}`} onClick={()=>setZoom((value)=>Math.max(.25,value/1.3))}><ZoomOut size={15}/></button>
    <button type="button" aria-label={`Fit ${title}`} onClick={()=>{setZoom(1);setReset((value)=>value+1);}}><Scan size={15}/></button>
  </div></header><div className="agent-rig-comparison-stage" tabIndex={0} aria-label={`${title} skeleton view`} onPointerDownCapture={(event)=>event.currentTarget.focus({preventScroll:true})}><Canvas camera={{position:[0,0,4],fov:42}} dpr={[1,1.5]} >
    {showAllConnections&&data.segments.length>0&&<><Line points={data.segments} segments lineWidth={4} color={color} transparent opacity={.09} raycast={()=>{}}/><Line points={data.segments} segments lineWidth={1.6} color={color} transparent opacity={.8} raycast={()=>{}}/></>}
    <points geometry={data.geometry} raycast={()=>{}}><pointsMaterial color={color} size={showJoints?4:0} sizeAttenuation={false} map={dotTexture} transparent opacity={showJoints ? .7 : 0} alphaTest={.02} depthWrite={false}/></points>
    {highlightConnected && highlight.active && <>{highlight.segments.length>0&&<><Line points={highlight.segments} segments lineWidth={7} color="#b9dfcb" transparent opacity={.1} raycast={()=>{}}/><Line points={highlight.segments} segments lineWidth={3} color="#bce5d1" transparent opacity={1} raycast={()=>{}}/></>}{showJoints && <points geometry={highlight.points} raycast={()=>{}}><pointsMaterial color="#c4e9d5" size={6} sizeAttenuation={false} map={dotTexture} transparent opacity={.95} depthWrite={false} depthTest={false}/></points>}</>}
    <points geometry={mappedGeometry} raycast={()=>{}}><pointsMaterial vertexColors size={7} sizeAttenuation={false} map={dotTexture} transparent opacity={.95} depthWrite={false} depthTest={false}/></points>
    {highlight.active && <points geometry={highlight.selected} renderOrder={100} raycast={()=>{}}><pointsMaterial color="#ffffff" size={32} sizeAttenuation={false} map={selectionTexture} transparent opacity={1} depthWrite={false} depthTest={false} toneMapped={false}/></points>}
    {selectedPoint && <Html position={selectedPoint} zIndexRange={[20,10]} style={{pointerEvents:'none'}}><div className="agent-rig-joint-label" role="status" aria-label={`Selected joint in ${title}`}><span>SELECTED JOINT</span><strong>{selectedName || data.entries[selectedIndex].node.name}</strong></div></Html>}
    <RigJointPicking points={data.points} onPick={(index)=>{setChoices(null);const key=data.entries[index]?.key;if(key)onPick(key);else setChoices({indices:[index],x:8,y:8});}} onClear={onClear} onHover={setHover} onChoices={setChoices}/>
    {hover!==null && data.entries[hover]?.key!==selected && <Html position={data.points[hover]} zIndexRange={[21,11]} style={{pointerEvents:'none'}}><div className="agent-rig-hover-label">{data.entries[hover].name}</div></Html>}
    <OrbitControls makeDefault enablePan enableZoom screenSpacePanning zoomToCursor zoomSpeed={.65} panSpeed={.85} rotateSpeed={.65} enableDamping dampingFactor={.12} minDistance={.02} maxDistance={30}/><PreviewCameraFocus request={focus}/><FitRigCamera data={data} reset={reset} zoom={zoom}/>
  </Canvas>{choices&&<div className="agent-rig-pick-choices" role="group" aria-label={`Overlapping joints in ${title}`} style={{left:`clamp(6px, ${choices.x}px, calc(100% - 246px))`,top:`clamp(6px, ${choices.y}px, calc(100% - 220px))`}}><strong>Choose the joint</strong><small>These dots overlap. Pick the exact name.</small>{choices.indices.map((index)=><button key={index} type="button" disabled={!data.entries[index].key} onClick={()=>{onPick(data.entries[index].key);setChoices(null);}}>{data.entries[index].name}{!data.entries[index].key?' (no animation channel)':''}</button>)}<button type="button" onClick={()=>setChoices(null)}>Cancel</button></div>}</div><small>Drag to orbit · Right-drag to pan · Scroll to zoom at cursor</small></section>;
}
export function RigComparison({scene,source,sourceBone,targetBone,onSource,onTarget,boneMap={},onProfileChange,onLayoutChange,onRigEdit,editHistory}: {scene: Object3D;source: AnimationSource;sourceBone: string;targetBone?: string;onSource:(key:string)=>void;onTarget:(key:string)=>void;boneMap?:Record<string,string>;onProfileChange?:(profile:NonNullable<AnimationSource['bodyProfile']>)=>void;onLayoutChange?:(layout:NonNullable<AnimationSource['rigLayout']>)=>void;onRigEdit?:(source:AnimationSource,selection?:string)=>void;editHistory?:EditHistory}) {
  const [expanded,setExpanded]=useState(true);const [fullscreen,setFullscreen]=useState(false);
  const [selectedSource,setSelectedSource]=useState<string|undefined>(sourceBone);const [selectedTarget,setSelectedTarget]=useState<string|undefined>(targetBone);
  const [showJoints,setShowJoints]=useState(true);const [highlightConnected,setHighlightConnected]=useState(true);
  const [showAllConnections,setShowAllConnections]=useState(true);const [showMappedPairs,setShowMappedPairs]=useState(false);
  useEffect(()=>{setSelectedSource(sourceBone);setSelectedTarget(targetBone);},[sourceBone,targetBone]);
  const clearSelection=()=>{setSelectedSource(undefined);setSelectedTarget(undefined);};
  const closeButton=useRef<HTMLButtonElement>(null);const expandButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!expanded)return;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';closeButton.current?.focus();
    return ()=>{document.body.style.overflow=previous;requestAnimationFrame(()=>expandButton.current?.focus());};
  },[expanded]);
  const diagrams=useMemo(()=>{
    const donor=buildSourceRig(source); const target=buildTargetRig(scene,rigBones(scene).map((entry)=>({...entry,rest:boneRestPose(entry.bone)})));
    return [diagram(donor.root,new Map([...donor.aliases].map(([key,node])=>[node,key])),0,Object.fromEntries(Object.entries(source.bones).map(([key,bone])=>[key,bone.name]))),diagram(target.root,new Map([...target.nodes].map(([key,node])=>[node,key])),0)];
  },[scene,source]);
  useEffect(()=>()=>diagrams.forEach((entry)=>{entry.geometry.dispose();entry.lines.dispose();}),[diagrams]);
  const pairs=useMemo(()=>Object.entries(boneMap).filter(([alias,target])=>source.bones[alias]&&diagrams[1].entries.some((bone)=>bone.key===target)).map(([alias,target],index)=>({alias,target,name:source.bones[alias].name,targetName:diagrams[1].entries.find((bone)=>bone.key===target)!.node.name,color:`#${new Color().setHSL((index*.61803398875)%1,.5,.7).getHexString()}`})),[boneMap,source,diagrams]);
  const pairColors=useMemo(()=>({source:showMappedPairs?Object.fromEntries(pairs.map((pair)=>[pair.alias,pair.color])):{},target:showMappedPairs?Object.fromEntries(pairs.map((pair)=>[pair.target,pair.color])):{}}),[pairs,showMappedPairs]);
  const targetName=rigBones(scene).find((bone)=>bone.id===selectedTarget)?.name || 'Choose a target joint';
  const content=<><div className="agent-rig-workspace-header"><div><strong>Match skeleton bones</strong><p>Pick an animated joint, then its matching joint on your character.</p></div><div>
    {expanded?<><button type="button" aria-label={fullscreen?'Exit fullscreen rig matcher':'Fullscreen rig matcher'} onClick={()=>setFullscreen((value)=>!value)}>{fullscreen?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button><button ref={closeButton} type="button" aria-label="Close rig matcher" onClick={()=>{setExpanded(false);setFullscreen(false);}}><X size={18}/></button></>:<button ref={expandButton} type="button" onClick={()=>setExpanded(true)}><Maximize2 size={15}/> Expand matcher</button>}
  </div></div>
    {editHistory&&<div className="agent-rig-history"><button type="button" disabled={!editHistory.canUndo} onClick={editHistory.undo}>Undo rig edit</button><button type="button" disabled={!editHistory.canRedo} onClick={editHistory.redo}>Redo rig edit</button><small>Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z or Ctrl+Y</small></div>}
    {onProfileChange && <div className="agent-rig-profile-switch"><label>Animation rig profile<select aria-label="Animation rig profile" value={source.bodyProfile || 'neutral'} onChange={(event)=>onProfileChange(event.target.value as NonNullable<AnimationSource['bodyProfile']>)}><option value="neutral">Neutral</option><option value="female">Female</option><option value="male">Male</option></select></label><small>Updates the starter skeleton immediately and keeps your bone assignments. Save model changes to keep this profile.</small></div>}
    {onLayoutChange && <HumanoidRigLayoutControls layout={source.rigLayout} onChange={onLayoutChange}/>}
    {onRigEdit&&<AnimationJointEditor source={source} selected={selectedSource} onChange={onRigEdit}/>}
    <div className="agent-rig-workspace-pair"><span><b>Animation joint</b>{selectedSource ? source.bones[selectedSource]?.name : 'Choose an animated joint'}</span><span>→</span><span><b>Character joint</b>{targetName}</span></div>
    <div className="agent-rig-selection-tools"><button type="button" onClick={clearSelection}>Clear selection</button><label><input type="checkbox" checked={showJoints} onChange={(event)=>setShowJoints(event.target.checked)}/> Show all joints</label><label><input type="checkbox" checked={showAllConnections} onChange={(event)=>setShowAllConnections(event.target.checked)}/> Show all connections</label><label><input type="checkbox" checked={highlightConnected} onChange={(event)=>setHighlightConnected(event.target.checked)}/> Highlight connected joints</label><label><input type="checkbox" checked={showMappedPairs} onChange={(event)=>setShowMappedPairs(event.target.checked)}/> Show mapped pairs ({pairs.length})</label><small>The warm crosshair marks the selected joint. Mint lines show its connected chain; matching colored dots show mapped pairs.</small></div>
    {showMappedPairs&&<details className="agent-rig-pairs"><summary>Mapped bone pairs ({pairs.length})</summary>{!pairs.length?<p>No bone pairs have been assigned yet.</p>:<div>{pairs.map((pair)=><button type="button" key={pair.alias} aria-pressed={pair.alias===selectedSource} onClick={()=>{setSelectedSource(pair.alias);setSelectedTarget(pair.target);onSource(pair.alias);}}><i style={{background:pair.color}}/>{pair.name} → {pair.targetName}</button>)}</div>}</details>}
    <div className="agent-rig-workspace-views"><RigViewport data={diagrams[0]} title="Animation rig" color="#8fb9c5" selected={selectedSource} onClear={clearSelection} showJoints={showJoints} highlightConnected={highlightConnected} showAllConnections={showAllConnections} mappedColors={pairColors.source} selectedName={selectedSource ? source.bones[selectedSource]?.name : undefined} onPick={(key)=>{if(key===selectedSource){clearSelection();return;}setSelectedSource(key);setSelectedTarget(key===sourceBone?targetBone:undefined);onSource(key);}}/><RigViewport data={diagrams[1]} title="Your character" color="#b9afc9" selected={selectedTarget} onClear={clearSelection} showJoints={showJoints} highlightConnected={highlightConnected} showAllConnections={showAllConnections} mappedColors={pairColors.target} selectedName={selectedTarget ? targetName : undefined} onPick={(key)=>{if(key===selectedTarget){setSelectedTarget(undefined);return;}setSelectedTarget(key);if(selectedSource)onTarget(key);}}/></div>
    <p className="agent-rig-workspace-help">Show all connections keeps every skeleton link visible, even with no selection. Clear selection does not remove mappings.{expanded && !fullscreen?' Resize this window from its bottom-right corner.':''}</p></>;
  if(!expanded)return <div className="agent-rig-comparison">{content}</div>;
  return createPortal(<div className="agent-rig-workspace-overlay" onMouseDown={(event)=>event.stopPropagation()} onKeyDown={(event)=>{
    event.stopPropagation();
    if((event.ctrlKey||event.metaKey)&&!event.altKey&&!(event.target as HTMLElement)?.closest('input,textarea,[contenteditable="true"]')){
      if(event.key.toLowerCase()==='z'){event.preventDefault();if(event.shiftKey)editHistory?.redo();else editHistory?.undo();return;}
      if(event.key.toLowerCase()==='y'){event.preventDefault();editHistory?.redo();return;}
    }
    if(event.key==='Escape'){event.preventDefault();if(selectedSource || selectedTarget)clearSelection();else if(fullscreen)setFullscreen(false);else setExpanded(false);}
    if(event.key==='Tab'){
      const targets=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]'));const first=targets[0];const last=targets[targets.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }}><section role="dialog" aria-modal="true" aria-label="Rig matching workspace" className={`agent-rig-workspace${fullscreen?' is-fullscreen':''}`}>{content}</section></div>,document.body);
}
