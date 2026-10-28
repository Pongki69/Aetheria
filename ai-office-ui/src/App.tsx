import { sketchfabModelUid, isSketchfabHost, isSpritersResourceModelPage, isSkowtPage, SKOWT_MODEL_IMPORT_MESSAGE } from './services/modelLinks';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, useGLTF } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AgentData, UserProfile, UserSession, WorldSettingsRecord } from './types';
import { Agent3D } from './components/Agent3D';
import { SavedThoughtList } from './components/SavedThoughtList';
import { useAgentThoughtLibrary } from './components/useAgentThoughtLibrary';
import { AutoGrowTextarea } from './components/AutoGrowTextarea';
import { AgentModelPreview } from './components/AgentModelPreview';
import { AgentModelEditor } from './components/AgentModelEditor';
import { DEFAULT_RETARGETING } from './services/animationRetargeting';
import { normalizeModelBlob } from './services/modelImport';
import { SkowtImportGuide, SkowtPreviewNotice } from './components/SkowtImportGuide';
import { BrowserModelImportGuide } from './components/BrowserModelImportGuide';
import { agentPersonaInstruction } from './services/agentPersona';
import { UserProfilePanel } from './components/UserProfilePanel';
import { PlayerMessengerModal } from './components/PlayerMessengerModal';
import { AuthModal, getAvatarPlaceholder } from './components/AuthModal';
import { LandingPage } from './components/LandingPage';
import { authRequest, authRequestBlob, getAuthToken, setAuthToken, type AuthAccount } from './services/authClient';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import { ProjectWorkspaceModal } from './components/ProjectWorkspaceModal';
import { useConfirmModal } from './components/ConfirmModal';
import { db, type AppStateRecord, type StoredAgent } from './db/database';
import { Activity, Search, Plus, Maximize, Minimize, Bot, X, Send, Upload, MoveVertical, RotateCw, Armchair, Box, Trash2, UserRound, Eye, Settings2, Pencil, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronDown, LogOut, MapPin, Paperclip, Power, CreditCard, Heart, MessagesSquare, Folder, FolderOpen } from 'lucide-react';

interface ChatMessage {
  ownerId?: string;
  id: string;
  sender: 'user' | 'agent' | 'system';
  agentId?: string;
  text: string;
  timestamp: string;
  attachmentBlob?: Blob;
  attachmentType?: string;
  attachmentName?: string;
  attachmentSize?: number;
  deletedAt?: string;
  deletedBy?: string;
}

export interface FurnitureItem {
  id: string;
  ownerId?: string;
  label: string;
  category: string;
  modelUrl: string;
  scale: number;
  position: [number, number, number];
  rotationY: number;
  rotationX?: number;
  rotationZ?: number;
  collection?: string;
}

function canPreviewModel(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'blob:' || (['http:', 'https:'].includes(url.protocol) && /\.(glb|gltf)$/i.test(url.pathname)); }
  catch { return false; }
}


async function prepareModelUpload(file: File, combineModels = false): Promise<File> {
  if (!/\.(?:glb|gltf|zip|7z)$/i.test(file.name)) throw new Error('Choose a GLB, glTF, or model ZIP / 7z file.');
  const normalized = await normalizeModelBlob(file, combineModels);
  if (normalized === file) {
    if (/\.(zip|7z)$/i.test(file.name)) throw new Error('This file is not a valid ZIP or 7z archive. Download the archive again.');
    return file;
  }
  const extension = normalized.type === 'model/gltf+json' ? '.gltf' : '.glb';
  return new File([normalized], file.name.replace(/\.[^.]+$/, extension), { type: normalized.type });
}

function Furniture3D({ item, isSelected, onSelect, onMove, onHeight, editMode, onDragChange }: { item: FurnitureItem; isSelected: boolean; onSelect: (additive: boolean) => void; onMove: (dx: number, dz: number) => void; onHeight: (id: string, delta: number) => void; editMode: boolean; onDragChange: (dragging: boolean) => void }) {
  const { scene } = useGLTF(item.modelUrl);
  const { camera, gl, raycaster } = useThree();
  const dragStart = useRef<THREE.Vector3 | null>(null);
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersection = useRef(new THREE.Vector3());
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;
    const handleHeight = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== 'Shift') return;
      if ((event.target as HTMLElement | null)?.matches('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      onHeight(item.id, event.code === 'Space' ? 0.15 : -0.15);
    };
    window.addEventListener('keydown', handleHeight);
    return () => window.removeEventListener('keydown', handleHeight);
  }, [isDragging, item.id, onHeight]);
  
  const clonedScene = React.useMemo(() => {
    // 1. Safely clone skinned meshes and skeleton hierarchies
    const cloned = SkeletonUtils.clone(scene);

    // 2. Compute bounding box to auto-center the origin to floor level
    const box = new THREE.Box3().setFromObject(cloned);
    const center = box.getCenter(new THREE.Vector3());
    
    cloned.position.x -= center.x;
    cloned.position.z -= center.z;
    cloned.position.y -= box.min.y;

    return cloned;
  }, [scene]);

  const selectionBounds = React.useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(clonedScene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(
      Math.max(size.x, 0.05) * 1.015,
      Math.max(size.y, 0.05) * 1.015,
      Math.max(size.z, 0.05) * 1.015,
    ));
    return { geometry, center };
  }, [clonedScene]);

  return (
    <>
    <group
      position={item.position}
      scale={[item.scale, item.scale, item.scale]}
      rotation={[item.rotationX || 0, item.rotationY, item.rotationZ || 0]}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!editMode) return;
        const additive = e.nativeEvent.ctrlKey || e.nativeEvent.metaKey;
        if (additive || !isSelected) onSelect(additive);
        onDragChange(true);
        setIsDragging(true);
        const rect = gl.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2(((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1, -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        dragStart.current = raycaster.ray.intersectPlane(groundPlane.current, new THREE.Vector3());
        (e.target as unknown as { setPointerCapture?: (pointerId: number) => void }).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!editMode || !dragStart.current || e.buttons !== 1) return;
        e.stopPropagation();
        const rect = gl.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2(((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1, -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(groundPlane.current, intersection.current)) {
          const dx = intersection.current.x - dragStart.current.x;
          const dz = intersection.current.z - dragStart.current.z;
          if (Math.abs(dx) + Math.abs(dz) > 0.01) {
            onMove(dx, dz);
            dragStart.current.copy(intersection.current);
          }
        }
      }}
      onPointerUp={() => { dragStart.current = null; setIsDragging(false); onDragChange(false); }}
      onPointerCancel={() => { dragStart.current = null; setIsDragging(false); onDragChange(false); }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <primitive object={clonedScene} />
      {isSelected && <lineSegments geometry={selectionBounds.geometry} position={selectionBounds.center} renderOrder={10}>
        <lineBasicMaterial color={isDragging ? '#fbbf24' : '#38bdf8'} transparent opacity={0.95} depthTest={false} />
      </lineSegments>}
    </group>
    {isSelected && <>
      <mesh position={[item.position[0], 0.018, item.position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[furnitureFootprint(item), 48]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[item.position[0], 0.025, item.position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[furnitureFootprint(item) * 0.92, furnitureFootprint(item), 48]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </>}
    </>
  );
}

function describeDecor(item: FurnitureItem) {
  const words = `${item.label} ${item.category}`.toLowerCase();
  if (/sofa|couch|chair|seat|bench|stool/.test(words)) return `Seating · ${item.label} adds a place to sit in the office.`;
  if (/desk|table|workstation/.test(words)) return `Work surface · ${item.label} can define a workspace.`;
  if (/plant|tree|flower|fern/.test(words)) return `Greenery · ${item.label} adds a natural accent to the scene.`;
  if (/lamp|light/.test(words)) return `Lighting · ${item.label} adds a light source or visual accent.`;
  if (/shelf|bookcase|cabinet|storage/.test(words)) return `Storage · ${item.label} provides a storage detail for the scene.`;
  return `${item.category} · ${item.label} is part of the office decor.`;
}

function rotationDegrees(rotation: number) {
  const degrees = Math.round(THREE.MathUtils.radToDeg(rotation));
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized === 0 && degrees !== 0 ? 360 : normalized;
}

function InfiniteGround({ originX, originZ, onSelect }: { originX: number; originZ: number; onSelect: () => void }) {
  const ground = useRef<THREE.Mesh>(null);
  const grid = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    if (ground.current) {
      ground.current.position.x = originX + Math.round((camera.position.x - originX) / 100) * 100;
      ground.current.position.z = originZ + Math.round((camera.position.z - originZ) / 100) * 100;
    }
    if (grid.current) {
      // Recenter only by complete grid sections: every visible line keeps the
      // same world coordinate instead of sliding with subpixel camera motion.
      grid.current.position.x = originX + Math.round((camera.position.x - originX) / 10) * 10;
      grid.current.position.z = originZ + Math.round((camera.position.z - originZ) / 10) * 10;
    }
  });
  return <>
    <mesh ref={ground} position={[originX, -0.02, originZ]} rotation={[-Math.PI / 2, 0, 0]} onClick={(event) => { if (event.delta > 4) return; event.stopPropagation(); onSelect(); }}>
      <planeGeometry args={[4000, 4000]} />
      <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    <Grid ref={grid} position={[originX, -0.01, originZ]} args={[4, 4]} infiniteGrid cellSize={1} sectionSize={10} cellColor="#1e293b" sectionColor="#0284c7" cellThickness={1} sectionThickness={1.2} fadeDistance={400} fadeStrength={2} onUpdate={(mesh) => { const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.forEach((material) => { material.depthWrite = false; }); }} />
  </>;
}

function WorldRenderRange({ x, z, distance, alwaysVisible = false, children }: React.PropsWithChildren<{ x: number; z: number; distance: number; alwaysVisible?: boolean }>) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (group.current) group.current.visible = alwaysVisible || Math.hypot(camera.position.x - x, camera.position.z - z) <= distance;
  });
  return <group ref={group}>{children}</group>;
}

function furnitureFootprint(item: FurnitureItem) {
  const large = /sofa|couch|bed|desk|table|cabinet|shelf/i.test(`${item.label} ${item.category}`);
  return (large ? 1.15 : 0.7) * item.scale;
}

const INITIAL_AGENTS: AgentData[] = [];
const WORLD_CAMERA = { position: [0, 9, 11] as [number, number, number], near: 0.1, far: 2000 };

const INITIAL_SESSIONS: UserSession[] = [];

const INITIAL_RULES = [
  { id: 'r1', text: 'Execute directives within target latencies (< 50ms).', active: true },
  { id: 'r2', text: 'Maintain strict encryption on direct agent memory.', active: true },
  { id: 'r3', text: 'Auto-report topological collisions or anomalies.', active: false }
];

const persistAgent = (agent: AgentData, modelBlob?: Blob, ownerId?: string): StoredAgent => ({
  ownerId,
  id: agent.id,
  name: agent.name,
  role: agent.role,
  status: agent.status,
  statusText: agent.statusText,
  instructions: agent.instructions,
  modelName: agent.modelName,
  modelContext: agent.modelContext,
  modelUrl: agent.modelUrl,
  aiProvider: agent.aiProvider,
  aiModelId: agent.aiModelId,
  localModelProfile: agent.localModelProfile,
  liveThoughts: agent.liveThoughts,
  savedThoughts: agent.savedThoughts,
  modelHiddenParts: agent.modelHiddenParts,
  modelUseVertexColors: agent.modelUseVertexColors,
  modelRotation: agent.modelRotation,
  animationRetargeting: agent.animationRetargeting,
  idleAnimation: agent.idleAnimation,
  walkingAnimation: agent.walkingAnimation,
  scale: agent.scale,
  startPosX: agent.startPos.x,
  startPosY: agent.startPos.y,
  startPosZ: agent.startPos.z,
  modelBlob
});

function restoreModelUrl(modelUrl: string, modelBlob?: Blob): string {
  if (modelBlob) return URL.createObjectURL(modelBlob);
  // Blob URLs only live for the page session that created them. Older records
  // may have saved the URL without the underlying file, so use the bundled
  // starter model instead of letting useGLTF crash the entire workspace.
  return modelUrl.startsWith('blob:') ? '/models/mint.glb' : modelUrl;
}

function KeyboardControls({ controlsRef, enabled }: { controlsRef: React.RefObject<OrbitControlsImpl | null>; enabled: boolean }) {
  const { camera } = useThree();
  const keys = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const key = e.code === 'Space' ? 'space' : e.key.toLowerCase();
      if (key === 'alt') e.preventDefault();
      if (['space', 'shift'].includes(key)) e.preventDefault();
      keys.current[key] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.code === 'Space' ? 'space' : e.key.toLowerCase();
      keys.current[key] = false;
    };
    const clearKeys = () => { keys.current = {}; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearKeys);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearKeys);
      keys.current = {};
    };
  }, [enabled]);

  useFrame((_, delta) => {
    if (!enabled || !controlsRef.current) return;
    if (keys.current['alt']) return;

    const speed = 10 * delta;
    const moveVector = new THREE.Vector3();

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    if (keys.current['w']) moveVector.add(forward.clone().multiplyScalar(speed));
    if (keys.current['s']) moveVector.sub(forward.clone().multiplyScalar(speed));
    if (keys.current['d']) moveVector.add(right.clone().multiplyScalar(speed));
    if (keys.current['a']) moveVector.sub(right.clone().multiplyScalar(speed));
    if (keys.current['space']) moveVector.y += speed;
    if (keys.current['shift']) moveVector.y -= speed;

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize().multiplyScalar(speed);
      camera.position.add(moveVector);
      controlsRef.current.target.add(moveVector);
      controlsRef.current.update();
    }
  });

  return null;
}

interface AddAgentModalProps {
  ownerId?: string;
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (agentData: Partial<AgentData> & { scale?: number; modelBlob?: Blob }) => void;
}

interface AgentModelOption {
  id: string;
  name: string;
  provider: NonNullable<AgentData['aiProvider']>;
  free: boolean;
  local: boolean;
}

