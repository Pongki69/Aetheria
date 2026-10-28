import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnimationClip, Group } from 'three';
import { animationBoneName, animationChannelLabel, DEFAULT_RETARGETING, rigBones, type AnimationRetargeting } from '../services/animationRetargeting';
import { importAnimationSource, suggestAnimationBones } from '../services/animationImport';
import { MotionPresetLibrary } from './MotionPresetLibrary';
import { importAnimationUrl } from '../services/animationUrlImport';
import { BrowserModelImportGuide } from './BrowserModelImportGuide';
import type { EditHistory } from './useEditHistory';
import { RigComparison } from './RigComparison';
import { AnimationMappingChecks } from './AnimationMappingChecks';
import { SkowtImportGuide } from './SkowtImportGuide';
import { BuiltinHumanoidMotions } from './BuiltinHumanoidMotions';
import { builtinHumanoidPack, HUMANOID_PACK_ID } from '../services/builtinHumanoidMotions';
import { SecondaryMotionControls } from './SecondaryMotionControls';
import { CharacterBoneControls } from './CharacterBoneControls';
import { SkeletonPlacementControls, type SkeletonEditor } from './SkeletonPlacementEditor';

export type MotionSettings = {
  presetOwnerId?: string;
  animationRetargeting?: AnimationRetargeting;
  onAnimationRetargeting?: (value: AnimationRetargeting) => void;
  idleAnimation?: string; walkingAnimation?: string;
  onIdleAnimation?: (value: string) => void; onWalkingAnimation?: (value: string) => void;
};
type Props = MotionSettings & {
  editHistory?: EditHistory;
  skeletonEditor?: SkeletonEditor;
  onFocusBone?: (id: string) => void;
  scene: Group; clips: AnimationClip[]; selectedClip: string; onSelectedClip: (value: string) => void;
  playing: boolean; onPlaying: (value: boolean) => void; showSkeleton: boolean; onShowSkeleton: (value: boolean) => void;
};
export function AnimationRetargetingControls({scene, clips, selectedClip, onSelectedClip, playing, onPlaying, showSkeleton, onShowSkeleton, animationRetargeting, onAnimationRetargeting, idleAnimation, walkingAnimation, onIdleAnimation, onWalkingAnimation, presetOwnerId, skeletonEditor, onFocusBone, editHistory}: Props) {
  const config = animationRetargeting || DEFAULT_RETARGETING;
  const bones = useMemo(() => rigBones(scene), [scene]);
  const channels = useMemo(() => [...new Set(clips.flatMap((clip) => clip.tracks.filter((track) => /\.(?:quaternion|position|scale|rotation)(?:\[|$)/.test(track.name)).map((track) => animationBoneName(track.name)).filter((name): name is string => !!name)))], [clips]);
  const [channel, setChannel] = useState('');
  const [boneSearch, setBoneSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'upload' | 'url'>('upload');
  const [animationUrl, setAnimationUrl] = useState('');
  const [compareRigs,setCompareRigs] = useState(false);
  const [importError, setImportError] = useState('');
  const [importNotice, setImportNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const currentConfig = useRef(config);
  useEffect(() => {currentConfig.current = config;}, [config]);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const importFile = async (file: File | string) => {
    setImporting(true); setImportError(''); setImportNotice('');
    try {
      const source = typeof file === 'string' ? await importAnimationUrl(file) : await importAnimationSource(file);
      if (!mounted.current) return;
      const latest = currentConfig.current;
      const sources = [...(latest.sources || []),source];
      if (JSON.stringify(sources).length > 30_000_000) throw new Error('The saved animation library is full. Remove a source or import fewer clips.');
      const suggested = suggestAnimationBones(scene,source);
      onAnimationRetargeting?.({...latest,sources,boneMap:{...latest.boneMap,...suggested}});
      setImportNotice(`Copied ${source.clips.length} clips. ${Object.keys(suggested).length} of ${Object.keys(source.bones).length} animated bones matched. Map the remaining channels below.`);
      onSelectedClip(String(clips.length));
    } catch (error) {if (mounted.current) setImportError(error instanceof Error ? error.message : 'Could not import animations.');}
    finally {if (mounted.current) setImporting(false);}
  };
  const selectedChannel = channels.includes(channel) ? channel : channels[0] || '';
  const update = (values: Partial<AnimationRetargeting>) => onAnimationRetargeting?.({...config, ...values});
  const selectedDonor = config.sources?.find((source) => source.bones[selectedChannel]) || config.sources?.[0];
  const channelMapped = (name: string) => !!config.boneMap[name] && bones.some((bone) => bone.id === config.boneMap[name]);
  const canPlay = !!selectedClip && !!clips[Number(selectedClip)]?.tracks.some((track) => {
    const name = animationBoneName(track.name);
    if (!name) return false;
    const imported = config.sources?.some((source) => !!source.bones[name]);
    return imported ? channelMapped(name) : config.boneMap[name] !== '__ignore';
  });
  return <section className="agent-preview-motion" aria-label="Animation retargeting">
    {editHistory&&<div className="agent-rig-history"><button type="button" disabled={!editHistory.canUndo} onClick={editHistory.undo}>Undo rig edit</button><button type="button" disabled={!editHistory.canRedo} onClick={editHistory.redo}>Redo rig edit</button></div>}
    <h3>Animation & skeleton</h3><p>{clips.length} animation clips · {bones.length} bones</p>
    <BuiltinHumanoidMotions scene={scene} clips={clips} hasSkeleton={!!bones.length} animationRetargeting={animationRetargeting} onAnimationRetargeting={onAnimationRetargeting} idleAnimation={idleAnimation} walkingAnimation={walkingAnimation} onIdleAnimation={onIdleAnimation} onWalkingAnimation={onWalkingAnimation} onPreview={onSelectedClip}/>
    <div className="agent-preview-animation-import">
      <input ref={fileInput} type="file" accept=".glb,.gltf,.fbx,.zip,.7z" aria-label="Animation source file" hidden onChange={(event) => {const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file);}} />
      <div className="agent-animation-import-modes" role="group" aria-label="Animation import source"><button type="button" aria-pressed={importMode === 'upload'} disabled={importing} onClick={() => {setImportMode('upload'); setImportError('');}}>Upload File</button><button type="button" aria-pressed={importMode === 'url'} disabled={importing} onClick={() => {setImportMode('url'); setImportError('');}}>Model URL</button></div>
      {importMode === 'upload' ? <button type="button" disabled={importing || !bones.length || !onAnimationRetargeting} onClick={() => fileInput.current?.click()}>{importing ? 'Copying animations…' : 'Import animations from another model'}</button> : <div className="agent-animation-url">
        <label>Animation model URL<input type="text" inputMode="url" aria-label="Animation model URL" placeholder="https://sketchfab.com/3d-models/… or https://example.com/walk.glb" value={animationUrl} disabled={importing} onChange={(event) => setAnimationUrl(event.target.value)} onKeyDown={(event) => {if (event.key === 'Enter') {event.preventDefault(); event.stopPropagation(); if (!importing && animationUrl.trim() && bones.length && onAnimationRetargeting) void importFile(animationUrl);}}} /></label>
        <button type="button" disabled={importing || !animationUrl.trim() || !bones.length || !onAnimationRetargeting} onClick={() => void importFile(animationUrl)}>{importing ? 'Copying animations…' : 'Import animations from URL'}</button>
        <p>Use a direct model link, Sketchfab model page, or The Models Resource asset page. Sketchfab needs a downloadable model and the configured server token.</p>
        <BrowserModelImportGuide url={animationUrl} blocked={/403|blocks|blocked/i.test(importError)} onUpload={() => {setImportMode('upload'); fileInput.current?.click();}} />
        <SkowtImportGuide url={animationUrl} onUpload={() => {setImportMode('upload');setImportError('');fileInput.current?.click();}} />
      </div>}
      <p>Choose an animated GLB, glTF, FBX, or ZIP / 7z. Only animations and bone data are copied; your character stays the same.</p>
      {importError && <p role="alert">{importError}</p>}{importNotice && <p role="status">{importNotice}</p>}
      {(config.sources || []).map((source) => <div className="agent-preview-animation-source" key={source.id}><span>{source.name}<small>{source.clips.length} copied clips · {Object.keys(source.bones).filter(channelMapped).length}/{Object.keys(source.bones).length} bones mapped</small></span><button type="button" disabled={importing} aria-label={`Auto-map bones from ${source.name}`} onClick={() => {
        const suggested = suggestAnimationBones(scene,source);
        const boneMap = {...suggested,...config.boneMap};
        update({boneMap});
        const mapped = Object.keys(source.bones).filter((name) => boneMap[name] && bones.some((bone) => bone.id === boneMap[name])).length;
        setImportNotice(`${mapped} of ${Object.keys(source.bones).length} animated bones mapped. Existing manual assignments were kept. Check the preview and map any remaining channels below.`);
      }}>Auto-map bones</button><button type="button" disabled={importing} aria-label={`Remove animations from ${source.name}`} onClick={() => {
        const sources = (config.sources || []).filter((entry) => entry.id !== source.id);
        const boneMap = Object.fromEntries(Object.entries(config.boneMap).filter(([name]) => !source.bones[name]));
        update({sources,boneMap}); onSelectedClip('');
        if (source.clips.some((clip) => clip.name === idleAnimation)) onIdleAnimation?.('');
        if (source.clips.some((clip) => clip.name === walkingAnimation)) onWalkingAnimation?.('');
        setImportNotice('');
      }}>Remove</button><div className="agent-animation-clip-list">{source.clips.map((clip) => <button type="button" key={clip.uuid} aria-label={`Preview copied animation ${clip.name}`} onClick={() => onSelectedClip(String(clips.findIndex((entry) => entry.name === clip.name)))}>{playing && canPlay && clips[Number(selectedClip)]?.name === clip.name ? 'Playing · ' : 'Preview · '}{clip.name}</button>)}</div></div>)}
    </div>
    <label><input type="checkbox" checked={showSkeleton} onChange={(event) => onShowSkeleton(event.target.checked)} /> Show skeleton</label>
    {!clips.length && <p>No animation clips yet. Import an animated model above to copy its movements to this character.</p>}
    <label>Preview animation<select aria-label="Preview animation" value={selectedClip} disabled={!clips.length} onChange={(event) => onSelectedClip(event.target.value)}><option value="">Rest pose</option>{clips.map((clip, index) => <option key={index} value={String(index)}>{clip.name || `Animation ${index + 1}`}</option>)}</select></label>
    {selectedClip && !canPlay && <p role="alert">This animation has no mapped bones yet. Click Auto-map bones above, then assign any unmatched channels under Bone assignments.</p>}
    <div className="agent-preview-controls"><button type="button" disabled={!canPlay} onClick={() => onPlaying(!playing)}>{playing && canPlay ? 'Pause animation' : 'Play animation'}</button><button type="button" onClick={() => {onSelectedClip(''); onPlaying(false);}}>Rest pose</button></div>
    <label>Playback speed <select aria-label="Playback speed" value={config.speed} onChange={(event) => update({speed:Number(event.target.value)})}>{[0.25,0.5,1,1.5,2].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
    <label><input type="checkbox" checked={config.inPlace} onChange={(event) => update({inPlace:event.target.checked})} /> Keep root movement in place</label>
    <label>Idle movement<select aria-label="Idle movement" value={idleAnimation || ''} onChange={(event) => onIdleAnimation?.(event.target.value)}><option value="">Auto detect</option>{clips.map((clip,index) => <option key={index} value={clip.name}>{clip.name}</option>)}</select></label>
    <label>Walking movement<select aria-label="Walking movement" value={walkingAnimation || ''} onChange={(event) => onWalkingAnimation?.(event.target.value)}><option value="">Auto detect</option>{clips.map((clip,index) => <option key={index} value={clip.name}>{clip.name}</option>)}</select></label>
    <SecondaryMotionControls scene={scene} config={animationRetargeting} onChange={onAnimationRetargeting}/>
    {onAnimationRetargeting && <MotionPresetLibrary ownerId={presetOwnerId} scene={scene} clips={clips} config={config} idleAnimation={idleAnimation} walkingAnimation={walkingAnimation} onApply={(next,idle,walk) => {
      onAnimationRetargeting(next); onIdleAnimation?.(idle); onWalkingAnimation?.(walk);
      const index = clips.filter((clip) => !config.sources?.some((source) => source.clips.some((item) => item.name === clip.name))).length;
      onSelectedClip(String(index));
    }} />}
    {!!bones.length && skeletonEditor && <SkeletonPlacementControls config={config} onChange={onAnimationRetargeting} editor={skeletonEditor}/>}
    <CharacterBoneControls onFocusBone={onFocusBone} scene={scene} config={config} onChange={onAnimationRetargeting} onShowSkeleton={onShowSkeleton} onRestPose={()=>{onSelectedClip('');onPlaying(false);}} />
    <h3>Rig matching</h3><p>Build your own mapping for this model. Auto-map is optional; use the skeleton view or select bones below. Save a motion preset to reuse your setup.</p>
    {selectedDonor && <>
      {!selectedDonor.rig?.length && <p role="status">This older import does not include its rig hierarchy. Reimport the animation model once to enable visual matching and full rig alignment. Your current assignments remain editable below.</p>}
      <button type="button" disabled={!selectedDonor.rig?.length} aria-expanded={compareRigs} onClick={()=>setCompareRigs((value)=>!value)}>Match bones visually</button>
      {compareRigs && selectedDonor.rig?.length && <RigComparison scene={scene} source={selectedDonor} editHistory={editHistory} onRigEdit={onAnimationRetargeting?(next,selection)=>{
        const boneMap={...config.boneMap},offsets={...config.alignment?.offsets};
        for(const alias of Object.keys(selectedDonor.bones))if(!next.bones[alias]){delete boneMap[alias];delete offsets[alias];}
        update({sources:config.sources?.map((source)=>source.id===selectedDonor.id?next:source),boneMap,alignment:{...config.alignment,offsets}});
        if(selection)setChannel(selection);
      }:undefined} onLayoutChange={selectedDonor.builtin===HUMANOID_PACK_ID && onAnimationRetargeting ? (layout)=>{
        const pack=builtinHumanoidPack(selectedDonor.gait,selectedDonor,selectedDonor.bodyProfile,layout);
        update({sources:config.sources?.map((source)=>source.id===selectedDonor.id?pack:source),boneMap:{...suggestAnimationBones(scene,pack),...config.boneMap}});
      }:undefined} onProfileChange={selectedDonor.builtin===HUMANOID_PACK_ID && onAnimationRetargeting ? (profile)=>{
        const pack=builtinHumanoidPack(selectedDonor.gait,selectedDonor,profile);
        update({sources:config.sources?.map((source)=>source.id===selectedDonor.id?pack:source),boneMap:{...suggestAnimationBones(scene,pack),...config.boneMap}});
      }:undefined} boneMap={config.boneMap} sourceBone={selectedChannel} targetBone={config.boneMap[selectedChannel]} onSource={setChannel} onTarget={(key)=>update({boneMap:{...config.boneMap,[selectedChannel]:key}})} />}
      <label>Reference pose<select aria-label="Retargeting reference pose" value={config.alignment?.referencePose || 'bind'} onChange={(event)=>update({alignment:{...config.alignment,referencePose:event.target.value as 'bind'|'firstFrame'}})}><option value="bind">Model bind pose</option><option value="firstFrame">Animation first frame</option></select></label>
      <label><input type="checkbox" checked={config.alignment?.matchDirections !== false} onChange={(event)=>update({alignment:{...config.alignment,matchDirections:event.target.checked}})} /> Align limb directions between rigs</label>
      <label><input type="checkbox" checked={!!config.alignment?.matchPalmOrientation} onChange={(event)=>update({alignment:{...config.alignment,matchPalmOrientation:event.target.checked,...(event.target.checked?{matchDirections:true}:{})}})} /> Match palm orientation using finger joints</label>
      <p>For hands that twist despite correct wrist mappings. This matches the palm’s direction and roll from finger landmarks when available. It applies only to this agent.</p>
      <label>Source facing correction<select aria-label="Source facing correction" value={config.alignment?.sourceYaw || 0} onChange={(event)=>update({alignment:{...config.alignment,sourceYaw:Number(event.target.value)}})}>{[0,90,180,270].map((angle)=><option key={angle} value={angle}>{angle}°</option>)}</select></label>
    </>}
    {selectedDonor && <AnimationMappingChecks key={selectedDonor.id} scene={scene} source={selectedDonor} config={config} onChange={onAnimationRetargeting} onSelect={setChannel}/>}
    <h3>Bone assignments</h3><p>Choose an animation joint and its target. The rotation adjustments below let you correct each pair without changing code.</p>
    {!bones.length && <p>No skeleton was found. Mesh animations can still play, but bone retargeting needs a rigged model.</p>}
    {!!channels.length && !!bones.length && <><button type="button" onClick={() => update({boneMap:{}})}>Reset bone assignments</button>
    <label>Animation channel<select aria-label="Animation channel" value={selectedChannel} onChange={(event) => {setChannel(event.target.value); setBoneSearch('');}}>{channels.map((name) => <option key={name} value={name}>{animationChannelLabel(name, config)}</option>)}</select></label>
    <label>Find target bone<input type="search" aria-label="Find target bone" value={boneSearch} placeholder="e.g. hips, head, arm…" onChange={(event) => setBoneSearch(event.target.value)} /></label>
    <label className="agent-preview-bone-row">Target skeleton bone<select aria-label={`Target bone for ${selectedChannel}`} value={config.boneMap[selectedChannel] || ''} onChange={(event) => {
      const boneMap = {...config.boneMap};
      if (event.target.value) boneMap[selectedChannel] = event.target.value; else delete boneMap[selectedChannel];
      update({boneMap});
    }}><option value="">{config.sources?.some((source) => source.bones[selectedChannel]) ? 'Unassigned — choose a target bone' : 'Original binding'}</option><option value="__ignore">Ignore this channel</option>{bones.filter((entry) => entry.name.toLowerCase().includes(boneSearch.toLowerCase()) || entry.id === config.boneMap[selectedChannel]).map((entry) => <option key={entry.id} value={entry.id}>{'· '.repeat(Math.min(entry.depth,5))}{entry.name}</option>)}</select></label>
    <fieldset className="agent-rig-offsets"><legend>Selected bone rotation adjustment</legend>{(['X','Y','Z'] as const).map((axis,index)=><label key={`${selectedChannel}-${axis}`}>{axis} (°)<input type="number" step="1" aria-label={`Bone rotation adjustment ${axis}`} key={`${selectedChannel}-${config.alignment?.offsets?.[selectedChannel]?.[index] || 0}`} defaultValue={config.alignment?.offsets?.[selectedChannel]?.[index] || 0} onBlur={(event)=>{
      const degrees=event.currentTarget.valueAsNumber; if(!Number.isFinite(degrees))return;
      const offset=[...(config.alignment?.offsets?.[selectedChannel] || [0,0,0])] as [number,number,number];offset[index]=degrees;
      update({alignment:{...config.alignment,offsets:{...config.alignment?.offsets,[selectedChannel]:offset}}});
    }} /></label>)}</fieldset>
    <button type="button" onClick={()=>{const offsets={...config.alignment?.offsets};delete offsets[selectedChannel];update({alignment:{...config.alignment,offsets}});}}>Reset selected bone adjustment</button>
    <p>{Object.keys(config.boneMap).length} custom assignments</p>
    {Object.entries(config.boneMap).map(([source,target]) => <button className="agent-preview-assignment" type="button" key={source} onClick={() => {setChannel(source); setBoneSearch('');}}>{animationChannelLabel(source,config)} → {target === '__ignore' ? 'Ignored' : bones.find((entry) => entry.id === target)?.name || 'Missing bone'}</button>)}
    </>}
    <details><summary>Skeleton hierarchy ({bones.length})</summary>{bones.map((entry) => <div key={entry.id} style={{paddingLeft:Math.min(entry.depth,10)*8}}>{entry.name}</div>)}</details>
    <p>Compatible skeletons work best. Different bone names need manual mapping; different parent hierarchies may require rig adjustments in a 3D editor.</p>
  </section>;
}
