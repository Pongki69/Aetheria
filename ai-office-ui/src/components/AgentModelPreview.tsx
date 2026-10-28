import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { RotateCcw, RotateCw, Scan, SlidersHorizontal, Layers, Maximize2, Minimize2, Eye, Activity } from 'lucide-react';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Box3, MOUSE, TOUCH, LoopOnce, LoopRepeat, Mesh, PerspectiveCamera, SkeletonHelper, Texture, Vector3, type AnimationAction, type AnimationClip, type Group } from 'three';
import { applyModelParts, visitModelParts, type ModelPart } from '../services/modelParts';
import { readArchiveInventory, type ModelArchiveInventory } from '../services/modelArchiveInventory';
import { applyVertexColorTint, defaultVertexColorTint } from '../services/modelVertexColors';
import { repairMmdMaterials } from '../services/modelMmdMaterials';
import { AnimationRetargetingControls, type MotionSettings } from './AnimationRetargetingControls';
import { animationClips, retargetAnimations } from '../services/animationRetargeting';
import { SecondaryMotionController } from '../services/secondaryMotion';
import { BoneAdjustmentController } from '../services/boneAdjustments';
import { SkeletonPlacementGizmo, type SkeletonPlacementMode } from './SkeletonPlacementEditor';
import { PreviewCameraFocus, type CameraFocusRequest } from './PreviewCameraFocus';
import { useEditHistory } from './useEditHistory';
import { DEFAULT_RETARGETING, rigBones } from '../services/animationRetargeting';

type Rotation = [number, number, number];
const PREVIEW_CAMERA = { position: [3, 2, 5] as [number, number, number], fov: 38 };

function PreviewMotion({scene, clips, selectedClip, playing, settings,onPlaying,onFit}: {scene: Group; clips: AnimationClip[]; selectedClip: string; playing: boolean; settings: MotionSettings['animationRetargeting'];onPlaying:(value:boolean)=>void;onFit:()=>void}) {
  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);
  const secondary=useMemo(()=>new SecondaryMotionController(scene),[scene]);
  const boneAdjustments=useMemo(()=>new BoneAdjustmentController(scene),[scene]);
  useEffect(()=>{secondary.reset();return()=>secondary.reset();},[secondary,selectedClip]);
  useEffect(()=>()=>boneAdjustments.dispose(),[boneAdjustments]);
  const action=useRef<AnimationAction|null>(null);
  const lastBinding=useRef<boolean | undefined>(undefined);
  const motionSettings=useMemo(()=>settings?{...settings,secondaryMotion:undefined}:undefined,[settings?.boneMap,settings?.sources,settings?.inPlace,settings?.alignment]);
  const retargeted = useMemo(() => retargetAnimations(scene, clips, motionSettings), [scene, clips, motionSettings]);
  useEffect(() => {
    const clip = selectedClip ? retargeted[Number(selectedClip)] : undefined;
    if (clip) {
      const once=motionSettings?.sources?.some((source)=>source.looping?.[clip.name]===false);
      action.current=mixer.clipAction(clip);action.current.setLoop(once?LoopOnce:LoopRepeat,once?1:Infinity);action.current.clampWhenFinished=!!once;action.current.play();mixer.update(0);
    }
    const finished=()=>onPlaying(false);mixer.addEventListener('finished',finished);
    return () => {mixer.removeEventListener('finished',finished); secondary.reset(); boneAdjustments.restore(); mixer.stopAllAction(); mixer.uncacheRoot(scene);action.current=null;};
  }, [mixer, scene, retargeted, selectedClip,motionSettings,onPlaying]);
  useEffect(()=>{if(playing&&action.current&&action.current.time>=action.current.getClip().duration-1e-5)action.current.reset().play();},[playing]);
  useFrame((_, delta) => {secondary.restore(); boneAdjustments.restore(); if (playing) mixer.update(Math.min(delta, .1) * (settings?.speed || 1));boneAdjustments.placeSkeleton(settings?.skeletonPlacement,settings?.rebindSkeleton);boneAdjustments.apply(settings?.boneAdjustments);if(lastBinding.current!==!!settings?.rebindSkeleton){lastBinding.current=!!settings?.rebindSkeleton;onFit();}secondary.update(playing||!selectedClip?delta:0,settings?.secondaryMotion,playing?1:.5);});
  return null;
}
function PreviewSkeleton({scene}: {scene: Group}) {
  const helper = useMemo(() => {
    const value = new SkeletonHelper(scene);
    (Array.isArray(value.material) ? value.material : [value.material]).forEach((material) => {
      material.depthTest = false; material.transparent = true; material.opacity = .85;
    });
    value.renderOrder = 10; return value;
  }, [scene]);
  useEffect(() => () => helper.dispose(), [helper]);
  return <primitive object={helper} />;
}