function AddAgentModal({ isOpen, onClose, onDeploy, ownerId }: AddAgentModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [modelSourceType, setModelSourceType] = useState<'upload' | 'url'>('upload');
  const [modelUrl, setModelUrl] = useState('');
  const [modelFileName, setModelFileName] = useState('');
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelError, setModelError] = useState('');
  const [resolvingSketchfab, setResolvingSketchfab] = useState(false);
  const [task, setTask] = useState('');
  const [persona, setPersona] = useState('');
  const [previewReady, setPreviewReady] = useState(false);
  const [modelHiddenParts, setModelHiddenParts] = useState<string[]>([]);
  const [modelUseVertexColors, setModelUseVertexColors] = useState<boolean | undefined>();
  const [modelRotation, setModelRotation] = useState<[number, number, number]>([0, 0, 0]);
  const onPreviewReady = useCallback((ready: boolean) => setPreviewReady(ready), []);
  useEffect(() => { setPreviewReady(false); setModelHiddenParts([]); setModelUseVertexColors(undefined); setModelRotation([0, 0, 0]); }, [modelUrl]);
  const [scale, setScale] = useState<number>(1);
  const [animationRetargeting, setAnimationRetargeting] = useState(DEFAULT_RETARGETING);
  useEffect(() => setAnimationRetargeting(DEFAULT_RETARGETING), [modelUrl]);
  const [animationNames, setAnimationNames] = useState<string[]>([]);
  const [idleAnimation, setIdleAnimation] = useState('');
  const [walkingAnimation, setWalkingAnimation] = useState('');
  const [animationLoadState, setAnimationLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [aiProvider, setAiProvider] = useState<NonNullable<AgentData['aiProvider']>>('openrouter');
  const [aiModelId, setAiModelId] = useState('openrouter/free');
  const [localModelProfile, setLocalModelProfile] = useState<NonNullable<AgentData['localModelProfile']>>('medium');
  const [availableAiModels, setAvailableAiModels] = useState<AgentModelOption[]>([]);
  const [aiModelsNotice, setAiModelsNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const token = getAuthToken();
    if (!token) { setAiModelsNotice('Sign in to load hosted and local AI models.'); return; }
    let cancelled = false;
    void authRequest<AgentModelOption[]>('/api/ai/models', {}, token).then((models) => {
      if (cancelled) return;
      setAvailableAiModels(models);
      setAiModelsNotice(models.length ? '' : 'No models found yet. Add provider keys or start LM Studio’s local server.');
    }).catch(() => { if (!cancelled) setAiModelsNotice('Could not load models. Check provider keys and the LM Studio local server.'); });
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!modelUrl) {
      setAnimationNames([]);
      setAnimationLoadState('idle');
      return;
    }
    if (sketchfabModelUid(modelUrl) || isSpritersResourceModelPage(modelUrl) || isSkowtPage(modelUrl)) {
      setAnimationNames([]);
      setAnimationLoadState('idle');
      return;
    }
    let cancelled = false;
    setAnimationNames([]);
    setIdleAnimation('');
    setWalkingAnimation('');
    setAnimationLoadState('loading');
    const timeout = window.setTimeout(async () => {
      try {
        const gltf = await new GLTFLoader().loadAsync(modelUrl);
        if (cancelled) return;
        const names = gltf.animations.map((clip) => clip.name).filter(Boolean);
        setAnimationNames(names);
        setIdleAnimation(names.find((clip) => /idle|stand|wait|pose/i.test(clip)) || '');
        setWalkingAnimation(names.find((clip) => /walk|run|move|step/i.test(clip)) || '');
        setAnimationLoadState('ready');
      } catch (error) {
        if (cancelled) return;
        console.warn('Could not inspect model animation clips:', error);
        setAnimationLoadState('error');
      }
    }, modelUrl.startsWith('blob:') ? 0 : 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [modelUrl]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setModelError('');
    setModelUrl('');
    setModelFile(null);
    setModelFileName('');
    setResolvingSketchfab(true);
    try {
      const prepared = await prepareModelUpload(file, true);
      const objectUrl = URL.createObjectURL(prepared);
      setModelUrl(objectUrl);
      setModelFileName(prepared.name);
      setModelFile(prepared);
    } catch (error) { setModelError(error instanceof Error ? error.message : 'Could not import this model archive.'); }
    finally { setResolvingSketchfab(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !modelUrl.trim()) return;

    let resolvedUrl = modelUrl.trim();
    let resolvedBlob: Blob | undefined = modelFile || undefined;
    let resolvedName = modelFileName;
    if (modelSourceType === 'url') {
      if (isSkowtPage(resolvedUrl)) {setModelError(SKOWT_MODEL_IMPORT_MESSAGE);return;}
      const uid = sketchfabModelUid(resolvedUrl);
      const spritersPage = isSpritersResourceModelPage(resolvedUrl);
      if (isSketchfabHost(resolvedUrl) && !uid) {
        setModelError('Enter a Sketchfab model page URL ending in its 32-character model ID.');
        return;
      }
      try {
        const enteredUrl = new URL(resolvedUrl);
        if (!['https:', 'http:'].includes(enteredUrl.protocol)) throw new Error();
        if (!uid && !spritersPage && !/\.(?:glb|gltf)$/i.test(enteredUrl.pathname)) {
          setModelError('Use a Sketchfab or The Models Resource asset page, or a direct .glb/.gltf file link.');
          return;
        }
      } catch {
        setModelError('Enter a valid HTTPS model URL.');
        return;
      }
      setModelError('');
      if (uid) {
        const token = getAuthToken();
        if (!token) { setModelError('Sign in again before importing a Sketchfab model.'); return; }
        setResolvingSketchfab(true);
        try {
          const archive = await authRequestBlob('/api/sketchfab/download', { method: 'POST', body: JSON.stringify({ url: resolvedUrl }) }, token);
          resolvedBlob = await normalizeModelBlob(archive);
          resolvedUrl = URL.createObjectURL(resolvedBlob);
          resolvedName = `Sketchfab model · ${uid.slice(0, 8)}`;
        } catch (error) {
          setModelError(error instanceof Error ? error.message : 'Could not import this Sketchfab model.');
          return;
        } finally { setResolvingSketchfab(false); }
      } else if (spritersPage) {
        const token = getAuthToken();
        if (!token) { setModelError('Sign in again before importing a model from The Models Resource.'); return; }
        setResolvingSketchfab(true);
        try {
          const archive = await authRequestBlob('/api/spriters-resource/preview', { method: 'POST', body: JSON.stringify({ url: resolvedUrl }) }, token);
          resolvedBlob = await normalizeModelBlob(archive);
          resolvedUrl = URL.createObjectURL(resolvedBlob);
          resolvedName = 'The Models Resource preview';
        } catch (error) {
          setModelError(error instanceof Error ? error.message : 'Could not import this The Models Resource model.');
          return;
        } finally { setResolvingSketchfab(false); }
      }
    }

    if (resolvedUrl !== modelUrl.trim()) {
      setModelUrl(resolvedUrl);
      setModelFile(resolvedBlob ? new File([resolvedBlob], 'imported-model.glb', { type: resolvedBlob.type }) : null);
      setModelFileName(resolvedName);
      setModelSourceType('upload');
      return;
    }
    if (!previewReady) { setModelError('Wait for the model preview to load before deploying.'); return; }
    onDeploy({
      name: name.trim(),
      role: role.trim() || 'AI Specialist',
      modelName: resolvedName || 'Custom 3D Model',
      aiProvider,
      aiModelId,
      localModelProfile,
      modelContext: resolvedBlob ? 'Local Upload' : 'Remote URL',
      modelUrl: resolvedUrl,
      modelHiddenParts,
      modelUseVertexColors,
      modelRotation,
      animationRetargeting,
      instructions: task.trim() || 'Awaiting commands',
      statusText: persona.trim() || 'Agent initialized and ready.',
      idleAnimation: idleAnimation || undefined,
      walkingAnimation: walkingAnimation || undefined,
      status: 'STANDBY',
      scale: scale,
      modelBlob: resolvedBlob,
    });

    setName('');
    setRole('');
    setTask('');
    setPersona('');
    setModelUrl('');
    setModelFileName('');
    setModelFile(null);
    setModelError('');
    setAiProvider('openrouter');
    setAiModelId('openrouter/free');
    setLocalModelProfile('medium');
    setScale(1);
    setIdleAnimation('');
    setWalkingAnimation('');
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(2, 6, 23, 0.52)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="agent-deploy-dialog" role="dialog" aria-modal="true" aria-labelledby="deploy-agent-title" style={{ width: '100%', maxWidth: '1120px', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', backgroundColor: '#0f172a', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', padding: '20px', color: '#f8fafc', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={20} color="#38bdf8" />
            <h3 id="deploy-agent-title" style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>DEPLOY NEW AGENT</h3>
          </div>
          <button onClick={onClose} disabled={resolvingSketchfab} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: resolvingSketchfab ? 'wait' : 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="agent-deploy-form">
          <aside className="agent-deploy-preview-column" aria-label="Model appearance">
            {isSkowtPage(modelUrl) ? <SkowtPreviewNotice url={modelUrl} onUpload={() => {setModelSourceType('upload');setModelError('');setModelUrl('');setModelFile(null);setModelFileName('');fileInputRef.current?.click();}} /> : canPreviewModel(modelUrl) ? <AgentModelPreview presetOwnerId={ownerId} url={modelUrl} hiddenParts={modelHiddenParts} rotation={modelRotation} onHiddenParts={setModelHiddenParts} onRotation={setModelRotation} onReady={onPreviewReady} useVertexColors={modelUseVertexColors} onUseVertexColors={setModelUseVertexColors} animationRetargeting={animationRetargeting} onAnimationRetargeting={setAnimationRetargeting} idleAnimation={idleAnimation} walkingAnimation={walkingAnimation} onIdleAnimation={setIdleAnimation} onWalkingAnimation={setWalkingAnimation} /> : <div className="agent-deploy-preview-empty"><Box size={40} /><h4>Meet your next agent</h4><p>Upload a model or import a link to preview it here. Rotate the character and choose which parts to show before deploying.</p></div>}
          </aside>
          <div className="agent-deploy-fields">
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>AGENT NAME</label>
            <input
              type="text"
              required
              placeholder="e.g. Mint, Ollie, or your own agent name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>ROLE / TITLE</label>
            <input
              type="text"
              placeholder="e.g. Software Engineer, Designer, Researcher"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>IMPORT 3D MODEL (.GLB / .GLTF)</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                type="button"
                onClick={() => { setModelSourceType('upload'); setModelError(''); setModelUrl(''); setModelFileName(''); setModelFile(null); }}
                style={{ flex: 1, padding: '6px', background: modelSourceType === 'upload' ? '#0284c7' : 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '11px', cursor: 'pointer' }}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => { setModelSourceType('url'); setModelError(''); setModelFile(null); setModelUrl(''); setModelFileName(''); }}
                style={{ flex: 1, padding: '6px', background: modelSourceType === 'url' ? '#0284c7' : 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '11px', cursor: 'pointer' }}
              >
                Model URL
              </button>
            </div>

            {modelSourceType === 'upload' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".glb,.gltf,.zip,.7z"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  disabled={resolvingSketchfab}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: '100%', padding: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px dashed #0284c7', borderRadius: '6px', color: '#38bdf8', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Upload size={16} /> {resolvingSketchfab ? 'Preparing model…' : 'Select GLB, glTF, or model ZIP / 7z'}
                </button>
                {modelFileName && (
                  <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>
                    Selected File: {modelFileName}
                  </span>
                )}
              </div>
            ) : (
              <input
                type="url"
                required
                placeholder="Sketchfab / Models Resource page or direct .glb URL"
                value={modelUrl}
                onChange={(e) => {
                  setModelUrl(e.target.value);
                  setModelError('');
                  const nameFromUrl = e.target.value.split('/').pop() || 'Remote Model';
                  setModelFileName(nameFromUrl);
                }}
                style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', boxSizing: 'border-box' }}
              />
            )}
            {modelError && <div role="alert" style={{ marginTop: 6, color: '#fca5a5', fontSize: 10, lineHeight: 1.4 }}>{modelError}</div>}
            {modelSourceType === 'url' && <SkowtImportGuide url={modelUrl} onUpload={() => {setModelSourceType('upload');setModelError('');setModelUrl('');}} />}
            {modelSourceType === 'url' && isSpritersResourceModelPage(modelUrl) && <BrowserModelImportGuide url={modelUrl} blocked={modelError.includes('403')} onUpload={() => { setModelSourceType('upload'); setModelError(''); setModelUrl(''); setModelFile(null); setModelFileName(''); }} />}
            {modelSourceType === 'upload' && <div style={{ marginTop: 5, color: '#94a3b8', fontSize: 10, lineHeight: 1.5 }}>For MMD models, upload a ZIP or 7z containing the PMX or PMD file and its original texture folders.</div>}
            {modelSourceType === 'url' && <div style={{ marginTop: 5, color: '#94a3b8', fontSize: 10, lineHeight: 1.5 }}>Sketchfab requires a downloadable model and server token. If The Models Resource blocks the link, download its ZIP and choose Upload File. ZIP and 7z archives can contain GLB, glTF, FBX, DAE, PMX, or PMD.</div>}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>AI MODEL · AGENT BRAIN</label>
            <select value={`${aiProvider}|${aiModelId}`} onChange={(event) => {
              const [provider, ...modelParts] = event.target.value.split('|');
              setAiProvider(provider as NonNullable<AgentData['aiProvider']>);
              setAiModelId(modelParts.join('|'));
            }} style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px' }}>
              <option value="openrouter|openrouter/free">OpenRouter · Auto free model</option>
              {availableAiModels.map((model) => <option key={`${model.provider}|${model.id}`} value={`${model.provider}|${model.id}`}>{model.name}{model.local ? ' · Local' : model.free ? ' · Free tier' : ''}</option>)}
            </select>
            {aiModelsNotice && <div style={{ marginTop: '5px', color: '#fbbf24', fontSize: '9px', lineHeight: 1.4 }}>{aiModelsNotice}</div>}
          </div>

          {aiProvider === 'lmstudio' && <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>LOCAL MODEL RESOURCE PROFILE</label>
            <select value={localModelProfile} onChange={(event) => setLocalModelProfile(event.target.value as NonNullable<AgentData['localModelProfile']>)} style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px' }}>
              <option value="high">High · 16K context, higher memory use</option>
              <option value="medium">Medium · 8K context, balanced (recommended)</option>
              <option value="low">Low · 4K context, lower memory use</option>
              <option value="lowest">Lowest · 2K context, minimum memory</option>
            </select>
            <div style={{ marginTop: '5px', color: '#64748b', fontSize: '9px', lineHeight: 1.4 }}>LM Studio will manage GPU offload. Choose a model that fits your available memory.</div>
          </div>}

          <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(148,163,184,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '10px', fontWeight: 800, color: '#38bdf8' }}>ANIMATION SETUP</label>
              <span style={{ fontSize: '9px', color: animationLoadState === 'error' ? '#fbbf24' : '#64748b' }}>
                {animationLoadState === 'loading' ? 'Scanning model…' : animationLoadState === 'error' ? 'Could not scan clips' : animationLoadState === 'ready' ? `${animationNames.length} clips found` : 'Choose a model first'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <label style={{ fontSize: '9px', color: '#94a3b8' }}>Idle animation
                <select value={idleAnimation} onChange={(e) => setIdleAnimation(e.target.value)} disabled={!animationNames.length}
                  style={{ width: '100%', marginTop: '4px', padding: '7px', background: '#111c2d', color: '#e2e8f0', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '6px', fontSize: '10px' }}>
                  <option value="">Auto detect</option>{animationNames.map((clip) => <option key={`idle-${clip}`} value={clip}>{clip}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '9px', color: '#94a3b8' }}>Walking animation
                <select value={walkingAnimation} onChange={(e) => setWalkingAnimation(e.target.value)} disabled={!animationNames.length}
                  style={{ width: '100%', marginTop: '4px', padding: '7px', background: '#111c2d', color: '#e2e8f0', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '6px', fontSize: '10px' }}>
                  <option value="">Auto detect</option>{animationNames.map((clip) => <option key={`walk-${clip}`} value={clip}>{clip}</option>)}
                </select>
              </label>
            </div>
            <div style={{ marginTop: '7px', color: '#64748b', fontSize: '9px', lineHeight: 1.4 }}>We scan the model and preselect likely idle and walk clips. You can change either choice.</div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label htmlFor="deploy-model-scale" style={{ fontSize: '10px', fontWeight: 700, color: '#38bdf8' }}>3D MODEL SIZE</label>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#38bdf8' }}>{scale}x</span>
            </div>
            <div className="deploy-scale-controls"><input
              id="deploy-model-scale"
              type="range"
              min="0.01"
              max="10"
              step="0.01"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            />
              <input type="number" aria-label="Enter initial 3D model size" min="0.01" max="10" step="0.01" key={scale} defaultValue={scale} onBlur={(e) => { const value = e.currentTarget.valueAsNumber; if (Number.isFinite(value)) setScale(Math.max(0.01, Math.min(10, value))); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
            </div>
          </div>

          <div>
            <label htmlFor="deploy-agent-instructions" style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>TASK INSTRUCTIONS</label>
            <p className="deploy-field-hint">What should this agent focus on?</p>
            <AutoGrowTextarea
              id="deploy-agent-instructions"
              placeholder="Describe responsibilities, goals, and how to approach tasks…"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', resize: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label htmlFor="deploy-agent-character" style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>CHARACTER & VOICE</label>
            <p className="deploy-field-hint">Enter a character name and game or anime. Extra personality traits are optional.</p>
            <AutoGrowTextarea
              id="deploy-agent-character"
              placeholder="e.g. Kureiji Ollie — hololive, or GLaDOS — Portal"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={resolvingSketchfab}
              style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#cbd5e1', fontSize: '11px', fontWeight: 700, cursor: resolvingSketchfab ? 'wait' : 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={resolvingSketchfab}
              style={{ flex: 1, padding: '8px', background: resolvingSketchfab ? '#075985' : '#0284c7', border: 'none', borderRadius: '6px', color: 'white', fontSize: '11px', fontWeight: 700, cursor: resolvingSketchfab ? 'wait' : 'pointer' }}
            >
              {resolvingSketchfab ? 'Importing 3D model…' : sketchfabModelUid(modelUrl) || isSpritersResourceModelPage(modelUrl) ? 'Import & preview' : 'Deploy Agent'}
            </button>
          </div>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddFurnitureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: Partial<FurnitureItem> & { modelBlob?: Blob }) => void;
  collections: string[];
}

function AddFurnitureModal({ isOpen, onClose, onAdd, collections }: AddFurnitureModalProps) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('Desk');
  const [modelSourceType, setModelSourceType] = useState<'upload' | 'url'>('upload');
  const [modelUrl, setModelUrl] = useState('');
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelFiles, setModelFiles] = useState<File[]>([]);
  const [modelError, setModelError] = useState('');
  const [resolvingSketchfab, setResolvingSketchfab] = useState(false);
  const [scale, setScale] = useState(1);
  const [collection, setCollection] = useState('');
  const [collectionTouched, setCollectionTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) { setCollection(''); setCollectionTouched(false); setModelFiles([]); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (!selected.length) return;
    setModelError('');
    setModelUrl('');
    setModelFile(null);
    setModelFiles([]);
    setResolvingSketchfab(true);
    try {
    const files: File[] = [];
    for (const source of selected) files.push(await prepareModelUpload(source));
    const file = files[0];
    const objectUrl = URL.createObjectURL(file);
    setModelUrl(objectUrl);
    setModelFile(file);
    setModelFiles(files);
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    if (!collectionTouched) setCollection(files.length > 1 ? `${baseName} Set` : baseName);
    if (!label.trim()) setLabel(baseName);
    } catch (error) { setModelError(error instanceof Error ? error.message : 'Could not import these model files.'); }
    finally { setResolvingSketchfab(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!label.trim() && modelFiles.length <= 1) || !modelUrl.trim()) return;

    let resolvedUrl = modelUrl.trim();
    let resolvedBlob: Blob | undefined = modelFile || undefined;
    if (modelSourceType === 'url') {
      if (isSkowtPage(resolvedUrl)) {setModelError(SKOWT_MODEL_IMPORT_MESSAGE);return;}
      const uid = sketchfabModelUid(resolvedUrl);
      const spritersPage = isSpritersResourceModelPage(resolvedUrl);
      if (isSketchfabHost(resolvedUrl) && !uid) {
        setModelError('Enter a Sketchfab model page URL ending in its 32-character model ID.');
        return;
      }
      try {
        const enteredUrl = new URL(resolvedUrl);
        if (!['https:', 'http:'].includes(enteredUrl.protocol)) throw new Error();
        if (!uid && !spritersPage && !/\.(?:glb|gltf)$/i.test(enteredUrl.pathname)) {
          setModelError('Use a Sketchfab or The Models Resource asset page, or a direct .glb/.gltf file link.');
          return;
        }
      } catch {
        setModelError('Enter a valid HTTPS model URL.');
        return;
      }
      setModelError('');
      if (uid) {
        const token = getAuthToken();
        if (!token) { setModelError('Sign in again before importing a Sketchfab model.'); return; }
        setResolvingSketchfab(true);
        try {
          const archive = await authRequestBlob('/api/sketchfab/download', { method: 'POST', body: JSON.stringify({ url: resolvedUrl }) }, token);
          resolvedBlob = await normalizeModelBlob(archive);
          resolvedUrl = URL.createObjectURL(resolvedBlob);
        } catch (error) {
          setModelError(error instanceof Error ? error.message : 'Could not import this Sketchfab model.');
          return;
        } finally { setResolvingSketchfab(false); }
      } else if (spritersPage) {
        const token = getAuthToken();
        if (!token) { setModelError('Sign in again before importing a model from The Models Resource.'); return; }
        setResolvingSketchfab(true);
        try {
          const archive = await authRequestBlob('/api/spriters-resource/preview', { method: 'POST', body: JSON.stringify({ url: resolvedUrl }) }, token);
          resolvedBlob = await normalizeModelBlob(archive);
          resolvedUrl = URL.createObjectURL(resolvedBlob);
        } catch (error) {
          setModelError(error instanceof Error ? error.message : 'Could not import this The Models Resource model.');
          return;
        } finally { setResolvingSketchfab(false); }
      }
    }

    if (modelFiles.length > 1) {
      const folderName = collection.trim() || 'Imported set';
      modelFiles.forEach((file) => {
        const itemUrl = URL.createObjectURL(file);
        onAdd({ label: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(), category, modelUrl: itemUrl, scale, collection: folderName, modelBlob: file });
      });
      setLabel(''); setCategory('Desk'); setModelUrl(''); setModelFile(null); setModelFiles([]); setScale(1);
      onClose();
      return;
    }

    onAdd({
      label: label.trim(),
      category: category,
      modelUrl: resolvedUrl,
      scale: scale,
      collection: collection.trim() || undefined,
      modelBlob: resolvedBlob,
    });

    setLabel('');
    setCategory('Desk');
    setModelUrl('');
    setModelFile(null);
    setModelFiles([]);
    setScale(1);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(2, 6, 23, 0.52)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#0f172a', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '12px', padding: '20px', color: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Armchair size={20} color="#f59e0b" />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>IMPORT FURNITURE / DECOR</h3>
          </div>
          <button onClick={onClose} disabled={resolvingSketchfab} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: resolvingSketchfab ? 'wait' : 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' }}>DECOR LABEL / NAME</label>
            <input
              type="text"
              required
              placeholder="e.g. Executive Desk, Cyber Couch..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' }}>CATEGORY</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', boxSizing: 'border-box' }}
            >
              <option value="Desk">Desk / Table</option>
              <option value="Chair">Chair / Seating</option>
              <option value="Prop">Decor Prop</option>
              <option value="Lighting">Lighting / Fixture</option>
              <option value="Structure">Partition / Wall</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' }}>FOLDER / DESIGN SET <span style={{ color: '#64748b', fontWeight: 500 }}>optional</span></label>
            <input list="decor-collection-options" value={collection} onChange={(event) => { setCollection(event.target.value); setCollectionTouched(true); }} maxLength={48} placeholder="e.g. matching living room set" style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', boxSizing: 'border-box' }} />
            <datalist id="decor-collection-options">{collections.map((name) => <option key={name} value={name} />)}</datalist>
            <div style={{ marginTop: 4, color: '#64748b', fontSize: 9 }}>Use the same folder name for pieces from the same design.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' }}>3D MODEL FILE (.GLB / .GLTF)</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                type="button"
                onClick={() => { setModelSourceType('upload'); setModelError(''); }}
                style={{ flex: 1, padding: '6px', background: modelSourceType === 'upload' ? '#d97706' : 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '11px', cursor: 'pointer' }}
              >
                Upload File
              </button>
              <button
                type="button"
                onClick={() => { setModelSourceType('url'); setModelError(''); setModelFile(null); setModelFiles([]); if (!collectionTouched) setCollection(''); }}
                style={{ flex: 1, padding: '6px', background: modelSourceType === 'url' ? '#d97706' : 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '11px', cursor: 'pointer' }}
              >
                Model Direct URL
              </button>
            </div>

            {modelSourceType === 'upload' ? (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".glb,.gltf,.zip,.7z"
                  multiple
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  disabled={resolvingSketchfab}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: '100%', padding: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px dashed #d97706', borderRadius: '6px', color: '#f59e0b', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Upload size={16} /> {resolvingSketchfab ? 'Preparing models…' : 'Select models or ZIP / 7z archives'}
                </button>
                {modelFiles.length > 1 && <div style={{ marginTop: 7, padding: '7px 9px', border: '1px solid rgba(245,158,11,.2)', borderRadius: 7, background: 'rgba(180,83,9,.08)', color: '#fcd34d', fontSize: 10 }}><strong>{modelFiles.length} models</strong> will be imported into “{collection || 'Imported set'}”.</div>}
              </div>
            ) : (
              <input
                type="url"
                required
                placeholder="Sketchfab / Models Resource page or direct .glb URL"
                value={modelUrl}
                onChange={(e) => { setModelUrl(e.target.value); setModelError(''); }}
                style={{ width: '100%', padding: '8px 10px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', boxSizing: 'border-box' }}
              />
            )}
            {modelError && <div role="alert" style={{ marginTop: 6, color: '#fca5a5', fontSize: 10, lineHeight: 1.4 }}>{modelError}</div>}
            {modelSourceType === 'url' && <SkowtImportGuide url={modelUrl} onUpload={() => {setModelSourceType('upload');setModelError('');setModelUrl('');}} />}
            {modelSourceType === 'url' && isSpritersResourceModelPage(modelUrl) && <BrowserModelImportGuide url={modelUrl} blocked={modelError.includes('403')} onUpload={() => { setModelSourceType('upload'); setModelError(''); setModelUrl(''); setModelFile(null); setModelFiles([]); }} />}
            {modelSourceType === 'upload' && <div style={{ marginTop: 5, color: '#94a3b8', fontSize: 10, lineHeight: 1.5 }}>For MMD models, upload a ZIP or 7z containing the PMX or PMD file and its original texture folders.</div>}
            {modelSourceType === 'url' && <div style={{ marginTop: 5, color: '#94a3b8', fontSize: 10, lineHeight: 1.5 }}>Sketchfab requires a downloadable model and server token. If The Models Resource blocks the link, download its ZIP and choose Upload File. ZIP and 7z archives can contain GLB, glTF, FBX, DAE, PMX, or PMD.</div>}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b' }}>INITIAL MODEL SCALE</label>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b' }}>{scale}x</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="10"
              step="0.01"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={resolvingSketchfab}
              style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#cbd5e1', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={resolvingSketchfab}
              style={{ flex: 1, padding: '8px', background: resolvingSketchfab ? '#92400e' : '#d97706', border: 'none', borderRadius: '6px', color: 'white', fontSize: '11px', fontWeight: 700, cursor: resolvingSketchfab ? 'wait' : 'pointer' }}
            >
              {resolvingSketchfab ? 'Fetching Sketchfab model…' : 'Place Furniture'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App({ googleAuthEnabled = false }: { googleAuthEnabled?: boolean }) {
  const { confirm, dialog: confirmDialog } = useConfirmModal();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [sessions, setSessions] = useState<UserSession[]>(INITIAL_SESSIONS);
  const [bannedIPs, setBannedIPs] = useState<string[]>([]);
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);
  const [editingModelAgentId, setEditingModelAgentId] = useState<string | null>(null);
  const [isProjectWorkspaceOpen, setIsProjectWorkspaceOpen] = useState(false);
  const [isAddFurnitureOpen, setIsAddFurnitureOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAltUiMode, setIsAltUiMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isSceneObjectDragging, setIsSceneObjectDragging] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPlayerChatOpen, setIsPlayerChatOpen] = useState(false);
  const [isDonationOpen, setIsDonationOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isWorldSettingsOpen, setIsWorldSettingsOpen] = useState(false);
  const [worldSettings, setWorldSettings] = useState<WorldSettingsRecord>({ userId: '', planeX: 0, planeZ: 0, renderDistance: 40, interiorOnly: false, showInteriorBox: false, interiorX: 0, interiorZ: 0, interiorWidth: 12, interiorDepth: 12, interiorHeight: 5 });
  const [povAgentId, setPovAgentId] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentData[]>(INITIAL_AGENTS);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [selectedFurnitureIds, setSelectedFurnitureIds] = useState<Set<string>>(new Set());
  const [decorSort, setDecorSort] = useState<'name' | 'category' | 'recent'>('name');
  const [collapsedDecorFolders, setCollapsedDecorFolders] = useState<Set<string>>(new Set());

  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'DIRECT' | 'RULES' | 'DECOR'>('DIRECT');

  const [chatLog, setChatLog] = useState<Record<string, ChatMessage[]>>({
    'agent-1': [
      { id: 'm-1', sender: 'agent', agentId: 'agent-1', text: 'System standing by. Assign target task or transmit directives.', timestamp: '10:42 AM' }
    ]
  });
  const [inputCommand, setInputCommand] = useState('');
  const [messageAttachment, setMessageAttachment] = useState<File | null>(null);
  const [messageError, setMessageError] = useState('');
  const messageFileRef = useRef<HTMLInputElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const thoughtLibrary = useAgentThoughtLibrary(currentUser?.id, setAgents);

  const [systemRules, setSystemRules] = useState(INITIAL_RULES);
  const [newRuleInput, setNewRuleInput] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const agentsRef = useRef(agents);
  const viewportRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const povTouchLookRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const povReturnCamera = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const decorClipboard = useRef<FurnitureItem[]>([]);
  const appStateWriteRef = useRef<Promise<void>>(Promise.resolve());

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];
  const editingModelAgent = agents.find((agent) => agent.id === editingModelAgentId);
  const hasSelectedAgent = !!selectedAgentId && agents.some((agent) => agent.id === selectedAgentId);
  const selectedFurniture = furniture.find((f) => f.id === selectedFurnitureId);
  const decorObstacles = useMemo(() => furniture.map((item) => ({ x: item.position[0], z: item.position[2], radius: furnitureFootprint(item), label: item.label })), [furniture]);
  const filteredAgents = agents.filter(a => a.name.toLowerCase().includes(searchFilter.toLowerCase()) || a.role.toLowerCase().includes(searchFilter.toLowerCase()));

  useEffect(() => { agentsRef.current = agents; }, [agents]);

  const persistAppState = async (changes: Partial<AppStateRecord>) => {
    const write = async () => {
      const writes: Promise<unknown>[] = [];
      if (Object.prototype.hasOwnProperty.call(changes, 'currentSessionId')) {
        writes.push(db.appState.get('app').then((current) => db.appState.put({ ...current, currentSessionId: changes.currentSessionId, key: 'app' })));
      }
      const userChanges = { ...changes };
      delete userChanges.currentSessionId;
      if (currentUser && Object.keys(userChanges).length > 0) {
        const key = `app:${currentUser.id}`;
        writes.push(db.appState.get(key).then((current) => db.appState.put({ ...current, ...userChanges, key })));
      }
      await Promise.all(writes);
    };
    const pendingWrite = appStateWriteRef.current.then(write, write);
    appStateWriteRef.current = pendingWrite;
    try {
      await pendingWrite;
    } catch (err) {
      console.error('Failed to save app state:', err);
    }
  };

  const selectAgent = (id: string | null) => {
    setSelectedAgentId(id);
    setSelectedFurnitureId(null);
    setSelectedFurnitureIds(new Set());
    const nextTab = id ? 'DIRECT' : activeTab === 'DECOR' ? 'DECOR' : 'DIRECT';
    setActiveTab(nextTab);
    void persistAppState({ selectedAgentId: id, selectedFurnitureId: null, activeTab: nextTab });
  };

  const openSceneDecor = () => {
    setSelectedAgentId(null);
    setActiveTab('DECOR');
    void persistAppState({ selectedAgentId: null, activeTab: 'DECOR' });
  };

  const selectFurniture = (id: string | null) => {
    setSelectedFurnitureId(id);
    setSelectedFurnitureIds(new Set(id ? [id] : []));
    if (id) setSelectedAgentId(null);
    void persistAppState({ selectedFurnitureId: id, ...(id ? { selectedAgentId: null } : {}) });
  };


  const toggleFurnitureSelection = (id: string, additive: boolean) => {
    setSelectedAgentId(null);
    setActiveTab('DECOR');
    const next = additive ? new Set(selectedFurnitureIds) : new Set<string>();
    if (additive && next.has(id)) next.delete(id);
    else next.add(id);
    const selected = Array.from(next);
    const primary = selected[selected.length - 1] ?? null;
    setSelectedFurnitureIds(next);
    setSelectedFurnitureId(primary);
    void persistAppState({ selectedFurnitureId: primary, selectedAgentId: null, activeTab: 'DECOR' });
  };

  const selectFurnitureFolder = (items: FurnitureItem[]) => {
    if (!items.length) return;
    const ids = new Set(items.map((item) => item.id));
    const primary = items[items.length - 1];
    setSelectedAgentId(null);
    setActiveTab('DECOR');
    setSelectedFurnitureIds(ids);
    setSelectedFurnitureId(primary.id);
    void persistAppState({ selectedFurnitureId: primary.id, selectedAgentId: null, activeTab: 'DECOR' });
  };

  const clearFurnitureSelection = () => {
    setSelectedFurnitureId(null);
    setSelectedFurnitureIds(new Set());
    void persistAppState({ selectedFurnitureId: null });
  };

  const handleOutsideFurniturePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (selectedFurnitureIds.size === 0 || !(event.target instanceof Element)) return;
    if (event.target.closest('canvas, button, input, select, textarea, a, [role="button"]')) return;
    clearFurnitureSelection();
  };

  const changeActiveTab = (tab: 'DIRECT' | 'DECOR' | 'RULES') => {
    setActiveTab(tab);
    void persistAppState({ activeTab: tab });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog, selectedAgentId, activeTab]);

  useEffect(() => {
    const loadDbData = async () => {
      try {
        let storedSessions = await db.sessions.toArray();
        const demoSessions = storedSessions.filter((session) => session.id === 'sess-101' && session.userId === 'usr-admin-01' && session.userEmail === 'admin@aetheria.io');
        if (demoSessions.length) {
          await db.sessions.bulkDelete(demoSessions.map((session) => session.id));
          storedSessions = storedSessions.filter((session) => !demoSessions.some((demo) => demo.id === session.id));
        }
        if (storedSessions.length === 0) {
          storedSessions = INITIAL_SESSIONS;
        }
        setSessions(storedSessions);

        const storedBannedIPs = await db.bannedIPs.toArray();
        if (storedBannedIPs.length > 0) setBannedIPs(storedBannedIPs.map((item) => item.ip));

        const savedState = await db.appState.get('app');
        if (savedState?.currentSessionId) {
          const currentSession = storedSessions.find((session) => session.id === savedState.currentSessionId && session.status === 'ACTIVE');
          if (currentSession) {
            const savedUser = await db.users.get(currentSession.userId);
            if (savedUser) setCurrentUser(savedUser);
          }
        }
      } catch (err) {
        console.error('Failed to fetch data from IndexedDB:', err);
      }
    };
    loadDbData();
  }, []);

  useEffect(() => {
    if (!isAccountMenuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setIsAccountMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsAccountMenuOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewportRef.current?.requestFullscreen?.().catch((err) => console.error(err));
    } else {
      document.exitFullscreen?.().catch((err) => console.error(err));
    }
  };

  const toggleAgentPov = () => {
    if (povAgentId) {
      setPovAgentId(null);
      if (povReturnCamera.current && controlsRef.current) {
        controlsRef.current.object.position.copy(povReturnCamera.current.position);
        controlsRef.current.target.copy(povReturnCamera.current.target);
        controlsRef.current.update();
      }
      povReturnCamera.current = null;
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    if (!hasSelectedAgent || !selectedAgent || selectedAgent.status === 'OFFLINE') return;
    if (controlsRef.current) {
      povReturnCamera.current = {
        position: controlsRef.current.object.position.clone(),
        target: controlsRef.current.target.clone()
      };
    }
    setPovAgentId(selectedAgent.id);
    const canvas = viewportRef.current?.querySelector('canvas');
    if (canvas && document.pointerLockElement !== canvas) void canvas.requestPointerLock().catch((err) => console.warn('Pointer lock was not available:', err));
  };

  useEffect(() => {
    const handleAppShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (isFullscreen && !povAgentId && event.key === 'Alt') {
        event.preventDefault();
        setIsAltUiMode(true);
        return;
      }
      if (event.key === 'F5') {
        event.preventDefault();
        toggleFullscreen();
        return;
      }
      if (event.key.toLowerCase() === 'e' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && !povAgentId && !isProfileOpen && !isPlayerChatOpen && !isAdminDashboardOpen && !isWorldSettingsOpen) {
        event.preventDefault();
        setEditMode((value) => !value);
        return;
      }
      if (isFullscreen && !povAgentId && event.key === 'Home') {
        event.preventDefault();
        resetWorldView();
        return;
      }
      if (event.key.toLowerCase() === 'p' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        toggleAgentPov();
      }
    };
    const handleAppKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setIsAltUiMode(false);
    };
    const clearAltUiMode = () => setIsAltUiMode(false);
    window.addEventListener('keydown', handleAppShortcuts);
    window.addEventListener('keyup', handleAppKeyUp);
    window.addEventListener('blur', clearAltUiMode);
    return () => {
      window.removeEventListener('keydown', handleAppShortcuts);
      window.removeEventListener('keyup', handleAppKeyUp);
      window.removeEventListener('blur', clearAltUiMode);
    };
  }, [isFullscreen, povAgentId, selectedAgentId, hasSelectedAgent, editMode, isProfileOpen, isPlayerChatOpen, isAdminDashboardOpen, isWorldSettingsOpen]);

  const sendPovKey = (key: string, pressed: boolean) => {
    const code = key === 'space' ? 'Space' : `Key${key.toUpperCase()}`;
    const keyboardKey = key === 'space' ? ' ' : key;
    window.dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', { key: keyboardKey, code, bubbles: true, cancelable: true }));
  };

  const handleUpdateAgentScale = async (agentId: string, newScale: number) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, scale: newScale } : a))
    );
    try {
      await db.agents.update(agentId, { scale: newScale });
    } catch (err) {
      console.error('Failed to save updated scale:', err);
    }
  };

  const handleUpdateAgent = async (agentId: string, changes: Partial<AgentData>) => {
    setAgents((prev) => prev.map((agent) => agent.id === agentId ? { ...agent, ...changes } : agent));
    try {
      await db.agents.update(agentId, changes as Partial<StoredAgent>);
    } catch (err) {
      console.error('Failed to save agent changes:', err);
    }
  };

  const terminateAgent = async (agentId: string) => {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent || agent.status === 'OFFLINE') return;
    const terminatedAt = new Date().toISOString();
    setAgents((prev) => prev.map((item) => item.id === agentId ? { ...item, status: 'OFFLINE', terminatedAt } : item));
    try { await db.agents.update(agentId, { status: 'OFFLINE', terminatedAt }); }
    catch (error) { console.error('Could not terminate agent:', error); }
    if (povAgentId === agentId) {
      setPovAgentId(null);
      if (povReturnCamera.current && controlsRef.current) {
        controlsRef.current.object.position.copy(povReturnCamera.current.position);
        controlsRef.current.target.copy(povReturnCamera.current.target);
        controlsRef.current.update();
      }
      povReturnCamera.current = null;
      if (document.pointerLockElement) document.exitPointerLock();
    }
    if (selectedAgentId === agentId) setIsTyping(false);
  };

  const reactivateAgent = async (agentId: string) => {
    setAgents((prev) => prev.map((item) => item.id === agentId ? { ...item, status: 'STANDBY', terminatedAt: undefined } : item));
    try { await db.agents.update(agentId, { status: 'STANDBY', terminatedAt: undefined }); }
    catch (error) { console.error('Could not reactivate agent:', error); }
  };

  const deleteAgent = async (agentId: string) => {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent || !await confirm(`Permanently delete ${agent.name} and its saved model file from Aetheria? Its conversation will be kept in the admin message archive.`, { title: 'Delete agent and model', confirmLabel: 'Delete agent and model', destructive: true })) return;
    const agentMessages = await db.messages.where('agentId').equals(agentId).toArray().catch(() => [] as ChatMessage[]);
    const archivedAt = new Date().toISOString();
    try {
      await db.transaction('rw', db.agents, db.messages, db.adminMessageArchive, async () => {
        if (agentMessages.length) await db.adminMessageArchive.bulkPut(agentMessages.map((message) => ({ ...message, archivedAt })));
        await db.messages.where('agentId').equals(agentId).delete();
        // The uploaded modelBlob lives in this record and is removed with it.
        await db.agents.delete(agentId);
      });
      setAgents((prev) => prev.filter((item) => item.id !== agentId));
      const modelStillUsed = agents.some((other) => other.id !== agentId && other.modelUrl === agent.modelUrl)
        || furniture.some((item) => item.modelUrl === agent.modelUrl);
      if (!modelStillUsed) {
        useGLTF.clear(agent.modelUrl);
        if (agent.modelUrl.startsWith('blob:')) URL.revokeObjectURL(agent.modelUrl);
      }
      setChatLog((prev) => { const next = { ...prev }; delete next[agentId]; return next; });
      if (selectedAgentId === agentId) {
        setSelectedAgentId(null);
        setIsTyping(false);
        void persistAppState({ selectedAgentId: null });
      }
      if (povAgentId === agentId) {
        setPovAgentId(null);
        if (povReturnCamera.current && controlsRef.current) {
          controlsRef.current.object.position.copy(povReturnCamera.current.position);
          controlsRef.current.target.copy(povReturnCamera.current.target);
          controlsRef.current.update();
        }
        povReturnCamera.current = null;
        if (document.pointerLockElement) document.exitPointerLock();
      }
    } catch (error) { console.error('Could not delete agent:', error); }
  };

  const handleAgentPositionChange = useCallback(async (agentId: string, position: THREE.Vector3) => {
    const safePosition = position.clone();
    furniture.forEach((item) => {
      const dx = safePosition.x - item.position[0];
      const dz = safePosition.z - item.position[2];
      const obstacle = decorObstacles.find((entry) => entry.x === item.position[0] && entry.z === item.position[2]);
      const minDistance = obstacle?.radius ?? 0.8;
      const distance = Math.hypot(dx, dz);
      if (distance < minDistance + 0.5) {
        const angle = distance > 0.001 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
        safePosition.x = item.position[0] + Math.cos(angle) * (minDistance + 0.5);
        safePosition.z = item.position[2] + Math.sin(angle) * (minDistance + 0.5);
      }
    });
    setAgents((prev) => prev.map((agent) => agent.id === agentId ? { ...agent, startPos: safePosition.clone() } : agent));
    try {
      await db.agents.update(agentId, { startPosX: safePosition.x, startPosY: safePosition.y, startPosZ: safePosition.z });
    } catch (err) {
      console.error('Failed to save agent position:', err);
    }
  }, [furniture, decorObstacles]);

  const handleUpdateFurnitureScale = async (id: string, newScale: number) => {
    setFurniture((prev) =>
      prev.map((f) => (f.id === id ? { ...f, scale: newScale } : f))
    );
    try {
      await db.furniture.update(id, { scale: newScale });
    } catch (err) {
      console.error('Failed to save furniture scale:', err);
    }
  };

  const handleRotateFurniture = async (id: string, axis: 'rotationX' | 'rotationY' | 'rotationZ', degrees: number) => {
    const rotation = THREE.MathUtils.degToRad(degrees);
    setFurniture((prev) => prev.map((item) => item.id === id ? { ...item, [axis]: rotation } : item));
    try {
      await db.furniture.update(id, { [axis]: rotation });
    } catch (err) {
      console.error('Failed to save furniture rotation:', err);
    }
  };

  const moveSelectedFurniture = (dx: number, dz: number) => {
    const movingIds = new Set(furniture.filter((item) => selectedFurnitureIds.has(item.id)).map((item) => item.id));
    const blocked = furniture.some((item) => {
        if (!movingIds.has(item.id)) return false;
        const nx = item.position[0] + dx;
        const nz = item.position[2] + dz;
        return furniture.some((other) => !movingIds.has(other.id) && Math.hypot(nx - other.position[0], nz - other.position[2]) < furnitureFootprint(item) + furnitureFootprint(other));
      });
    if (blocked) return;
    const updates = furniture.filter((item) => movingIds.has(item.id)).map((item) => ({
      ...item,
      position: [item.position[0] + dx, item.position[1], item.position[2] + dz] as [number, number, number]
    }));
    if (!updates.length) return;
    const updateById = new Map(updates.map((item) => [item.id, item]));
    setFurniture((prev) => prev.map((item) => updateById.get(item.id) ?? item));
    void db.furniture.bulkPut(updates);
  };

  const adjustFurnitureHeight = useCallback((id: string, delta: number) => {
    const movingIds = selectedFurnitureIds.has(id) ? selectedFurnitureIds : new Set([id]);
    setFurniture((previous) => {
      const updates = previous.filter((item) => movingIds.has(item.id)).map((item) => ({
        ...item,
        position: [item.position[0], THREE.MathUtils.clamp(item.position[1] + delta, -50, 50), item.position[2]] as [number, number, number]
      }));
      void db.furniture.bulkPut(updates);
      const updateById = new Map(updates.map((item) => [item.id, item]));
      return previous.map((item) => updateById.get(item.id) ?? item);
    });
  }, [selectedFurnitureIds]);

  const resetWorldView = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cameraOffset = controls.object.position.clone().sub(controls.target);
    controls.target.set(0, 0, 0);
    controls.object.position.copy(cameraOffset);
    controls.object.lookAt(controls.target);
    controls.update();
  };

  const pasteDecorClipboard = async () => {
    const copied = decorClipboard.current;
    if (copied.length === 0) return;
    const offsets: Array<[number, number]> = [[1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4], [2.2, 0], [0, 2.2]];
    const destination = offsets.find(([dx, dz]) => {
      const candidates = copied.map((item) => [item.position[0] + dx, item.position[2] + dz] as const);
      const hitsExisting = candidates.some(([x, z], index) => furniture.some((other) =>
        Math.hypot(x - other.position[0], z - other.position[2]) < furnitureFootprint(copied[index]) + furnitureFootprint(other)
      ));
      const hitsEachOther = candidates.some(([x, z], index) => candidates.slice(index + 1).some(([otherX, otherZ], nextIndex) =>
        Math.hypot(x - otherX, z - otherZ) < furnitureFootprint(copied[index]) + furnitureFootprint(copied[index + nextIndex + 1])
      ));
      return !hitsExisting && !hitsEachOther;
    }) || offsets[0];
    const [offsetX, offsetZ] = destination;
    const timestamp = Date.now();
    const pasted = copied.map((item, index) => ({
      ...item,
      id: `furn-${timestamp}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      label: `${item.label} copy`,
      position: [item.position[0] + offsetX, item.position[1], item.position[2] + offsetZ] as [number, number, number]
    }));
    const storedItems = await Promise.all(pasted.map(async (item, index) => {
      const source = await db.furniture.get(copied[index].id);
      return { ...item, modelBlob: source?.modelBlob };
    }));
    setFurniture((previous) => [...previous, ...pasted]);
    const newSelection = new Set(pasted.map((item) => item.id));
    setSelectedFurnitureIds(newSelection);
    setSelectedFurnitureId(pasted[pasted.length - 1]?.id || null);
    setSelectedAgentId(null);
    setActiveTab('DECOR');
    void persistAppState({ selectedFurnitureId: pasted[pasted.length - 1]?.id || null, selectedAgentId: null, activeTab: 'DECOR' });
    await db.furniture.bulkPut(storedItems);
  };

  useEffect(() => {
    const handleDecorRotate = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!(event.ctrlKey || event.metaKey) || target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'c' && selectedFurnitureIds.size > 0) {
        event.preventDefault();
        decorClipboard.current = furniture.filter((item) => selectedFurnitureIds.has(item.id));
      } else if (key === 'v' && decorClipboard.current.length > 0) {
        event.preventDefault();
        void pasteDecorClipboard().catch((err) => console.error('Failed to paste decor:', err));
      } else if (key === 'r' && selectedFurnitureIds.size > 0) {
        event.preventDefault();
        const ids = selectedFurnitureIds;
        const updated = furniture.filter((item) => ids.has(item.id)).map((item) => ({ ...item, rotationY: (item.rotationY + THREE.MathUtils.degToRad(15)) % (Math.PI * 2) }));
        setFurniture((prev) => prev.map((item) => updated.find((next) => next.id === item.id) || item));
        void db.furniture.bulkPut(updated);
      }
    };
    window.addEventListener('keydown', handleDecorRotate);
    return () => window.removeEventListener('keydown', handleDecorRotate);
  }, [furniture, selectedFurnitureIds]);

  const sortedFurniture = [...furniture].sort((a, b) => decorSort === 'category'
    ? a.category.localeCompare(b.category) || a.label.localeCompare(b.label)
    : decorSort === 'recent' ? b.id.localeCompare(a.id) : a.label.localeCompare(b.label));
  const furnitureFolders = Array.from(sortedFurniture.reduce((folderMap, item) => {
    const folder = item.collection?.trim() || 'Unfiled';
    const items = folderMap.get(folder) || [];
    items.push(item);
    folderMap.set(folder, items);
    return folderMap;
  }, new Map<string, FurnitureItem[]>())).sort(([nameA], [nameB]) => nameA === 'Unfiled' ? 1 : nameB === 'Unfiled' ? -1 : nameA.localeCompare(nameB));

  const handleAddFurniture = async (itemData: Partial<FurnitureItem> & { modelBlob?: Blob }) => {
    const center = agents.find((agent) => agent.id === povAgentId)?.startPos || controlsRef.current?.target || new THREE.Vector3();
    const posX = center.x + (Math.random() - 0.5) * 6;
    const posZ = center.z + (Math.random() - 0.5) * 6;

    const newItem: FurnitureItem = {
      id: `furn-${Date.now()}`,
      ownerId: currentUser?.id,
      label: itemData.label || 'Decor Item',
      category: itemData.category || 'Prop',
      modelUrl: itemData.modelUrl || '/models/mint.glb',
      scale: itemData.scale || 1,
      position: [posX, 0, posZ],
      rotationY: 0,
      collection: itemData.collection?.trim() || undefined
    };

    setFurniture((prev) => [...prev, newItem]);
    selectFurniture(newItem.id);

    try {
      await db.furniture.put({ ...newItem, modelBlob: itemData.modelBlob, ownerId: currentUser?.id });
    } catch (err) {
      console.error('Failed to save furniture to DB:', err);
    }
  };

  const handleDeleteFurniture = async (id: string) => {
    const toDelete = selectedFurnitureIds.has(id) && selectedFurnitureIds.size > 1 ? Array.from(selectedFurnitureIds) : [id];
    const deletedIds = new Set(toDelete);
    try {
      // Each decor record owns its saved modelBlob, so deleting the records
      // also removes the imported files from Aetheria's database.
      await db.furniture.bulkDelete(toDelete);
    } catch (err) {
      console.error('Failed to delete furniture from DB:', err);
      return;
    }
    const modelUrls = new Set(furniture.filter((item) => deletedIds.has(item.id)).map((item) => item.modelUrl));
    setFurniture((prev) => prev.filter((item) => !deletedIds.has(item.id)));
    modelUrls.forEach((modelUrl) => {
      const modelStillUsed = furniture.some((item) => !deletedIds.has(item.id) && item.modelUrl === modelUrl)
        || agents.some((agent) => agent.modelUrl === modelUrl);
      if (!modelStillUsed) {
        useGLTF.clear(modelUrl);
        if (modelUrl.startsWith('blob:')) URL.revokeObjectURL(modelUrl);
      }
    });
    const remaining = new Set(Array.from(selectedFurnitureIds).filter((selectedId) => !deletedIds.has(selectedId)));
    if (deletedIds.has(selectedFurnitureId || '')) {
      const remainingIds = Array.from(remaining);
      const primary = remainingIds[remainingIds.length - 1] ?? null;
      setSelectedFurnitureIds(remaining);
      setSelectedFurnitureId(primary);
      void persistAppState({ selectedFurnitureId: primary });
    }
  };

  const handleDeployAgent = async (agentData: Partial<AgentData> & { scale?: number; modelBlob?: Blob }) => {
    const center = agents.find((agent) => agent.id === povAgentId)?.startPos || controlsRef.current?.target || new THREE.Vector3();
    const posX = center.x + (Math.random() - 0.5) * 8;
    const posZ = center.z + (Math.random() - 0.5) * 8;

    const newAgent: AgentData = {
      id: `agent-${Date.now()}`,
      name: agentData.name || 'New Agent',
      role: agentData.role || 'Specialist',
      status: 'STANDBY',
      statusText: agentData.statusText || 'Awaiting commands',
      instructions: agentData.instructions || 'Standard duties',
      modelName: agentData.modelName || 'Custom Model',
      aiProvider: agentData.aiProvider || 'openrouter',
      aiModelId: agentData.aiModelId || 'openrouter/free',
      localModelProfile: agentData.localModelProfile || 'medium',
      modelHiddenParts: agentData.modelHiddenParts,
      modelUseVertexColors: agentData.modelUseVertexColors,
      modelRotation: agentData.modelRotation,
      animationRetargeting: agentData.animationRetargeting,
      modelContext: agentData.modelContext || 'Custom',
      modelUrl: agentData.modelUrl || '/models/mint.glb',
      idleAnimation: agentData.idleAnimation,
      walkingAnimation: agentData.walkingAnimation,
      scale: agentData.scale || 1,
      startPos: new THREE.Vector3(posX, 0, posZ)
    };

    setAgents((prev) => [...prev, newAgent]);
    selectAgent(newAgent.id);

    const initialMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'agent',
      agentId: newAgent.id,
      text: `Unit loaded with model "${newAgent.modelName}" (Scale: ${newAgent.scale}x). Ready for tasks.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatLog((prev) => ({ ...prev, [newAgent.id]: [initialMsg] }));

    try {
      await db.agents.put(persistAgent(newAgent, agentData.modelBlob, currentUser?.id));
      await db.messages.put({ ...initialMsg, ownerId: currentUser?.id });
    } catch (err) {
      console.error('Failed to store agent in DB:', err);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputCommand.trim() && !messageAttachment) || isTyping || !selectedAgent || selectedAgent.status === 'OFFLINE') return;

    // The local workspace can remain visible after the server session expires (for
    // example, after the backend restarts). AI calls require a live server token.
    if (!getAuthToken()) {
      setAuthToken(null);
      setCurrentUser(null);
      setShowAuthScreen(true);
      return;
    }

    const userMsgText = inputCommand.trim();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      ownerId: currentUser?.id,
      sender: 'user',
      agentId: selectedAgent.id,
      text: userMsgText,
      timestamp: timeStr,
      ...(messageAttachment ? { attachmentBlob: messageAttachment, attachmentType: messageAttachment.type, attachmentName: messageAttachment.name, attachmentSize: messageAttachment.size } : {})
    };

    setInputCommand('');
    setMessageAttachment(null);
    setMessageError('');
    setChatLog((prev) => ({
      ...prev,
      [selectedAgent.id]: [...(prev[selectedAgent.id] || []), userMsg]
    }));

    try {
      await db.messages.put(userMsg);
    } catch (err) {
      console.error('Failed to save message:', err);
    }

    setIsTyping(true);

    setTimeout(async () => {
      if (agentsRef.current.find((agent) => agent.id === selectedAgent.id)?.status === 'OFFLINE') {
        if (selectedAgentId === selectedAgent.id) setIsTyping(false);
        return;
      }
      let replyText = '';
      try {
        const token = getAuthToken();
        if (!token) throw new Error('Sign in again to use AI models.');
        const recentMessages = (chatLog[selectedAgent.id] || []).filter((message) => !message.deletedAt).slice(-10).map((message) => `${message.sender === 'user' ? 'User' : selectedAgent.name}: ${message.text}`).join('\n');
        const response = await authRequest<{ text: string }>('/api/ai/chat', {
          method: 'POST',
          body: JSON.stringify({
            provider: selectedAgent.aiProvider || 'openrouter',
            modelId: selectedAgent.aiModelId || 'openrouter/free',
            localModelProfile: selectedAgent.localModelProfile || 'medium',
            prompt: `${recentMessages ? `Recent conversation:\n${recentMessages}\n\n` : ''}${userMsgText}`,
            systemInstruction: agentPersonaInstruction(selectedAgent)
          })
        }, token);
        replyText = response.text;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message === 'Please sign in again.' || message === 'Sign in again to use AI models.') {
          setAuthToken(null);
          setCurrentUser(null);
          setShowAuthScreen(true);
          replyText = 'Your sign-in expired. Sign in again to continue chatting.';
        } else {
          replyText = message ? `I couldn’t reach my assigned model: ${message}` : 'I couldn’t reach my assigned model. Try again.';
        }
      }

      const agentReply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        ownerId: currentUser?.id,
        sender: 'agent',
        agentId: selectedAgent.id,
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatLog((prev) => ({
        ...prev,
        [selectedAgent.id]: [...(prev[selectedAgent.id] || []), agentReply]
      }));
      setIsTyping(false);

      try {
        await db.messages.put(agentReply);
      } catch (err) {
        console.error('Failed to save agent reply:', err);
      }
    }, 900);
  };

  const deleteChatMessage = async (msg: ChatMessage) => {
    if (!currentUser || !msg.ownerId || (currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPERADMIN' && msg.ownerId !== currentUser.id)) return;
    const deletedAt = new Date().toISOString();
    const archived = { ...msg, archivedAt: deletedAt };
    const hidden = { ...msg, deletedAt, deletedBy: currentUser.id };
    try {
      await db.transaction('rw', db.messages, db.adminMessageArchive, async () => {
        await db.adminMessageArchive.put(archived);
        await db.messages.put(hidden);
      });
      setChatLog((prev) => ({ ...prev, [msg.agentId || selectedAgent.id]: (prev[msg.agentId || selectedAgent.id] || []).map((item) => item.id === msg.id ? hidden : item) }));
    } catch (error) { console.error('Unable to retain and remove this message:', error); }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleInput.trim()) return;
    const rule = { id: `${currentUser?.id || 'guest'}-r-${Date.now()}`, ownerId: currentUser?.id, text: newRuleInput.trim(), active: true };
    setSystemRules((prev) => [...prev, rule]);
    setNewRuleInput('');
    try { await db.rules.put(rule); } catch (err) { console.error('Failed to save rule:', err); }
  };

  const toggleRule = async (id: string) => {
    const rule = systemRules.find((item) => item.id === id);
    if (!rule) return;
    const updated = { ...rule, ownerId: currentUser?.id, active: !rule.active };
    setSystemRules((prev) => prev.map((r) => r.id === id ? updated : r));
    try { await db.rules.put(updated); } catch (err) { console.error('Failed to save rule:', err); }
  };

  const handleUpdateProfile = async (changes: Partial<Pick<UserProfile, 'name' | 'avatar' | 'signature' | 'hideUid' | 'coverImage' | 'showUidOnPlane' | 'avatarAlbum' | 'coverAlbum'>>) => {
    if (!currentUser) return;
    const addAvatarToAlbum = !!changes.avatar && changes.avatar !== currentUser.avatar;
    const addCoverToAlbum = !!changes.coverImage && changes.coverImage !== currentUser.coverImage && !!currentUser.coverImage;
    const avatarAlbum = changes.avatarAlbum ?? (addAvatarToAlbum
      ? [currentUser.avatar, ...(currentUser.avatarAlbum || [])].filter((image, index, all) => !!image && image !== changes.avatar && all.indexOf(image) === index).slice(0, 12)
      : currentUser.avatarAlbum);
    const coverAlbum = changes.coverAlbum ?? (addCoverToAlbum
      ? [currentUser.coverImage!, ...(currentUser.coverAlbum || [])].filter((image, index, all) => !!image && image !== changes.coverImage && all.indexOf(image) === index).slice(0, 12)
      : currentUser.coverAlbum);
    const avatarAlbumDates = changes.avatarAlbum
      ? changes.avatarAlbum.map((image) => { const index = currentUser.avatarAlbum?.indexOf(image) ?? -1; return index >= 0 ? currentUser.avatarAlbumDates?.[index] ?? null : null; })
      : addAvatarToAlbum ? (avatarAlbum || []).map((image) => image === currentUser.avatar ? new Date().toISOString() : (() => { const index = currentUser.avatarAlbum?.indexOf(image) ?? -1; return index >= 0 ? currentUser.avatarAlbumDates?.[index] ?? null : null; })()) : currentUser.avatarAlbumDates;
    const coverAlbumDates = changes.coverAlbum
      ? changes.coverAlbum.map((image) => { const index = currentUser.coverAlbum?.indexOf(image) ?? -1; return index >= 0 ? currentUser.coverAlbumDates?.[index] ?? null : null; })
      : addCoverToAlbum ? (coverAlbum || []).map((image) => image === currentUser.coverImage ? new Date().toISOString() : (() => { const index = currentUser.coverAlbum?.indexOf(image) ?? -1; return index >= 0 ? currentUser.coverAlbumDates?.[index] ?? null : null; })()) : currentUser.coverAlbumDates;
    const updatedUser = { ...currentUser, ...changes, avatarAlbum, coverAlbum, avatarAlbumDates, coverAlbumDates };
    try {
      if (changes.name !== undefined) {
        const token = getAuthToken();
        if (!token) throw new Error('Your sign-in expired. Please sign in again.');
        const account = await authRequest<AuthAccount>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ name: changes.name }) }, token);
        updatedUser.name = account.name;
      }
      await db.users.put(updatedUser);
      setCurrentUser(updatedUser);
      const appState = await db.appState.get('app');
      if (appState?.currentSessionId) {
        const sessionChanges = { userName: updatedUser.name, avatarUrl: updatedUser.avatar };
        try {
          await db.sessions.update(appState.currentSessionId, sessionChanges);
          setSessions((prev) => prev.map((session) => session.id === appState.currentSessionId ? { ...session, ...sessionChanges } : session));
        } catch (err) {
          console.error('Profile saved, but the session summary could not be updated:', err);
        }
      }
    } catch (err) {
      console.error('Failed to save profile:', err);
      throw err;
    }
  };

  const handleLogin = async (account: AuthAccount) => {
    const existingUsers = await db.users.toArray().catch(() => [] as UserProfile[]);
    const matchingUsers = existingUsers.filter((user) => user.email.trim().toLowerCase() === account.email.trim().toLowerCase());
    const existingUser = matchingUsers[0];
    const newUser: UserProfile = {
      ...(existingUser || {} as UserProfile),
      id: account.id,
      name: account.name,
      email: account.email,
      avatar: existingUser?.avatar || account.avatar || getAvatarPlaceholder(account.name),
      role: account.role,
      uid: existingUser?.uid || account.uid,
      hideUid: existingUser?.hideUid ?? false,
      showUidOnPlane: existingUser?.showUidOnPlane ?? true,
      avatarAlbum: existingUser?.avatarAlbum || [],
      coverAlbum: existingUser?.coverAlbum || [],
      ip: 'Local device',
      joinedDate: existingUser?.joinedDate || account.joinedDate,
      signature: existingUser?.signature || ''
    };
    const browser = navigator.userAgent.slice(0, 100) || 'Browser';
    const existingSessions = await db.sessions.where('userId').equals(newUser.id).toArray().catch(() => [] as UserSession[]);
    const newSession: UserSession = {
      id: existingSessions.find((session) => session.status === 'ACTIVE')?.id || `sess-${crypto.randomUUID()}`,
      userId: newUser.id,
      userName: newUser.name,
      userEmail: newUser.email,
      avatarUrl: newUser.avatar,
      role: newUser.role,
      ipAddress: 'This device',
      location: 'Not collected',
      browser,
      loginMethod: 'CREDENTIALS',
      lastActive: 'Just Now',
      status: 'ACTIVE'
    };
    try {
      await db.transaction('rw', db.users, db.sessions, async () => {
        const duplicateIds = matchingUsers.filter((user) => user.id !== newUser.id).map((user) => user.id);
        if (duplicateIds.length) await db.users.bulkDelete(duplicateIds);
        await db.users.put(newUser);
        const duplicateSessions = existingSessions.filter((session) => session.id !== newSession.id).map((session) => session.id);
        if (duplicateSessions.length) await db.sessions.bulkDelete(duplicateSessions);
        await db.sessions.put(newSession);
      });
      await persistAppState({ currentSessionId: newSession.id });
    } catch (err) { console.error('Local profile/session update failed:', err); }
    setCurrentUser(newUser);
    setSessions((previous) => [newSession, ...previous.filter((session) => session.userId !== newUser.id)]);
  };

  useEffect(() => {
    const token = getAuthToken();
    if (!token) { setAuthChecking(false); return; }
    let active = true;
    void authRequest<AuthAccount>('/api/auth/me', {}, token).then((account) => { if (active) return handleLogin(account); }).catch(() => { setAuthToken(null); }).finally(() => { if (active) setAuthChecking(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const loadWorkspace = async () => {
      const userId = currentUser.id;
      setAgents([]);
      setFurniture([]);
      setChatLog({});
      setSystemRules([]);
      setSelectedAgentId(null);
      setSelectedFurnitureId(null);
      setSelectedFurnitureIds(new Set());

      const agentRows = await db.agents.where('ownerId').equals(userId).toArray();
      const isUntouchedMintStarter = (row: StoredAgent) => row.name === 'Mint' && row.role === 'Senior Developer' && row.modelName === 'Mint Standard GLB' && row.modelUrl === '/models/mint.glb' && /(?:^|-)agent-1$/.test(row.id);
      const obsoleteMintRows = agentRows.filter(isUntouchedMintStarter);
      if (obsoleteMintRows.length) await db.agents.bulkDelete(obsoleteMintRows.map((row) => row.id));
      let storedAgents = agentRows.filter((row) => !isUntouchedMintStarter(row));
      if (storedAgents.length === 0) {
        const legacyRows = await db.agents.filter((row) => !row.ownerId).toArray();
        const legacyMintRows = legacyRows.filter(isUntouchedMintStarter);
        if (legacyMintRows.length) await db.agents.bulkDelete(legacyMintRows.map((row) => row.id));
        const legacyAgents = legacyRows.filter((row) => !isUntouchedMintStarter(row));
        if (legacyAgents.length > 0) {
          storedAgents = legacyAgents.map((row) => ({ ...row, ownerId: userId }));
          await db.agents.bulkPut(storedAgents);
        }
      }
      const mappedAgents: AgentData[] = await Promise.all(storedAgents.map(async (row) => {
        const modelBlob = row.modelBlob ? await normalizeModelBlob(row.modelBlob) : undefined;
        if (modelBlob && modelBlob !== row.modelBlob) void db.agents.update(row.id, { modelBlob }).catch((error) => console.error('Could not save converted agent model:', error));
        return {
          ...row,
          ...(modelBlob ? { modelBlob } : {}),
          modelUrl: restoreModelUrl(row.modelUrl, modelBlob),
          scale: row.scale || 1,
          startPos: new THREE.Vector3(row.startPosX || 0, row.startPosY || 0, row.startPosZ || 0)
        };
      }));

      let storedFurniture = await db.furniture.where('ownerId').equals(userId).toArray();
      if (storedFurniture.length === 0) {
        const legacyFurniture = await db.furniture.filter((row) => !row.ownerId).toArray();
        if (legacyFurniture.length > 0) {
          storedFurniture = legacyFurniture.map((row) => ({ ...row, ownerId: userId }));
          await db.furniture.bulkPut(storedFurniture);
        }
      }
      const mappedFurniture = await Promise.all(storedFurniture.map(async (item) => {
        const modelBlob = item.modelBlob ? await normalizeModelBlob(item.modelBlob) : undefined;
        if (modelBlob && modelBlob !== item.modelBlob) void db.furniture.update(item.id, { modelBlob }).catch((error) => console.error('Could not save converted furniture model:', error));
        return { ...item, ...(modelBlob ? { modelBlob } : {}), modelUrl: restoreModelUrl(item.modelUrl, modelBlob) };
      }));

      let storedRules = await db.rules.where('ownerId').equals(userId).toArray();
      if (storedRules.length === 0) {
        const legacyRules = await db.rules.filter((row) => !row.ownerId).toArray();
        if (legacyRules.length > 0) {
          storedRules = legacyRules.map((row) => ({ ...row, ownerId: userId }));
        } else {
          storedRules = INITIAL_RULES.map((rule) => ({ ...rule, id: `${userId}-${rule.id}`, ownerId: userId }));
        }
        await db.rules.bulkPut(storedRules);
      }

      let storedMessages = await db.messages.where('ownerId').equals(userId).toArray();
      if (storedMessages.length === 0) {
        const legacyMessages = await db.messages.filter((row) => !row.ownerId).toArray();
        if (legacyMessages.length > 0) {
          storedMessages = legacyMessages.map((row) => ({ ...row, ownerId: userId }));
          await db.messages.bulkPut(storedMessages);
        } else if (mappedAgents[0]) {
          const welcome: ChatMessage = {
            id: `${userId}-welcome-${crypto.randomUUID()}`,
            ownerId: userId,
            sender: 'agent',
            agentId: mappedAgents[0].id,
            text: 'System standing by. Assign a task or send a directive.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          storedMessages = [welcome];
          await db.messages.put(welcome);
        }
      }

      const userStateKey = `app:${userId}`;
      let savedState = await db.appState.get(userStateKey);
      if (!savedState) {
        const globalState = await db.appState.get('app');
        const activeSession = globalState?.currentSessionId ? await db.sessions.get(globalState.currentSessionId) : undefined;
        if (activeSession?.userId === userId && globalState) {
          savedState = { ...globalState, key: userStateKey };
          await db.appState.put(savedState);
        }
      }

      const grouped: Record<string, ChatMessage[]> = {};
      storedMessages.forEach((message) => {
        if (!message.agentId) return;
        if (!grouped[message.agentId]) grouped[message.agentId] = [];
        grouped[message.agentId].push(message);
      });
      const savedWorld = await db.worldSettings.get(userId);
      if (cancelled) {
        mappedAgents.forEach((agent) => { if (agent.modelUrl.startsWith('blob:')) URL.revokeObjectURL(agent.modelUrl); });
        mappedFurniture.forEach((item) => { if (item.modelUrl.startsWith('blob:')) URL.revokeObjectURL(item.modelUrl); });
        return;
      }
      setAgents(mappedAgents);
      setFurniture(mappedFurniture);
      setSystemRules(storedRules);
      setChatLog(grouped);
      const savedAgentId = savedState?.selectedAgentId;
      setSelectedAgentId(savedAgentId === null ? null : savedAgentId === undefined || !mappedAgents.some((agent) => agent.id === savedAgentId) ? mappedAgents[0]?.id ?? null : savedAgentId);
      if (savedState?.selectedFurnitureId && storedFurniture.some((item) => item.id === savedState.selectedFurnitureId)) {
        setSelectedFurnitureId(savedState.selectedFurnitureId);
        setSelectedFurnitureIds(new Set([savedState.selectedFurnitureId]));
      }
      if (savedState?.activeTab) setActiveTab(savedState.activeTab);
      setWorldSettings(savedWorld || { userId, planeX: 0, planeZ: 0, renderDistance: 40, interiorOnly: false, showInteriorBox: false, interiorX: 0, interiorZ: 0, interiorWidth: 12, interiorDepth: 12, interiorHeight: 5 });
    };
    void loadWorkspace().catch((error) => console.error('Could not load user workspace:', error));
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const updateWorldSetting = (changes: Partial<WorldSettingsRecord>) => {
    if (!currentUser) return;
    const updated = { ...worldSettings, ...changes, userId: currentUser.id };
    setWorldSettings(updated);
    void db.worldSettings.put(updated).catch((error) => console.error('Could not save build settings:', error));
  };

  const handleLogout = async () => {
    const token = getAuthToken();
    if (token) void authRequest('/api/auth/logout', { method: 'POST' }, token).catch(() => undefined);
    setAuthToken(null);
    try {
      const savedState = await db.appState.get('app');
      if (savedState?.currentSessionId) {
        await db.sessions.update(savedState.currentSessionId, { status: 'TERMINATED', lastActive: 'Logged out' });
        setSessions((prev) => prev.map((session) => session.id === savedState.currentSessionId ? { ...session, status: 'TERMINATED', lastActive: 'Logged out' } : session));
      }
      await persistAppState({ currentSessionId: undefined });
    } catch (err) {
      console.error('Failed to save logout session:', err);
    }
    setCurrentUser(null);
    setShowAuthScreen(false);
    setIsAdminDashboardOpen(false);
  };

  const handleToggleSessionStatus = async (sessionId: string, currentStatus: 'ACTIVE' | 'TERMINATED') => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'TERMINATED' : 'ACTIVE';
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: nextStatus } : s)));
    try {
      await db.sessions.update(sessionId, { status: nextStatus });
    } catch (err) {
      console.error('Database session update error:', err);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (await confirm(`Are you sure you want to delete ${userEmail} and wipe all associated records?`, { title: 'Delete user', confirmLabel: 'Delete user', destructive: true })) {
      try {
        const token = getAuthToken();
        if (!token) throw new Error('Admin sign-in expired.');
        const serverUsers = await authRequest<AuthAccount[]>('/api/admin/users', {}, token);
        const serverUser = serverUsers.find((user) => user.id === userId || user.email.trim().toLowerCase() === userEmail.trim().toLowerCase());
        if (serverUser) await authRequest<void>(`/api/admin/users/${encodeURIComponent(serverUser.id)}`, { method: 'DELETE' }, token);

        await db.transaction('rw', [db.users, db.sessions, db.agents, db.furniture, db.messages, db.adminMessageArchive, db.rules, db.worldSettings, db.friendRequests, db.friendships, db.blocks, db.communityGroups, db.communityPosts, db.communityComments, db.playerMessages], async () => {
          await db.users.delete(userId);
          await db.sessions.where('userId').equals(userId).delete();
          await db.sessions.where('userEmail').equals(userEmail).delete();
          await db.agents.where('ownerId').equals(userId).delete();
          await db.furniture.where('ownerId').equals(userId).delete();
          await db.messages.where('ownerId').equals(userId).delete();
          await db.adminMessageArchive.where('ownerId').equals(userId).delete();
          await db.rules.where('ownerId').equals(userId).delete();
          await db.worldSettings.where('userId').equals(userId).delete();
          await db.friendRequests.where('fromUserId').equals(userId).delete();
          await db.friendRequests.where('toUserId').equals(userId).delete();
          await db.friendships.filter((friendship) => friendship.userA === userId || friendship.userB === userId).delete();
          await db.blocks.where('blockerId').equals(userId).delete();
          await db.blocks.where('blockedId').equals(userId).delete();
          await db.communityGroups.where('ownerId').equals(userId).delete();
          await db.communityPosts.where('ownerId').equals(userId).delete();
          await db.communityComments.where('ownerId').equals(userId).delete();
          await db.playerMessages.where('fromUserId').equals(userId).delete();
          await db.playerMessages.where('toUserId').equals(userId).delete();
        });
        setSessions((prev) => prev.filter((s) => s.userId !== userId && s.userEmail !== userEmail));
        if (currentUser?.id === userId || currentUser?.email.trim().toLowerCase() === userEmail.trim().toLowerCase()) await handleLogout();
      } catch (err) {
        console.error('Failed to wipe user records from database:', err);
        window.alert(err instanceof Error ? err.message : 'Could not delete this profile. Please try again.');
      }
    }
  };

  const handleChangeUserRole = async (userId: string, currentRole: 'USER' | 'ADMIN') => {
    const nextRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    try {
      const token = getAuthToken();
      if (!token) throw new Error('Admin sign-in expired.');
      const user = await db.users.get(userId);
      if (!user) throw new Error('User was not found in the local profile directory.');
      await authRequest(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ name: user.name, email: user.email, role: nextRole }) }, token);
      setSessions((prev) => prev.map((s) => (s.userId === userId ? { ...s, role: nextRole } : s)));
      await db.users.update(userId, { role: nextRole });
      await db.sessions.where('userId').equals(userId).modify({ role: nextRole });
    } catch (err) {
      console.error('Failed to update account role:', err);
    }
  };

  const handleBanIP = async (ip: string) => {
    if (!bannedIPs.includes(ip)) {
      setBannedIPs((prev) => [...prev, ip]);
      try {
        await db.bannedIPs.put({ ip, reason: 'Admin Ban', bannedAt: new Date().toISOString() });
      } catch (err) {
        console.error('Failed to store banned IP:', err);
      }
    }
  };

  const handleUnbanIP = async (ip: string) => {
    setBannedIPs((prev) => prev.filter((item) => item !== ip));
    try {
      await db.bannedIPs.delete(ip);
    } catch (err) {
      console.error('Failed to unban IP:', err);
    }
  };

  const handleClearRevokedSessions = async () => {
    setSessions((prev) => prev.filter((s) => s.status === 'ACTIVE'));
    try {
      await db.sessions.where('status').equals('TERMINATED').delete();
    } catch (err) {
      console.error('Failed to purge revoked sessions:', err);
    }
  };

  if (!currentUser && authChecking) {
    return <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#020617', color: '#7dd3fc' }}>Checking your session…</div>;
  }
  if (!currentUser && !showAuthScreen) {
    return <LandingPage onSignIn={() => setShowAuthScreen(true)} />;
  }
  if (!currentUser) {
    return <AuthModal onLogin={handleLogin} onBack={() => setShowAuthScreen(false)} googleAuthEnabled={googleAuthEnabled} />;
  }

  const currentAgentMessages = selectedAgent ? chatLog[selectedAgent.id] || [] : [];

  return (
    <div className="app-shell" onPointerDownCapture={handleOutsideFurniturePointerDown} style={{ width: '100vw', height: '100vh', display: 'flex', backgroundColor: '#020617', color: '#f8fafc', overflow: 'hidden' }}>
      
      {/* LEFT SIDEBAR PANEL */}
      <div className="app-sidebar" style={{ width: '340px', flexShrink: 0, borderRight: '1px solid rgba(56, 189, 248, 0.2)', backgroundColor: '#090d16', display: 'flex', flexDirection: 'column' }}>
        
        {/* BRAND HEADER */}
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/images/aetheria-logo.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span style={{ fontWeight: 800, fontSize: '14px', letterSpacing: '0.5px' }}>AETHERIA</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '9px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '4px 7px', borderRadius: '5px', border: '1px solid #0284c7' }}>
              PROD-OPERATIONS
            </span>
            <button className="mobile-profile-trigger" onClick={() => setIsProfileOpen(true)} aria-label="Open profile" title="Profile">
              {currentUser?.avatar ? <img src={currentUser.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} /> : <UserRound size={15} />}
            </button>
          </div>
        </div>

        <nav className="sidebar-mode-nav" aria-label="Workspace mode">
          <button type="button" className={activeTab !== 'DECOR' ? 'is-active' : ''} aria-pressed={activeTab !== 'DECOR'} onClick={() => { selectAgent(selectedAgentId || agents[0]?.id || null); changeActiveTab('DIRECT'); }}><Bot size={15} /><span>Agents</span><span className="sidebar-mode-count">{agents.length}</span></button>
          <button type="button" className={`decor-mode${activeTab === 'DECOR' ? ' is-active' : ''}`} aria-pressed={activeTab === 'DECOR'} onClick={openSceneDecor}><Box size={15} /><span>Decor</span><span className="sidebar-mode-count">{furniture.length}</span></button>
        </nav>

        {activeTab !== 'DECOR' && <>
        {/* ROSTER HEADER & SEARCH & ADD */}
        <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>Your agents <span style={{ marginLeft: 5, color: '#64748b', fontWeight: 500 }}>{agents.length}</span></span>
            <button
              onClick={() => setIsAddAgentOpen(true)}
              title="Add Custom Agent"
              style={{ background: '#0284c7', border: 'none', borderRadius: '4px', padding: '4px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus size={14} />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="#64748b" style={{ position: 'absolute', left: '8px', top: '8px' }} />
            <input
              type="text"
              placeholder="Search roster..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 6px 6px 28px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '11px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* AGENTS LIST */}
        <div className="agent-roster-list" style={{ padding: '8px', flex: '0 1 auto', maxHeight: '260px', minHeight: '54px', overflowY: 'auto', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {filteredAgents.map((agent) => (
            <div
              key={agent.id}
              className="roster-agent-card"
              onClick={() => {
                selectAgent(selectedAgentId === agent.id ? null : agent.id);
              }}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                background: selectedAgentId === agent.id && !selectedFurnitureId ? 'rgba(2, 132, 199, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                border: selectedAgentId === agent.id && !selectedFurnitureId ? '1px solid #0284c7' : '1px solid rgba(255,255,255,0.05)',
                marginBottom: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '13px', color: '#ffffff' }}>{agent.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', background: agent.status === 'OFFLINE' ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,0.1)', color: agent.status === 'OFFLINE' ? '#fca5a5' : '#94a3b8' }}>{agent.terminatedAt ? 'TERMINATED' : agent.status}</span>
                  <button type="button" onClick={(event) => { event.stopPropagation(); if (agent.status === 'OFFLINE') void reactivateAgent(agent.id); else void terminateAgent(agent.id); }} title={agent.status === 'OFFLINE' ? `Reactivate ${agent.name}` : `Terminate ${agent.name}`} aria-label={agent.status === 'OFFLINE' ? `Reactivate ${agent.name}` : `Terminate ${agent.name}`} style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 5, border: '1px solid rgba(148,163,184,.16)', background: agent.status === 'OFFLINE' ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.1)', color: agent.status === 'OFFLINE' ? '#6ee7b7' : '#fda4af', cursor: 'pointer' }}>{agent.status === 'OFFLINE' ? <RotateCw size={12} /> : <Power size={12} />}</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void deleteAgent(agent.id); }} title={`Delete ${agent.name}`} aria-label={`Delete ${agent.name}`} style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 5, border: '1px solid rgba(244,63,94,.28)', background: 'rgba(127,29,29,.15)', color: '#fda4af', cursor: 'pointer' }}><Trash2 size={12} /></button>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{agent.role}</div>
            </div>
          ))}
        </div>
        </>}

        {/* AGENT WORKSPACE */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {hasSelectedAgent && activeTab !== 'DECOR' && (
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#0b1120' }}>
            <button
              onClick={() => changeActiveTab('DIRECT')}
              style={{
                flex: 1,
                padding: '10px 4px',
                background: activeTab === 'DIRECT' ? 'transparent' : 'rgba(15, 23, 42, 0.6)',
                border: 'none',
                borderBottom: activeTab === 'DIRECT' ? '2px solid #0284c7' : '2px solid transparent',
                color: activeTab === 'DIRECT' ? '#ffffff' : '#64748b',
                fontSize: '10px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Chat
            </button>
            <button
              onClick={() => changeActiveTab('RULES')}
              style={{
                flex: 1,
                padding: '10px 4px',
                background: activeTab === 'RULES' ? 'transparent' : 'rgba(15, 23, 42, 0.6)',
                border: 'none',
                borderBottom: activeTab === 'RULES' ? '2px solid #0284c7' : '2px solid transparent',
                color: activeTab === 'RULES' ? '#ffffff' : '#64748b',
                fontSize: '10px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Setup
            </button>
          </div>
          )}

          {!hasSelectedAgent && activeTab !== 'DECOR' && (
            <div style={{ margin: '18px 12px', padding: '16px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', background: 'rgba(15,23,42,0.45)' }}>
              <div style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 800, marginBottom: '5px' }}>No agent selected</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>Choose an agent above to chat or edit its setup.</div>
            </div>
          )}

          {hasSelectedAgent && activeTab === 'DIRECT' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Chat with {selectedAgent.name}</span>
                  <span style={{ color: '#64748b', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Model: {selectedAgent.modelName}</span>
                </div>
                
            </div>

              <div style={{ flex: 1, padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {!currentAgentMessages.some((message) => !message.deletedAt) && <div className="agent-chat-empty"><span><MessagesSquare size={23} /></span><h3>Start a conversation</h3><p>Give {selectedAgent.name} a task or ask a question to get started.</p></div>}
                {currentAgentMessages.filter((msg) => !msg.deletedAt).map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      padding: '8px 10px',
                      borderRadius: msg.sender === 'user' ? '8px 8px 0px 8px' : '8px 8px 8px 0px',
                      backgroundColor: msg.sender === 'user' ? '#0284c7' : 'rgba(30, 41, 59, 0.8)',
                      border: msg.sender === 'user' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                      color: 'white',
                      fontSize: '11px'
                    }}
                  >
                    <div style={{ fontSize: '9px', opacity: 0.7, marginBottom: '2px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <span>{msg.sender === 'user' ? 'OPERATOR' : selectedAgent.name}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{msg.timestamp}<button type="button" title="Delete message" onClick={() => void deleteChatMessage(msg)} style={{ border: 0, background: 'transparent', color: '#fda4af', cursor: 'pointer', padding: 0 }}><Trash2 size={11} /></button></span>
                    </div>
                    {msg.text && <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>}
                    {msg.attachmentBlob && <MessageAttachment blob={msg.attachmentBlob} type={msg.attachmentType || ''} name={msg.attachmentName || 'Attachment'} />}
                    <MessageLinkPreview text={msg.text} />
                  </div>
                ))}
                {isTyping && (
                  <div style={{ alignSelf: 'flex-start', fontSize: '10px', color: '#38bdf8', fontStyle: 'italic', padding: '4px' }}>
                    {selectedAgent.name} is processing instruction...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {selectedAgent.status === 'OFFLINE' && <div style={{ padding: '7px 10px', borderTop: '1px solid rgba(239,68,68,.15)', background: 'rgba(127,29,29,.08)', color: '#fca5a5', fontSize: 10 }}>Agent terminated · Reactivate it from the roster to send directives.</div>}
              <form onSubmit={handleSendMessage} style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <input ref={messageFileRef} type="file" accept="image/*,video/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) { setMessageError('Choose a photo or video.'); return; } if (file.size > 25 * 1024 * 1024) { setMessageError('Files must be 25 MB or smaller.'); return; } setMessageError(''); setMessageAttachment(file); }} />
                {messageAttachment && <div style={{ flexBasis: '100%', color: '#7dd3fc', fontSize: 10 }}>{messageAttachment.name} · {(messageAttachment.size / 1024 / 1024).toFixed(1)} MB <button type="button" onClick={() => setMessageAttachment(null)} style={{ border: 0, background: 'transparent', color: '#fda4af', cursor: 'pointer' }}>Remove</button></div>}
                {messageError && <div role="alert" style={{ flexBasis: '100%', color: '#fda4af', fontSize: 10 }}>{messageError}</div>}
                <button type="button" disabled={selectedAgent.status === 'OFFLINE'} title="Import a project folder and let this agent edit its files" aria-label="Open project workspace" onClick={() => setIsProjectWorkspaceOpen(true)} style={{ padding: '8px', background: 'rgba(30,41,59,.8)', border: '1px solid rgba(56,189,248,.28)', borderRadius: 6, color: '#7dd3fc', cursor: selectedAgent.status === 'OFFLINE' ? 'not-allowed' : 'pointer', opacity: selectedAgent.status === 'OFFLINE' ? .5 : 1 }}><FolderOpen size={14} /></button>
                <button type="button" disabled={selectedAgent.status === 'OFFLINE'} title="Attach a photo or video (up to 25 MB)" onClick={() => messageFileRef.current?.click()} style={{ padding: '8px', background: 'rgba(30,41,59,.8)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, color: '#94a3b8', cursor: selectedAgent.status === 'OFFLINE' ? 'not-allowed' : 'pointer', opacity: selectedAgent.status === 'OFFLINE' ? .5 : 1 }}><Paperclip size={14} /></button>
                <input
                  type="text"
                  placeholder={`Instruct ${selectedAgent.name}...`}
                  value={inputCommand}
                  onChange={(e) => setInputCommand(e.target.value)}
                  disabled={selectedAgent.status === 'OFFLINE'}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '11px',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="submit"
                  disabled={selectedAgent.status === 'OFFLINE' || isTyping || (!inputCommand.trim() && !messageAttachment)}
                  style={{ padding: '8px 12px', background: '#0284c7', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 700, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Send size={12} />
                </button>
              </form>
            </div>
          )}

          {activeTab === 'DECOR' && (
            <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>Scene decor</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Manage objects placed in the office.</div>
                </div>
                <button
                  onClick={() => setIsAddFurnitureOpen(true)}
                  style={{ background: '#b45309', border: '1px solid rgba(251,191,36,0.45)', borderRadius: '6px', padding: '7px 9px', color: 'white', fontSize: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                >
                  <Plus size={12} /> Add Decor
                </button>
              </div>

              {selectedFurniture && (
                <div style={{ padding: '10px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #d97706', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#f59e0b' }}>{selectedFurnitureIds.size > 1 ? `${selectedFurnitureIds.size} decor items selected` : selectedFurniture.label}</div>
                      <div style={{ fontSize: '9px', color: '#cbd5e1', marginTop: '3px' }}>{selectedFurnitureIds.size > 1 ? 'Drag any selected item to move the group · Ctrl+R rotates 15°' : `${describeDecor(selectedFurniture)} · Ctrl+R rotates 15°`}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteFurniture(selectedFurniture.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MoveVertical size={12} color="#f59e0b" />
                    <span style={{ fontSize: '10px', color: '#cbd5e1' }}>Scale: {selectedFurniture.scale}x</span>
                    <input
                      type="range"
                      min="0.01"
                      max="10"
                      step="0.01"
                      value={selectedFurniture.scale}
                      onChange={(e) => handleUpdateFurnitureScale(selectedFurniture.id, parseFloat(e.target.value))}
                      style={{ flex: 1, cursor: 'pointer' }}
                    />
                    <input type="number" min="0.01" max="10" step="0.01" aria-label={`Enter scale for ${selectedFurniture.label}`}
                      key={`${selectedFurniture.id}-scale-${selectedFurniture.scale}`} defaultValue={selectedFurniture.scale}
                      onBlur={(e) => handleUpdateFurnitureScale(selectedFurniture.id, Math.min(10, Math.max(0.01, Number(e.target.value))))}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      style={{ width: 58, flexShrink: 0, boxSizing: 'border-box', padding: '3px 4px', borderRadius: 4, border: '1px solid rgba(245,158,11,.35)', background: '#0f172a', color: '#f8fafc', fontSize: 10 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MoveVertical size={12} color="#f59e0b" />
                    <span style={{ fontSize: '10px', color: '#cbd5e1', minWidth: '68px' }}>Height Y: {selectedFurniture.position[1].toFixed(2)}</span>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      step="0.05"
                      aria-label={`Furniture height for ${selectedFurniture.label}`}
                      value={selectedFurniture.position[1]}
                      onChange={(e) => adjustFurnitureHeight(selectedFurniture.id, Number(e.target.value) - selectedFurniture.position[1])}
                      style={{ flex: 1, cursor: 'pointer' }}
                    />
                    <input type="number" min="-50" max="50" step="0.05" aria-label={`Enter Y height for ${selectedFurniture.label}`}
                      key={`${selectedFurniture.id}-height-${selectedFurniture.position[1]}`} defaultValue={selectedFurniture.position[1]}
                      onBlur={(e) => adjustFurnitureHeight(selectedFurniture.id, Math.min(50, Math.max(-50, Number(e.target.value))) - selectedFurniture.position[1])}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      style={{ width: 58, flexShrink: 0, boxSizing: 'border-box', padding: '3px 4px', borderRadius: 4, border: '1px solid rgba(245,158,11,.35)', background: '#0f172a', color: '#f8fafc', fontSize: 10 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RotateCw size={12} color="#f59e0b" />
                    <span style={{ fontSize: '10px', color: '#cbd5e1', minWidth: '68px' }}>
                      Yaw: {rotationDegrees(selectedFurniture.rotationY || 0)}°
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="1"
                      aria-label={`Rotate ${selectedFurniture.label}`}
                      value={rotationDegrees(selectedFurniture.rotationY || 0)}
                      onChange={(e) => handleRotateFurniture(selectedFurniture.id, 'rotationY', Number(e.target.value))}
                      style={{ flex: 1, cursor: 'pointer' }}
                    />
                    <input type="number" min="0" max="360" step="1" aria-label={`Enter yaw for ${selectedFurniture.label}`}
                      key={`${selectedFurniture.id}-yaw-${rotationDegrees(selectedFurniture.rotationY || 0)}`} defaultValue={rotationDegrees(selectedFurniture.rotationY || 0)}
                      onBlur={(e) => handleRotateFurniture(selectedFurniture.id, 'rotationY', Math.min(360, Math.max(0, Number(e.target.value))))}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      style={{ width: 58, flexShrink: 0, boxSizing: 'border-box', padding: '3px 4px', borderRadius: 4, border: '1px solid rgba(245,158,11,.35)', background: '#0f172a', color: '#f8fafc', fontSize: 10 }} />
                  </div>
                  {(['rotationX', 'rotationZ'] as const).map((axis) => {
                    const degrees = rotationDegrees(selectedFurniture[axis] || 0);
                    return <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RotateCw size={12} color="#f59e0b" />
                      <span style={{ fontSize: '10px', color: '#cbd5e1', minWidth: '68px' }}>{axis === 'rotationX' ? 'Tilt X' : 'Tilt Z'}: {degrees}°</span>
                      <input type="range" min="0" max="360" step="1" aria-label={`${axis} tilt for ${selectedFurniture.label}`} value={degrees}
                        onChange={(e) => handleRotateFurniture(selectedFurniture.id, axis, Number(e.target.value))}
                        style={{ flex: 1, cursor: 'pointer' }} />
                      <input type="number" min="0" max="360" step="1" aria-label={`Enter ${axis === 'rotationX' ? 'tilt X' : 'tilt Z'} for ${selectedFurniture.label}`}
                        key={`${selectedFurniture.id}-${axis}-${degrees}`} defaultValue={degrees}
                        onBlur={(e) => handleRotateFurniture(selectedFurniture.id, axis, Math.min(360, Math.max(0, Number(e.target.value))))}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        style={{ width: 58, flexShrink: 0, boxSizing: 'border-box', padding: '3px 4px', borderRadius: 4, border: '1px solid rgba(245,158,11,.35)', background: '#0f172a', color: '#f8fafc', fontSize: 10 }} />
                    </div>;
                  })}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '9px', color: '#94a3b8', lineHeight: 1.5 }}>Ctrl-click select · drag to move<br />Ctrl+C copy · Ctrl+V paste · Ctrl+R rotate</span>
                <select aria-label="Sort decor" value={decorSort} onChange={(e) => setDecorSort(e.target.value as typeof decorSort)}
                  style={{ background: '#0f172a', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '5px', padding: '5px', fontSize: '10px' }}>
                  <option value="name">Name A–Z</option><option value="category">Category</option><option value="recent">Recently added</option>
                </select>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
                {furniture.length === 0 ? (
                  <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                    No furniture added yet. Click "Add Decor" above to import 3D objects!
                  </div>
                ) : (
                  furnitureFolders.map(([folderName, folderItems]) => <React.Fragment key={folderName}>
                    {folderName !== 'Unfiled' && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, padding: '5px 7px', borderRadius: 6, border: '1px solid rgba(148,163,184,.12)', background: 'rgba(15,23,42,.48)' }}>
                      <button onClick={() => setCollapsedDecorFolders((current) => { const next = new Set(current); next.has(folderName) ? next.delete(folderName) : next.add(folderName); return next; })} aria-expanded={!collapsedDecorFolders.has(folderName)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, border: 0, background: 'transparent', color: '#cbd5e1', textAlign: 'left', cursor: 'pointer' }}>
                        {collapsedDecorFolders.has(folderName) ? <Folder size={14} color="#f59e0b" /> : <FolderOpen size={14} color="#f59e0b" />}<span style={{ flex: 1, overflow: 'hidden', fontSize: 10, fontWeight: 750, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folderName}</span><span style={{ color: '#64748b', fontSize: 9 }}>{folderItems.length}</span>
                      </button>
                      <button onClick={() => selectFurnitureFolder(folderItems)} title={`Select all ${folderItems.length} items in ${folderName}`} style={{ padding: '4px 6px', borderRadius: 5, border: '1px solid rgba(245,158,11,.22)', background: 'rgba(180,83,9,.12)', color: '#fbbf24', fontSize: 8, fontWeight: 750, whiteSpace: 'nowrap', cursor: 'pointer' }}>Select set</button>
                    </div>}
                    {(folderName === 'Unfiled' || !collapsedDecorFolders.has(folderName)) && folderItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={(event) => toggleFurnitureSelection(item.id, event.ctrlKey || event.metaKey)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        background: selectedFurnitureIds.has(item.id) ? 'rgba(245, 158, 11, 0.2)' : 'rgba(15, 23, 42, 0.8)',
                        border: selectedFurnitureIds.has(item.id) ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Box size={14} color="#f59e0b" />
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'white' }}>{item.label}</div>
                          <div style={{ fontSize: '9px', color: '#94a3b8' }}>{describeDecor(item)}</div>
                        </div>
                      </div>
                    </div>
                    ))}
                  </React.Fragment>)
                )}
              </div>
            </div>
          )}

          {hasSelectedAgent && activeTab === 'RULES' && (
            <div className="agent-setup-panel">
              <section className="agent-setup-card" aria-label={`${selectedAgent.name} profile`}>
                <header className="agent-setup-heading">
                  <span className="agent-setup-avatar"><Bot size={19} /></span>
                  <div><span className="agent-setup-eyebrow">AGENT PROFILE</span><h3>{selectedAgent.name}</h3></div>
                  <span className="agent-setup-autosave">Auto-save on</span>
                </header>
                <div className="agent-appearance-control">
                  <button type="button" className="agent-open-model-editor" onClick={() => setEditingModelAgentId(selectedAgent.id)}><Eye size={15} /> View & edit 3D model</button>
                  <label htmlFor="agent-model-size">3D model size <span>{selectedAgent.scale || 1}×</span></label>
                  <div><input id="agent-model-size" type="range" min="0.01" max="10" step="0.01" value={selectedAgent.scale || 1} onChange={(e) => handleUpdateAgentScale(selectedAgent.id, Number(e.target.value))} />
                    <input type="number" aria-label="Enter agent model size" min="0.01" max="10" step="0.01" key={`${selectedAgent.id}-${selectedAgent.scale}`} defaultValue={selectedAgent.scale || 1} onBlur={(e) => { const value = e.currentTarget.valueAsNumber; if (Number.isFinite(value)) void handleUpdateAgentScale(selectedAgent.id, Math.max(0.01, Math.min(10, value))); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></div>
                </div>
                <label className="agent-setup-field"><span>Role & title</span>
                  <input placeholder="e.g. Head of Design" value={selectedAgent.role} onChange={(e) => void handleUpdateAgent(selectedAgent.id, { role: e.target.value })} />
                </label>
                <label className="agent-setup-field"><span>Task instructions</span><small>What should this agent focus on?</small>
                  <AutoGrowTextarea placeholder="Describe responsibilities, goals, and how to approach tasks…" value={selectedAgent.instructions} onChange={(e) => void handleUpdateAgent(selectedAgent.id, { instructions: e.target.value })} />
                </label>
                <label className="agent-setup-field"><span>Character & voice</span><small>Just enter a character name. Add the game title to clarify which version. The AI uses its knowledge to shape replies and live thoughts; extra traits are optional.</small>
                  <AutoGrowTextarea placeholder="e.g. GLaDOS — Portal, or Shadow — Sonic the Hedgehog" value={selectedAgent.statusText} onChange={(e) => void handleUpdateAgent(selectedAgent.id, { statusText: e.target.value })} />
                </label>
              </section>
              <section className="agent-rules-section" aria-label="Workspace rules">
                <label className="agent-live-thoughts"><input type="checkbox" checked={!!selectedAgent.liveThoughts} onChange={(e) => void handleUpdateAgent(selectedAgent.id, { liveThoughts: e.target.checked })} /><span><strong>Character thought bubbles</strong><small>Generate 10 thoughts with the assigned model and save them to your list. Kept thoughts cycle in random order without more API calls. Generation sends character description and activity, without chat history.</small></span></label>
                <div className="agent-thought-status">
                  <p role="status" aria-live="polite">{selectedAgent.status === 'OFFLINE' ? 'Reactivate this agent to generate thoughts.' : thoughtLibrary.statuses[selectedAgent.id] || (selectedAgent.savedThoughts?.length ? (selectedAgent.liveThoughts ? 'Playing your saved thoughts in random order.' : 'Thought bubbles are paused. Your saved list is kept.') : 'Generate your first batch, then keep the thoughts you like.')}</p>
                  <button type="button" disabled={selectedAgent.status === 'OFFLINE' || thoughtLibrary.generating[selectedAgent.id]} onClick={() => void thoughtLibrary.generate(selectedAgent)}>{thoughtLibrary.generating[selectedAgent.id] ? 'Generating 10…' : 'Generate 10 thoughts'}</button>
                </div>
                <SavedThoughtList thoughts={selectedAgent.savedThoughts || []} onRemove={(text) => void thoughtLibrary.remove(selectedAgent.id, text)} />
                <header className="agent-rules-heading"><div><h3>Workspace rules</h3><p>Shared guidelines for your agents.</p></div><span>{systemRules.filter((rule) => rule.active).length} on</span></header>
                <div className="agent-rules-list">
                  {systemRules.map((rule) => (
                    <button key={rule.id} type="button" role="switch" aria-checked={rule.active} onClick={() => toggleRule(rule.id)} className={`agent-rule-row${rule.active ? ' is-active' : ''}`}>
                      <span>{rule.text}</span><span className="agent-rule-switch" aria-hidden="true"><span /></span>
                    </button>
                  ))}
                </div>
                <form onSubmit={handleAddRule} className="agent-rule-add">
                  <input aria-label="New workspace rule" type="text" placeholder="Write a new rule…" value={newRuleInput} onChange={(e) => setNewRuleInput(e.target.value)} />
                  <button type="submit" disabled={!newRuleInput.trim()} aria-label="Add workspace rule"><Plus size={16} /></button>
                </form>
              </section>
            </div>
          )}
        </div>
      </div>

      {/* CENTER VIEWPORT */}
      <div ref={viewportRef} className="app-center" style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', backgroundColor: '#020617' }}>
        <div className="viewport-toolbar" style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', zIndex: 10, pointerEvents: 'none' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Your infinite plane</h2>
            <span style={{ fontSize: '10px', color: '#38bdf8' }}>
              {agents.length} AGENT UNITS • {furniture.length} DECOR ITEMS {isFullscreen && ' • WASD MOVE · SPACE RISE · SHIFT LOWER · ALT UI · E EDIT · F5 FULLSCREEN'} {editMode && ' • DRAG OBJECTS · DRAG EMPTY SPACE TO ORBIT'}
            </span>
          </div>
          <div className="viewport-actions" style={{ display: 'flex', gap: '8px', pointerEvents: 'auto' }}>
            <button onClick={() => setEditMode((value) => !value)} aria-pressed={editMode} title={editMode ? 'Edit mode is enabled (E)' : 'Enable edit mode (E)'} style={{ fontSize: '10px', color: editMode ? '#fcd34d' : '#cbd5e1', background: editMode ? 'rgba(245,158,11,.16)' : 'rgba(30,41,59,0.8)', padding: '5px 8px', borderRadius: '5px', border: `1px solid ${editMode ? 'rgba(245,158,11,.6)' : 'rgba(255,255,255,0.15)'}`, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <Pencil size={12} /> {editMode ? 'EDIT ON' : 'EDIT OFF'} <kbd className="viewport-key-hint">E</kbd>
            </button>
            <button onClick={() => setIsWorldSettingsOpen(true)} title="Build area and rendering" style={{ fontSize: '10px', color: '#cbd5e1', background: 'rgba(30,41,59,0.8)', padding: '5px 8px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}><Settings2 size={12} /> WORLD</button>
            {!povAgentId && <button onClick={resetWorldView} title="Return the camera to the spawn view" style={{ fontSize: '10px', color: '#cbd5e1', background: 'rgba(30,41,59,0.8)', padding: '5px 8px', borderRadius: '5px', border: '1px solid rgba(56,189,248,.38)', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}><MapPin size={12} /> BACK TO SPAWN</button>}
            {(hasSelectedAgent || povAgentId) && (
              <button onClick={toggleAgentPov} title={povAgentId ? 'Exit character POV (P)' : 'Enter character POV (P)'} style={{ fontSize: '10px', color: povAgentId ? '#7dd3fc' : '#cbd5e1', background: povAgentId ? 'rgba(14,165,233,0.18)' : 'rgba(30,41,59,0.8)', padding: '5px 8px', borderRadius: '5px', border: `1px solid ${povAgentId ? '#38bdf8' : 'rgba(255,255,255,0.15)'}`, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <Eye size={12} /> {povAgentId ? 'EXIT POV' : 'ENTER POV'} <kbd className="viewport-key-hint">P</kbd>
              </button>
            )}
            <button
              onClick={toggleFullscreen}
              style={{
                fontSize: '10px',
                color: '#f8fafc',
                background: 'rgba(30, 41, 59, 0.8)',
                padding: '5px 8px',
                borderRadius: '5px',
                border: '1px solid rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
            >
              {isFullscreen ? <Minimize size={12} /> : <Maximize size={12} />}
              {isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'} <kbd className="viewport-key-hint">F5</kbd>
            </button>
            <span style={{ fontSize: '10px', color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '4px', border: '1px solid #10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={12} /> SYSTEM ONLINE
            </span>
            <button onClick={() => setIsDonationOpen(true)} title="Help support Aetheria" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(167,139,250,.4)', background: 'rgba(139,92,246,.14)', color: '#c4b5fd', fontSize: 11, fontWeight: 750, cursor: 'pointer', whiteSpace: 'nowrap' }}><Heart size={13} /> Help me</button>
            <button onClick={() => setIsPlayerChatOpen(true)} title="Open player messages" aria-label="Open player messages" className="player-chat-launch"><MessagesSquare size={14} /><span>CHAT</span></button>
            <div ref={accountMenuRef} className="account-menu-wrap">
              <button onClick={() => setIsAccountMenuOpen((open) => !open)} aria-expanded={isAccountMenuOpen} aria-haspopup="menu" aria-label="Open account menu" title="Account menu" className="account-avatar-button">
                {currentUser?.avatar ? <img src={currentUser.avatar} alt="" /> : <UserRound size={20} color="#38bdf8" />}
                <ChevronDown size={11} />
              </button>
              {isAccountMenuOpen && <div className="account-dropdown" role="menu">
                <div className="account-dropdown-label">Signed in as <strong>{currentUser?.name}</strong></div>
                <button role="menuitem" onClick={() => { setIsAccountMenuOpen(false); setIsProfileOpen(true); }}><UserRound size={15} /> Profile</button>
                <button role="menuitem" className="account-signout" onClick={() => { setIsAccountMenuOpen(false); void handleLogout(); }}><LogOut size={15} /> Sign out</button>
              </div>}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
          <Canvas
            camera={WORLD_CAMERA}
            dpr={[1, 1.5]}
            gl={{ powerPreference: 'high-performance', antialias: true }}
            onPointerMissed={() => {
              if (povAgentId) {
                const canvas = viewportRef.current?.querySelector('canvas');
                if (canvas && document.pointerLockElement !== canvas) void canvas.requestPointerLock().catch((err) => console.warn('Pointer lock was not available:', err));
              }
              else selectAgent(null);
            }}
          >

            <ambientLight intensity={0.6} />
            <directionalLight position={[10, 15, 10]} intensity={1.2} />
            <InfiniteGround originX={worldSettings.planeX} originZ={worldSettings.planeZ} onSelect={() => { if (!povAgentId) selectAgent(null); }} />
            {worldSettings.showInteriorBox && <mesh position={[worldSettings.interiorX, worldSettings.interiorHeight / 2, worldSettings.interiorZ]}>
              <boxGeometry args={[worldSettings.interiorWidth, worldSettings.interiorHeight, worldSettings.interiorDepth]} />
              <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.45} />
            </mesh>}

            {/* Render Agents */}
            {agents.filter((agent) => {
              if (agent.status === 'OFFLINE') return false;
              const p = agent.startPos;
              const visibleByBox = !worldSettings.interiorOnly || (Math.abs(p.x - worldSettings.interiorX) <= worldSettings.interiorWidth / 2 && Math.abs(p.z - worldSettings.interiorZ) <= worldSettings.interiorDepth / 2);
              return agent.id === povAgentId || visibleByBox;
            }).map((agent) => (
              <WorldRenderRange key={agent.id} x={agent.startPos.x} z={agent.startPos.z} distance={worldSettings.renderDistance} alwaysVisible={agent.id === povAgentId}>
              <Agent3D
                key={agent.id}
                agent={agent}
                isSelected={selectedAgentId === agent.id && !selectedFurnitureId}
                obstacles={decorObstacles}
                isPovControlled={povAgentId === agent.id}
                editMode={editMode}
                onDragChange={setIsSceneObjectDragging}
                onSelect={() => {
                  selectAgent(agent.id);
                }}
                onPositionChange={(position) => { void handleAgentPositionChange(agent.id, position); }}
              />
              </WorldRenderRange>
            ))}

            {/* Render Furniture & Decor Items */}
            {furniture.filter((item) => {
              const visibleByBox = !worldSettings.interiorOnly || (Math.abs(item.position[0] - worldSettings.interiorX) <= worldSettings.interiorWidth / 2 && Math.abs(item.position[2] - worldSettings.interiorZ) <= worldSettings.interiorDepth / 2);
              return visibleByBox;
            }).map((item) => (
              <WorldRenderRange key={item.id} x={item.position[0]} z={item.position[2]} distance={worldSettings.renderDistance}>
              <Furniture3D
                key={item.id}
                item={item}
                isSelected={selectedFurnitureIds.has(item.id)}
                onSelect={(additive) => toggleFurnitureSelection(item.id, additive)}
                onMove={moveSelectedFurniture}
                onHeight={adjustFurnitureHeight}
                editMode={editMode}
                onDragChange={setIsSceneObjectDragging}
              />
              </WorldRenderRange>
            ))}

            <OrbitControls ref={controlsRef} enabled={!povAgentId && !isSceneObjectDragging && !isAltUiMode} maxPolarAngle={Math.PI / 2.1} minDistance={4} maxDistance={400} />
            <KeyboardControls controlsRef={controlsRef} enabled={!povAgentId && !isSceneObjectDragging} />
          </Canvas>
          {isSceneObjectDragging && !povAgentId && <div role="status" style={{ position: 'absolute', left: '50%', top: 72, transform: 'translateX(-50%)', zIndex: 5, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(56,189,248,.3)', background: 'rgba(2,6,23,.9)', color: '#dbeafe', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none' }}>Hold <b>Space</b> to raise · Hold <b>Shift</b> to lower</div>}
          {currentUser?.showUidOnPlane !== false && currentUser && <div style={{ position: 'absolute', right: 16, bottom: isFullscreen ? 18 : 12, zIndex: 4, padding: '6px 9px', borderRadius: 8, border: '1px solid rgba(56,189,248,.22)', background: 'rgba(2,6,23,.62)', color: '#7dd3fc', font: '700 10px ui-monospace,monospace', pointerEvents: 'none', backdropFilter: 'blur(6px)' }}>{currentUser.uid || currentUser.id.toUpperCase()}</div>}
          {povAgentId && <>
            <div className="pov-reticle" aria-hidden="true"><span className="reticle-top"/><span className="reticle-right"/><span className="reticle-bottom"/><span className="reticle-left"/><i/></div>
            <div className="pov-touch-look"
              onPointerDown={(event) => { event.preventDefault(); povTouchLookRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={(event) => {
                const pointer = povTouchLookRef.current;
                if (!pointer || pointer.pointerId !== event.pointerId) return;
                const movementX = event.clientX - pointer.x;
                const movementY = event.clientY - pointer.y;
                pointer.x = event.clientX;
                pointer.y = event.clientY;
                document.dispatchEvent(new CustomEvent('aetheria:povlook', { detail: { movementX, movementY } }));
              }}
              onPointerUp={(event) => { if (povTouchLookRef.current?.pointerId === event.pointerId) povTouchLookRef.current = null; }}
              onPointerCancel={() => { povTouchLookRef.current = null; }}
            />
            <div className="pov-touch-controls" aria-label="POV movement controls">
              <div className="pov-dpad">
                {[{ key: 'w', Icon: ArrowUp, pos: 'up' }, { key: 'a', Icon: ArrowLeft, pos: 'left' }, { key: 's', Icon: ArrowDown, pos: 'down' }, { key: 'd', Icon: ArrowRight, pos: 'right' }].map(({ key, Icon, pos }) => <button key={key} className={`pov-key pov-key-${pos}`} aria-label={`Move ${key}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); sendPovKey(key, true); }} onPointerUp={(event) => { event.stopPropagation(); sendPovKey(key, false); }} onPointerCancel={() => sendPovKey(key, false)} onPointerLeave={() => sendPovKey(key, false)}><Icon size={19} /></button>)}
              </div>
              <button className="pov-jump" aria-label="Jump" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); sendPovKey('space', true); }} onPointerUp={(event) => { event.stopPropagation(); sendPovKey('space', false); }} onPointerCancel={() => sendPovKey('space', false)}><ArrowUp size={19} /><span>JUMP</span></button>
            </div>
            <div className="pov-controls" style={{ position: 'absolute', left: '50%', bottom: '18px', transform: 'translateX(-50%)', padding: '7px 9px', borderRadius: '999px', border: '1px solid rgba(56,189,248,0.24)', background: 'rgba(2,6,23,0.88)', color: '#cbd5e1', fontSize: '11px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 10, backdropFilter: 'blur(8px)', zIndex: 4 }}><span className="pov-desktop-hint">W A S D move · SPACE jump · Mouse to look · ESC unlock</span><span className="pov-mobile-hint">Drag to look</span><button onClick={() => setIsAddFurnitureOpen(true)} style={{ border: 0, borderRadius: 20, padding: '6px 10px', background: '#0284c7', color: 'white', fontWeight: 700, cursor: 'pointer' }}>＋ Add decor</button></div>
          </>}
        </div>

        {!isFullscreen && (
          <div className="scene-metrics" style={{ height: '64px', borderTop: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(15, 23, 42, 0.95)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', padding: '8px 16px' }}>
            <div className="metric-success">
              <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 700 }}>TASK SUCCESS</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#38bdf8' }}>100%</div>
            </div>
            <div className="metric-latency">
              <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 700 }}>MEDIAN LATENCY</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#34d399' }}>0 ms</div>
            </div>
            <div className="metric-budget">
              <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 700 }}>TOKEN BUDGET</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#f59e0b' }}>100%</div>
            </div>
          </div>
        )}
      </div>

      {isWorldSettingsOpen && createPortal(<div onMouseDown={(event) => { if (event.target === event.currentTarget) setIsWorldSettingsOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(2,6,23,.72)', display: 'grid', placeItems: 'center', padding: 16 }}>
        <section className="scene-settings-panel" style={{ width: 'min(460px, 100%)', maxHeight: '90dvh', overflowY: 'auto', border: '1px solid rgba(56,189,248,.25)', borderRadius: 14, background: '#0b1220', color: '#e2e8f0', padding: 20, boxShadow: '0 24px 70px #0009' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><div><h2 style={{ margin: 0, fontSize: 18 }}>World & build area</h2><p style={{ margin: '5px 0 0', color: '#94a3b8', fontSize: 12 }}>Set the plane origin and choose what stays visible.</p></div><button onClick={() => setIsWorldSettingsOpen(false)} aria-label="Close" style={{ border: 0, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}><X size={18}/></button></header>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([['Plane X', 'planeX'], ['Plane Z', 'planeZ'], ['Render distance', 'renderDistance']] as const).map(([label, key]) => <label key={key} style={{ color: '#94a3b8', fontSize: 12 }}>{label}<input type="number" min={key === 'renderDistance' ? 5 : undefined} max={key === 'renderDistance' ? 200 : undefined} value={worldSettings[key]} onChange={(e) => updateWorldSetting({ [key]: Number(e.target.value) })} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 9, border: '1px solid #263449', borderRadius: 7, background: '#111b2b', color: 'white' }}/></label>)}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, fontSize: 13 }}><input type="checkbox" checked={worldSettings.interiorOnly} onChange={(e) => updateWorldSetting({ interiorOnly: e.target.checked })}/> Limit scene to the interior box</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13 }}><input type="checkbox" checked={worldSettings.showInteriorBox} onChange={(e) => updateWorldSetting({ showInteriorBox: e.target.checked })}/> Show editable interior boundary</label>
          <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: '#101a2b', border: '1px solid #223149' }}><div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}>Interior boundary · center X/Z and dimensions</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>{([['Center X', 'interiorX'], ['Center Z', 'interiorZ'], ['Width', 'interiorWidth'], ['Depth', 'interiorDepth'], ['Height', 'interiorHeight']] as const).map(([label, key]) => <label key={key} style={{ color: '#94a3b8', fontSize: 11 }}>{label}<input type="number" min={key.endsWith('idth') || key.endsWith('epth') || key.endsWith('eight') ? 1 : undefined} value={worldSettings[key]} onChange={(e) => updateWorldSetting({ [key]: Number(e.target.value) })} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 5, padding: 8, border: '1px solid #263449', borderRadius: 6, background: '#0b1220', color: 'white' }}/></label>)}</div></div>
          <p style={{ margin: '14px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>The boundary currently filters objects by their center point; it does not yet clip walls or provide multiplayer streaming.</p>
        </section>
      </div>, isFullscreen && viewportRef.current ? viewportRef.current : document.body)}
      {isProfileOpen && currentUser && createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 80, overflowY: 'auto', background: 'transparent' }}><UserProfilePanel user={currentUser} modelCards={agents.map((agent) => ({ id: agent.id, title: agent.name, subtitle: `${agent.role} · ${agent.modelName}` }))} decorCards={furniture.map((item) => ({ id: item.id, title: item.label, subtitle: `${item.category} · Scale ${item.scale}×` }))} onLogout={() => { setIsProfileOpen(false); void handleLogout(); }} onClose={() => setIsProfileOpen(false)} onUpdateProfile={handleUpdateProfile} onOpenAdminModal={() => { setIsProfileOpen(false); setIsAdminDashboardOpen(true); }} /></div>, isFullscreen && viewportRef.current ? viewportRef.current : document.body)}
      {isPlayerChatOpen && currentUser && <PlayerMessengerModal key="player-chat-session" user={currentUser} onClose={() => setIsPlayerChatOpen(false)} portalTarget={isFullscreen ? viewportRef.current : document.body} />}

      {/* MODALS */}
      {editingModelAgent && createPortal(<AgentModelEditor ownerId={currentUser?.id} key={editingModelAgent.id} agent={editingModelAgent} onClose={() => setEditingModelAgentId(null)} onSave={async (changes) => {
        const updated = await db.agents.update(editingModelAgent.id, changes);
        if (!updated) throw new Error('This agent no longer exists. Close the editor and select another agent.');
        setAgents((previous) => previous.map((agent) => agent.id === editingModelAgent.id ? { ...agent, ...changes } : agent));
      }} />, isFullscreen && viewportRef.current ? viewportRef.current : document.body)}
      <AddAgentModal ownerId={currentUser?.id}
        isOpen={isAddAgentOpen}
        onClose={() => setIsAddAgentOpen(false)}
        onDeploy={handleDeployAgent}
      />

      {selectedAgent && <ProjectWorkspaceModal isOpen={isProjectWorkspaceOpen} agent={selectedAgent} onClose={() => setIsProjectWorkspaceOpen(false)} />}

      <AddFurnitureModal
        isOpen={isAddFurnitureOpen}
        onClose={() => setIsAddFurnitureOpen(false)}
        onAdd={handleAddFurniture}
        collections={Array.from(new Set(furniture.map((item) => item.collection?.trim()).filter((name): name is string => !!name)))}
      />

      <AdminDashboardModal
        isOpen={isAdminDashboardOpen}
        currentUserId={currentUser.id}
        onClose={() => setIsAdminDashboardOpen(false)}
        sessions={sessions}
        bannedIPs={bannedIPs}
        onToggleSessionStatus={handleToggleSessionStatus}
        onDeleteUser={handleDeleteUser}
        onChangeUserRole={handleChangeUserRole}
        onBanIP={handleBanIP}
        onUnbanIP={handleUnbanIP}
        onClearRevokedSessions={handleClearRevokedSessions}
      />
      {confirmDialog}
      {isDonationOpen && <DonationModal onClose={() => setIsDonationOpen(false)} />}
    </div>
  );
}

function MessageAttachment({ blob, type, name }: { blob: Blob; type: string; name: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const nextUrl = URL.createObjectURL(blob); setUrl(nextUrl); return () => URL.revokeObjectURL(nextUrl); }, [blob]);
  if (!url) return null;
  return type.startsWith('video/')
    ? <video controls preload="metadata" src={url} style={{ display: 'block', maxWidth: 'min(320px, 100%)', maxHeight: 220, marginTop: 7, borderRadius: 8 }} aria-label={name} />
    : <a href={url} target="_blank" rel="noreferrer" title={name}><img src={url} alt={name} style={{ display: 'block', maxWidth: 'min(320px, 100%)', maxHeight: 220, marginTop: 7, objectFit: 'contain', borderRadius: 8 }} /></a>;
}

function MessageLinkPreview({ text }: { text: string }) {
  const match = text.match(/https?:\/\/[^\s<>()]+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0]);
    return <a href={url.href} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 7, padding: '8px 9px', borderRadius: 7, border: '1px solid rgba(125,211,252,.2)', background: 'rgba(2,6,23,.35)', color: '#bae6fd', textDecoration: 'none' }}><strong style={{ display: 'block', fontSize: 10 }}>{url.hostname.replace(/^www\./, '')}</strong><span style={{ display: 'block', marginTop: 3, fontSize: 9, color: '#94a3b8', overflowWrap: 'anywhere' }}>{url.pathname === '/' ? 'Open webpage' : url.pathname}{url.search}</span></a>;
  } catch { return null; }
}

function DonationModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 220, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(2,6,23,.78)', backdropFilter: 'blur(5px)' }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="donation-title" style={{ width: 'min(560px, 100%)', maxHeight: '90dvh', overflowY: 'auto', border: '1px solid #334155', borderRadius: 16, background: '#1e293b', color: '#f1f5f9', boxShadow: '0 24px 80px rgba(0,0,0,.55)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '20px 24px', borderBottom: '1px solid #334155' }}>
          <h2 id="donation-title" style={{ margin: 0, fontSize: 21, fontWeight: 750 }}>Support Aetheria</h2>
          <button type="button" onClick={onClose} aria-label="Close donation dialog" style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, border: 0, borderRadius: 8, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}><X size={21} /></button>
        </header>
        <div style={{ padding: 24 }}>
          <p style={{ margin: '8px 0 18px', color: '#cbd5e1', fontSize: 15, lineHeight: 1.65 }}>Thanks for helping support Aetheria. Donations help keep the project running and improving.</p>
          <div style={{ padding: 20, border: '1px solid #334155', borderRadius: 11, background: '#0f172a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, color: '#a78bfa', fontSize: 18, fontWeight: 700 }}><CreditCard size={23} /> GCash</div>
            <div style={{ padding: 12, borderRadius: 10, background: '#fff' }}>
              <img src="/images/gcash-donation-qr.png" alt="GCash donation QR code" style={{ display: 'block', width: '100%', maxWidth: 460, maxHeight: '52dvh', margin: '0 auto', objectFit: 'contain' }} />
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