function PreviewFraming({ root, scene, rotation, hiddenParts, reset }: { root: RefObject<Group | null>; scene: Group; rotation: Rotation; hiddenParts: string[]; reset: number }) {
  const { camera, controls, size, invalidate } = useThree();
  useLayoutEffect(() => {
    if (!root.current || !(camera instanceof PerspectiveCamera)) return;
    root.current.updateWorldMatrix(true, false);
    // SkinnedMesh updates its inverse bind matrix in updateMatrixWorld.
    // Using only updateWorldMatrix gives stale bounds after a rotation.
    root.current.updateMatrixWorld(true);
    const bounds = new Box3();
    const vertex = new Vector3();
    root.current.traverseVisible((object) => {
      if (!(object instanceof Mesh)) return;
      // Exported material parts can share a position buffer. Fit only indices
      // used by this piece, rather than all vertices of the original character.
      const geometry = object.geometry;
      const index = geometry.index;
      const count = index?.count ?? geometry.getAttribute('position')?.count ?? 0;
      const start = geometry.drawRange.start;
      const end = Math.min(count, start + geometry.drawRange.count);
      for (let i = start; i < end; i++) {
        object.getVertexPosition(index ? index.getX(i) : i, vertex);
        bounds.expandByPoint(vertex.applyMatrix4(object.matrixWorld));
      }
    });
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new Vector3()); const dimensions = bounds.getSize(new Vector3());
    const tangent = Math.tan(camera.fov * Math.PI / 360);
    const distance = Math.max(dimensions.y / 2 / tangent, dimensions.x / 2 / tangent / (size.width / Math.max(1, size.height))) * 1.25 + dimensions.z / 2;
    const safeDistance = Math.max(distance, 0.01);
    camera.position.set(center.x, center.y, center.z + safeDistance);
    camera.near = Math.max(safeDistance / 1000, 0.00001); camera.far = Math.max(safeDistance * 100, 100);
    camera.lookAt(center); camera.updateProjectionMatrix();
    if (controls) {
      const orbit = controls as OrbitControlsImpl;
      orbit.target.copy(center); orbit.minDistance = safeDistance * .015; orbit.maxDistance = safeDistance * 5;
      orbit.update(); orbit.saveState();
    }
    invalidate();
  }, [root, scene, rotation, hiddenParts, reset, camera, controls, size.width, size.height, invalidate]);
  return null;
}

function PreviewCharacter({ scene, hiddenParts, useVertexColors, rotation, reset, onFocus }: { scene: Group; onFocus:(point:Vector3)=>void; hiddenParts: string[]; useVertexColors?: boolean; rotation: Rotation; reset: number }) {
  const root = useRef<Group>(null);
  return <><group ref={root} rotation={rotation} onDoubleClick={(event)=>{event.stopPropagation();onFocus(event.point.clone());}}><PreviewScene scene={scene} hiddenParts={hiddenParts} useVertexColors={useVertexColors} /></group><PreviewFraming root={root} scene={scene} rotation={rotation} hiddenParts={hiddenParts} reset={reset} /></>;
}
function releasePreview(scene: Group) {
  const resources = new Set<{ dispose: () => void }>();
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      resources.add(material);
      Object.values(material).forEach((value) => { if (value instanceof Texture) resources.add(value); });
    });
  });
  resources.forEach((resource) => resource.dispose());
}
type Props = MotionSettings & {
  url: string; hiddenParts: string[]; rotation: Rotation;
  onHiddenParts: (parts: string[]) => void; onRotation: (rotation: Rotation) => void;
  onReady: (ready: boolean) => void;
  useVertexColors?: boolean; onUseVertexColors: (enabled: boolean) => void;
};

function PreviewScene({ scene, hiddenParts, useVertexColors }: { scene: Group; hiddenParts: string[]; useVertexColors?: boolean }) {
  useLayoutEffect(() => { applyModelParts(scene, hiddenParts); }, [scene, hiddenParts]);
  useLayoutEffect(() => { applyVertexColorTint(scene, useVertexColors); }, [scene, useVertexColors]);
  return <primitive object={scene} />;
}

export function AgentModelPreview({ url, hiddenParts, rotation, onHiddenParts, onRotation, onReady, useVertexColors, onUseVertexColors, ...motionSettings }: Props) {
  const history=useEditHistory(motionSettings.animationRetargeting || DEFAULT_RETARGETING,motionSettings.onAnimationRetargeting,url);
  const editableMotionSettings={...motionSettings,onAnimationRetargeting:motionSettings.onAnimationRetargeting?history.commit:undefined};
  const [scene, setScene] = useState<Group | null>(null);
  const [parts, setParts] = useState<ModelPart[]>([]);
  const [error, setError] = useState('');
  const [inventory, setInventory] = useState<ModelArchiveInventory | null>(null);
  const [panel, setPanel] = useState<'adjust' | 'parts' | 'motion' | null>(null);
  const [clips, setClips] = useState<AnimationClip[]>([]);
  const availableClips = useMemo(() => animationClips(clips, motionSettings.animationRetargeting), [clips, motionSettings.animationRetargeting]);
  const [selectedClip, setSelectedClip] = useState('');
  const [playing, setPlaying] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [panMode,setPanMode]=useState(false);
  const [cameraFocus,setCameraFocus]=useState<CameraFocusRequest | null>(null);
  const [placementEditing,setPlacementEditing]=useState(false);
  const [placementMode,setPlacementMode]=useState<SkeletonPlacementMode>('translate');
  const [isolatedPart, setIsolatedPart] = useState<string | null>(null);
  const [partSearch, setPartSearch] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const [frameVersion, setFrameVersion] = useState(0);
  const fitCurrentPose=useCallback(()=>setFrameVersion((version)=>version+1),[]);
  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sectionRef.current?.querySelector<HTMLButtonElement>('.agent-preview-fullscreen-button')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => fullscreenButton.current?.focus());
    };
  }, [fullscreen]);
  useEffect(() => {
    let cancelled = false;
    let loadedScene: Group | undefined;
    setScene(null); setParts([]); setInventory(null); setError(''); setIsolatedPart(null); setPartSearch(''); setClips([]); setSelectedClip(''); setPlaying(false); onReady(false);
    void new GLTFLoader().loadAsync(url).then((gltf) => {
      if (cancelled) { releasePreview(gltf.scene); return; }
      loadedScene = gltf.scene;
      repairMmdMaterials(gltf.scene);
      setClips(gltf.animations);
      const entries: ModelPart[] = [];
      visitModelParts(gltf.scene, (object, id) => {
        const materials = object instanceof Mesh ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
        const materialNames = [...new Set(materials.map((material) => material.name).filter(Boolean))];
        entries.push({ id, name: materialNames.length ? `${object.name || 'Mesh'} · ${materialNames.join(', ')}` : object.name || `Object ${entries.length + 1}` });
      });
      if (!entries.length) throw new Error('This model contains no visible mesh objects.');
      setInventory(readArchiveInventory(gltf.scene));
      setParts(entries); setScene(gltf.scene); onReady(true);
    }).catch((reason) => { if (!cancelled) { setError(reason instanceof Error ? reason.message : 'Could not preview this model.'); onReady(false); } });
    return () => { cancelled = true; if (loadedScene) releasePreview(loadedScene); };
  }, [url, onReady]);
  const turn = (axis: 0 | 1 | 2, amount: number) => onRotation(rotation.map((value, index) => index === axis ? value + amount : value) as Rotation);
  const selectedPart = parts.find((part) => part.id === isolatedPart);
  const previewHiddenParts = isolatedPart ? parts.filter((part) => part.id !== isolatedPart).map((part) => part.id) : hiddenParts;
  const togglePart = (id: string, visible: boolean) => onHiddenParts(visible ? hiddenParts.filter((part) => part !== id) : [...new Set([...hiddenParts, id])]);
  const content = <section ref={sectionRef} className={`agent-model-preview${fullscreen ? ' agent-preview-fullscreen' : ''}`} aria-label="Agent model preview" role={fullscreen ? 'dialog' : undefined} aria-modal={fullscreen || undefined} onKeyDown={(event) => {
    if (!fullscreen) return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); setFullscreen(false); }
    if (event.key === 'Tab') {
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]'));
      const first = targets[0]; const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="agent-preview-stage">
      <span className="agent-preview-badge">{selectedPart ? 'PART PREVIEW' : 'CHARACTER PREVIEW'}</span>
      <button ref={fullscreenButton} className="agent-preview-fullscreen-button" type="button" aria-label={fullscreen ? 'Exit fullscreen preview' : 'Open fullscreen preview'} onClick={() => setFullscreen((previous) => !previous)}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
      {scene ? <Canvas camera={PREVIEW_CAMERA} dpr={[1, 1.5]}>
        <ambientLight intensity={1.5} /><directionalLight position={[4, 7, 5]} intensity={2} /><directionalLight position={[-4, 3, -3]} intensity={0.8} />
        <PreviewCharacter onFocus={(point)=>setCameraFocus({point})} scene={scene} hiddenParts={previewHiddenParts} useVertexColors={useVertexColors} rotation={rotation} reset={frameVersion} />
        <PreviewMotion scene={scene} clips={clips} selectedClip={selectedClip} playing={playing} settings={motionSettings.animationRetargeting} onPlaying={setPlaying} onFit={fitCurrentPose}/>
        {showSkeleton && <PreviewSkeleton scene={scene} />}
        {placementEditing && panel==='motion' && <SkeletonPlacementGizmo scene={scene} modelRotation={rotation} placement={motionSettings.animationRetargeting?.skeletonPlacement} mode={placementMode} onEditStart={history.begin} onEditEnd={history.end} onChange={(value)=>history.commit({...motionSettings.animationRetargeting||DEFAULT_RETARGETING,skeletonPlacement:value})}/>}
        <OrbitControls makeDefault enablePan screenSpacePanning zoomToCursor zoomSpeed={.65} panSpeed={.85} rotateSpeed={.65} enableDamping dampingFactor={.12} mouseButtons={{LEFT:panMode?MOUSE.PAN:MOUSE.ROTATE,MIDDLE:MOUSE.DOLLY,RIGHT:MOUSE.PAN}} touches={{ONE:panMode?TOUCH.PAN:TOUCH.ROTATE,TWO:TOUCH.DOLLY_PAN}} minPolarAngle={0.05} maxPolarAngle={Math.PI - 0.05} />
        <PreviewCameraFocus request={cameraFocus}/>
      </Canvas> : <p role="status">{error || 'Loading model preview…'}</p>}
      {scene && !selectedPart && parts.every((part) => hiddenParts.includes(part.id)) && <div className="agent-preview-isolation"><span>All model parts are hidden.</span><button type="button" onClick={() => onHiddenParts([])}>Show all</button></div>}
      {selectedPart && <div className="agent-preview-isolation"><span>{selectedPart.name}</span><button type="button" onClick={() => setIsolatedPart(null)}>Back to character</button><small>Inspecting this part only. Visibility changes apply to the full character.</small></div>}
      <div className="agent-preview-navigation" aria-label="Preview navigation"><button type="button" aria-pressed={!panMode} onClick={()=>setPanMode(false)}>Orbit</button><button type="button" aria-pressed={panMode} onClick={()=>setPanMode(true)}>Pan view</button></div>
      <span className="agent-preview-hint">{panMode?'Drag to pan':'Drag to orbit'} · Right-drag to pan · Scroll to zoom at cursor · Double-click to focus</span>
    </div>
    <div className="agent-preview-controls agent-preview-toolbar">
      <button type="button" disabled={!scene} onClick={() => turn(1, -Math.PI / 8)} aria-label="Rotate model left"><RotateCcw size={14} /> Left</button>
      <button type="button" disabled={!scene} onClick={() => turn(1, Math.PI / 8)} aria-label="Rotate model right"><RotateCw size={14} /> Right</button>
      <button type="button" disabled={!scene} onClick={() => setFrameVersion((previous) => previous + 1)} title="Center and fit the entire character"><Scan size={14} /> Center</button>
      <button type="button" disabled={!scene} aria-expanded={panel === 'parts'} onClick={() => setPanel((previous) => previous === 'parts' ? null : 'parts')}><Layers size={14} /> Parts ({parts.length})</button>
      <button type="button" disabled={!scene} aria-expanded={panel === 'motion'} onClick={() => setPanel((previous) => previous === 'motion' ? null : 'motion')}><Activity size={14} /> Motion</button>
      <button type="button" disabled={!scene} aria-expanded={panel === 'adjust'} onClick={() => setPanel((previous) => previous === 'adjust' ? null : 'adjust')}><SlidersHorizontal size={14} /> Adjust</button>
    </div>
    {panel === 'motion' && scene && <div className="agent-preview-toolbox"><AnimationRetargetingControls scene={scene} clips={availableClips} selectedClip={selectedClip} onSelectedClip={(value) => {setSelectedClip(value); setPlaying(!!value);if(value)setPlacementEditing(false);}} playing={playing} onPlaying={setPlaying} showSkeleton={showSkeleton} onShowSkeleton={setShowSkeleton} onFocusBone={(id)=>{const bone=rigBones(scene).find((entry)=>entry.id===id);if(bone){scene.updateWorldMatrix(true,true);const height=new Box3().setFromObject(scene).getSize(new Vector3()).length();setCameraFocus({point:bone.bone.getWorldPosition(new Vector3()),distance:Math.max(height*.35,.01)});}}} skeletonEditor={{editing:placementEditing,mode:placementMode,onMode:setPlacementMode,onEditing:(value)=>{setPlacementEditing(value);if(value){setShowSkeleton(true);setSelectedClip('');setPlaying(false);}}}} {...editableMotionSettings} editHistory={history} /></div>}
    {panel === 'parts' && <section className="agent-preview-toolbox agent-preview-part-browser" aria-label="Model parts">
      <header><div><h3>Model parts</h3><p>{parts.filter((part) => !hiddenParts.includes(part.id)).length} of {parts.length} enabled</p></div><div><button type="button" onClick={() => onHiddenParts([])}>Show all</button><button type="button" onClick={() => onHiddenParts(parts.map((part) => part.id))}>Hide all</button></div></header>
      <input type="search" aria-label="Search model parts" placeholder="Find a mesh or material…" value={partSearch} onChange={(event) => setPartSearch(event.target.value)} />
      <p className="agent-preview-part-help">Toggle parts for your character. Preview lets you inspect even a hidden piece on its own.</p>
      <div className="agent-preview-part-list">{parts.filter((part) => part.name.toLowerCase().includes(partSearch.toLowerCase())).map((part) => <div key={part.id} className="agent-preview-part-row" data-selected={isolatedPart === part.id}>
        <label><input type="checkbox" checked={!hiddenParts.includes(part.id)} onChange={(event) => togglePart(part.id, event.target.checked)} /><span>{part.name}<small>{hiddenParts.includes(part.id) ? 'Hidden on character' : 'Visible on character'}</small></span></label>
        <button type="button" aria-label={`Preview ${part.name}`} aria-pressed={isolatedPart === part.id} onClick={() => setIsolatedPart((previous) => previous === part.id ? null : part.id)}><Eye size={14} />{isolatedPart === part.id ? 'Viewing' : 'Preview'}</button>
      </div>)}</div>
      {!parts.some((part) => part.name.toLowerCase().includes(partSearch.toLowerCase())) && <p>No matching parts.</p>}
      <p className="agent-preview-part-help">These controls change meshes in the loaded model. Texture images and alternate source files are listed under Adjust → Archive contents.</p>
    </section>}
    {panel === 'adjust' && <div className="agent-preview-toolbox">
    <div className="agent-preview-upright">
      <span>Model lying down or sideways?</span>
      <div className="agent-preview-controls">
        <button type="button" disabled={!scene} onClick={() => turn(0, -Math.PI / 2)} title="Rotate X by −90 degrees">Tilt back 90°</button>
        <button type="button" disabled={!scene} onClick={() => turn(0, Math.PI / 2)} title="Rotate X by 90 degrees">Tilt forward 90°</button>
        <button type="button" disabled={!scene} onClick={() => turn(2, Math.PI / 2)} title="Rotate Z by 90 degrees">Roll left 90°</button>
        <button type="button" disabled={!scene} onClick={() => turn(2, -Math.PI / 2)} title="Rotate Z by −90 degrees">Roll right 90°</button>
        <button type="button" disabled={!scene} onClick={() => onRotation([0, 0, 0])}>Reset orientation</button>
      </div>
      <p>Use tilt or roll to stand it upright, then Left / Right to choose its facing direction. The correction is saved with the agent.</p>
    </div>
    {scene && <div className="agent-preview-color-option"><label><input type="checkbox" checked={useVertexColors ?? defaultVertexColorTint(scene)} onChange={(event) => onUseVertexColors(event.target.checked)} /> Tint textures with vertex colors</label><p>Turn off for game exports whose vertex colors are shader masks. This preserves their original texture colors.</p></div>}
    {inventory && <details className="agent-preview-archive">
      <summary>Archive contents <span>{inventory.modelFiles.length} models · {inventory.textureFiles.length} textures</span></summary>
      <p>The combined model is preferred when present. Separate body/head files and alternate FBX/DAE versions are not stacked on top of it.</p>
      {inventory.activeModelFiles.some((path) => /\.(?:pmx|pmd)$/i.test(path)) && <p>MMD textures and model parts are imported. Toon and sphere effects are approximated; MMD physics and motion files are not included.</p>}
      <h4>Model source files</h4>
      <ul>{inventory.modelFiles.map((path) => <li key={path}><span>{path}</span><small>{inventory.activeModelFiles.includes(path) ? 'Loaded' : 'Alternate source'}</small></li>)}</ul>
      <h4>Texture images</h4>
      <p>Only images referenced by the model are applied. Extra texture maps stay listed here for reference.</p>
      <ul>{inventory.textureFiles.map((path) => <li key={path}><span>{path}</span><small>{inventory.referencedTextureFiles.includes(path) ? 'Referenced' : 'Available'}</small></li>)}</ul>
    </details>}
    </div>}
  </section>;
  return fullscreen ? createPortal(content, document.body) : content;
}
