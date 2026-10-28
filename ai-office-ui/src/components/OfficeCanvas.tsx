import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Html,
  Billboard,
  Sparkles,
  useGLTF,
  useAnimations
} from '@react-three/drei';
import * as THREE from 'three';

// ==========================================
// TYPES
// ==========================================
type TaskState = 'idle' | 'working' | 'thinking' | 'sleeping';
type AnimState = 'idle' | 'walking' | 'working' | 'sleeping';

export interface AgentData {
  id: string;
  name: string;
  task: TaskState;
  position: THREE.Vector3;
  targetPos: THREE.Vector3;
  modelUrl?: string;
  scale?: number;
}

export interface DecorData {
  id: string;
  name: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  modelUrl?: string;
}

interface OfficeCanvasProps {
  agents?: AgentData[];
  decorItems?: DecorData[];
  selectedId?: string | null;
  onSelectEntity?: (id: string | null) => void;
}

// ==========================================
// 1. CHARACTER MODEL (WITH RIGGED ACCESSORY FIX)
// ==========================================
interface CharacterModelProps {
  animState: AnimState;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function CharacterModel({
  animState,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0]
}: CharacterModelProps) {
  const group = useRef<THREE.Group>(null!);
  const proceduralMesh = useRef<THREE.Group>(null!);

  const { scene, animations } = useGLTF('/models/mint.glb');
  const { actions, names } = useAnimations(animations, group);

  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    let headBone: THREE.Bone | null = null;

    clonedScene.traverse((child) => {
      if ((child as THREE.Bone).isBone && child.name.toLowerCase().includes('head')) {
        headBone = child as THREE.Bone;
      }
    });

    if (headBone) {
      clonedScene.traverse((child) => {
        if (
          child.type === 'Mesh' &&
          child.parent === clonedScene &&
          /hat|ribbon|accessory|hair|bow/i.test(child.name)
        ) {
          (headBone as THREE.Bone).add(child);
        }
      });
    }
  }, [clonedScene]);

  const activeClipName = useMemo(() => {
    if (!names || names.length === 0) return null;
    const lowerState = animState.toLowerCase();

    let matched = names.find((name) => name.toLowerCase().includes(lowerState));

    if (!matched) {
      if (lowerState === 'walking') matched = names.find((n) => /walk|run|move/i.test(n));
      else if (lowerState === 'working') matched = names.find((n) => /work|sit|type/i.test(n));
      else if (lowerState === 'sleeping') matched = names.find((n) => /sleep|lay|lie/i.test(n));
      else if (lowerState === 'idle') matched = names.find((n) => /idle|stand|wait/i.test(n));
    }

    return matched || names[0] || null;
  }, [animState, names]);

  useEffect(() => {
    if (!activeClipName || !actions[activeClipName]) return;

    const currentAction = actions[activeClipName];
    currentAction.reset().fadeIn(0.25).play();

    return () => {
      currentAction.fadeOut(0.25);
    };
  }, [activeClipName, actions]);

  useFrame((state, delta) => {
    if (!proceduralMesh.current) return;

    const hasWalkClip = activeClipName && /walk|run|move/i.test(activeClipName);

    if (animState === 'walking' && !hasWalkClip) {
      const time = state.clock.getElapsedTime() * 10;
      proceduralMesh.current.position.y = Math.abs(Math.sin(time)) * 0.1;
      proceduralMesh.current.rotation.z = Math.sin(time * 0.5) * 0.05;
    } else {
      proceduralMesh.current.position.y = THREE.MathUtils.damp(
        proceduralMesh.current.position.y,
        0,
        10,
        delta
      );
      proceduralMesh.current.rotation.z = THREE.MathUtils.damp(
        proceduralMesh.current.rotation.z,
        0,
        10,
        delta
      );
    }
  });

  return (
    <group ref={group} position={position} rotation={rotation} scale={scale} dispose={null}>
      <group ref={proceduralMesh}>
        <primitive object={clonedScene} />
      </group>
    </group>
  );
}

useGLTF.preload('/models/mint.glb');

// ==========================================
// 2. STANDALONE DECOR ITEM COMPONENT
// ==========================================
interface Decor3DProps {
  decor: DecorData;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function Decor3D({ decor, isSelected, onSelect }: Decor3DProps) {
  const scale = decor.scale || 1;

  return (
    <group
      position={decor.position}
      rotation={decor.rotation || [0, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect();
      }}
    >
      {/* Decorative Object Geometry */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1 * scale, 1 * scale, 1 * scale]} />
        <meshStandardMaterial color={isSelected ? '#38bdf8' : '#64748b'} />
      </mesh>

      {/* Selection Ring for Decor */}
      {isSelected && (
        <mesh position={[0, -0.48 * scale, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7 * scale, 0.85 * scale, 32]} />
          <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

// ==========================================
// 3. FULL DECORATED ROOM SCENERY
// ==========================================
function DecoratedRoom() {
  return (
    <group position={[0, 0, 0]}>
      {/* Flooring - Warm Oak Wood */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#c29b72" roughness={0.4} />
      </mesh>

      {/* Rug - Living Room */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2, 0.01, 2]}>
        <planeGeometry args={[4.5, 3.5]} />
        <meshStandardMaterial color="#e3dedb" roughness={0.9} />
      </mesh>

      {/* Back Wall */}
      <mesh position={[0, 3, -7]} receiveShadow>
        <planeGeometry args={[14, 6]} />
        <meshStandardMaterial color="#2d3238" />
      </mesh>

      {/* Left Wall */}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-7, 3, 0]} receiveShadow>
        <planeGeometry args={[14, 6]} />
        <meshStandardMaterial color="#373d45" />
      </mesh>

      {/* Baseboards */}
      <mesh position={[0, 0.15, -6.95]}>
        <boxGeometry args={[14, 0.3, 0.1]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      {/* --- WORKSTATION AREA --- */}
      <group position={[4, 0, -4]}>
        <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.08, 1.2]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.2} />
        </mesh>
        {[-1.1, 1.1].map((x, i) => (
          <mesh key={i} position={[x, 0.375, 0]}>
            <boxGeometry args={[0.08, 0.75, 1.1]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        ))}
        <mesh position={[-0.5, 1.15, -0.3]} rotation={[0, 0.1, 0]}>
          <boxGeometry args={[0.8, 0.5, 0.04]} />
          <meshStandardMaterial color="#050505" />
        </mesh>
        <mesh position={[0.4, 1.15, -0.3]} rotation={[0, -0.2, 0]}>
          <boxGeometry args={[0.8, 0.5, 0.04]} />
          <meshStandardMaterial color="#050505" />
        </mesh>
        <mesh position={[0, 0.79, 0.1]}>
          <boxGeometry args={[0.9, 0.01, 0.35]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <pointLight position={[0.9, 1.3, -0.2]} intensity={2} color="#ffaa44" distance={3} />
      </group>

      {/* --- BEDROOM AREA --- */}
      <group position={[-4.5, 0, -4.5]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <boxGeometry args={[2.4, 0.5, 3.2]} />
          <meshStandardMaterial color="#5c4033" />
        </mesh>
        <mesh position={[0, 0.55, 0.1]}>
          <boxGeometry args={[2.2, 0.35, 2.9]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.6, 0.4]}>
          <boxGeometry args={[2.22, 0.3, 2.1]} />
          <meshStandardMaterial color="#4a6b82" />
        </mesh>
        <mesh position={[-0.6, 0.78, -1.0]}>
          <boxGeometry args={[0.8, 0.15, 0.5]} />
          <meshStandardMaterial color="#eeeeee" />
        </mesh>
        <mesh position={[0.6, 0.78, -1.0]}>
          <boxGeometry args={[0.8, 0.15, 0.5]} />
          <meshStandardMaterial color="#eeeeee" />
        </mesh>
      </group>

      {/* --- LIVING ROOM / SOFA AREA --- */}
      <group position={[-2, 0, 2]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[3.2, 0.4, 1.2]} />
          <meshStandardMaterial color="#3d405b" />
        </mesh>
        <mesh position={[0, 0.8, -0.5]}>
          <boxGeometry args={[3.2, 0.7, 0.3]} />
          <meshStandardMaterial color="#3d405b" />
        </mesh>
        <mesh position={[0, 0.3, 1.4]} castShadow>
          <boxGeometry args={[1.8, 0.06, 0.8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </group>

      {/* --- DECOR & PLANTS --- */}
      <group position={[5.8, 0, 5]}>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.3, 0.2, 0.8]} />
          <meshStandardMaterial color="#e0e0e0" />
        </mesh>
        <mesh position={[0, 1.1, 0]}>
          <sphereGeometry args={[0.55, 8, 8]} />
          <meshStandardMaterial color="#2d6a4f" roughness={0.9} />
        </mesh>
      </group>

      <mesh position={[2, 3.8, -6.9]}>
        <boxGeometry args={[2, 1.4, 0.04]} />
        <meshStandardMaterial color="#e0a96d" />
      </mesh>
      <mesh position={[-3, 3.8, -6.9]}>
        <boxGeometry args={[1.5, 1.8, 0.04]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
    </group>
  );
}

// ==========================================
// 4. AGENT 3D COMPONENT
// ==========================================
interface Agent3DProps {
  agent: AgentData;
  isSelected?: boolean;
  onSelect?: () => void;
  onUpdateTarget: (id: string, newTarget: THREE.Vector3) => void;
  onArrive?: (id: string) => void;
}

export function Agent3D({
  agent,
  isSelected = false,
  onSelect,
  onUpdateTarget,
  onArrive
}: Agent3DProps) {
  const meshRef = useRef<THREE.Group>(null!);
  const [animState, setAnimState] = useState<AnimState>('idle');
  const [isDragging, setIsDragging] = useState(false);

  const targetQuaternion = useRef(new THREE.Quaternion());
  const dummyMatrix = useRef(new THREE.Matrix4());

  useEffect(() => {
    const interval = setInterval(() => {
      if (isDragging) return;

      if (agent.task === 'working' || agent.task === 'thinking') {
        onUpdateTarget(agent.id, new THREE.Vector3(4, 0, -2.8));
        return;
      }
      if (agent.task === 'sleeping') {
        onUpdateTarget(agent.id, new THREE.Vector3(-4.5, 0, -3.5));
        return;
      }

      const rand = Math.random();
      if (rand < 0.33) {
        onUpdateTarget(agent.id, new THREE.Vector3(-4.5, 0, -3.5));
      } else if (rand < 0.66) {
        onUpdateTarget(agent.id, new THREE.Vector3(-2, 0, 2));
      } else {
        const randomX = (Math.random() - 0.5) * 6;
        const randomZ = (Math.random() - 0.5) * 6;
        onUpdateTarget(agent.id, new THREE.Vector3(randomX, 0, randomZ));
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [agent.id, agent.task, isDragging, onUpdateTarget]);

  useFrame((state, delta) => {
    if (!meshRef.current || isDragging) return;

    const currentPos = meshRef.current.position;
    const targetPos = agent.targetPos;

    const dx = targetPos.x - currentPos.x;
    const dz = targetPos.z - currentPos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    const ARRIVAL_THRESHOLD = 0.35;
    const WALK_SPEED = 3.5;

    if (distance > ARRIVAL_THRESHOLD) {
      currentPos.x = THREE.MathUtils.damp(currentPos.x, targetPos.x, WALK_SPEED, delta);
      currentPos.z = THREE.MathUtils.damp(currentPos.z, targetPos.z, WALK_SPEED, delta);

      const lookAtTarget = new THREE.Vector3(targetPos.x, currentPos.y, targetPos.z);
      dummyMatrix.current.lookAt(lookAtTarget, currentPos, meshRef.current.up);
      targetQuaternion.current.setFromRotationMatrix(dummyMatrix.current);
      meshRef.current.quaternion.slerp(targetQuaternion.current, delta * 8);

      if (animState !== 'walking') setAnimState('walking');
    } else {
      if (animState === 'walking') {
        if (agent.task === 'working' || agent.task === 'thinking') setAnimState('working');
        else if (agent.task === 'sleeping') setAnimState('sleeping');
        else setAnimState('idle');

        if (onArrive) onArrive(agent.id);
      }
    }
  });

  return (
    <DragManager
      meshRef={meshRef}
      onDragStart={() => {
        setIsDragging(true);
        if (onSelect) onSelect();
      }}
      onDragEnd={(newPos) => {
        setIsDragging(false);
        onUpdateTarget(agent.id, newPos);
      }}
    >
      <group
        ref={meshRef}
        position={[agent.position.x, agent.position.y, agent.position.z]}
        onClick={(e) => {
          e.stopPropagation();
          if (onSelect) onSelect();
        }}
      >
        <CharacterModel animState={animState} scale={agent.scale || 1} />

        {isSelected && (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.55, 0.7, 32]} />
            <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.85} />
          </mesh>
        )}

        <Billboard position={[0, 2.2 * (agent.scale || 1), 0]}>
          <Html center distanceFactor={10}>
            <div style={{
              background: isSelected ? 'rgba(2, 132, 199, 0.95)' : 'rgba(20, 20, 25, 0.85)',
              color: 'white',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: isSelected ? '0 0 10px rgba(56, 189, 248, 0.5)' : 'none'
            }}>
              <strong>{agent.name}</strong> ({animState})
            </div>
          </Html>
        </Billboard>
      </group>
    </DragManager>
  );
}

// ==========================================
// 5. DRAG MANAGER COMPONENT
// ==========================================
interface DragManagerProps {
  children: React.ReactNode;
  meshRef: React.RefObject<THREE.Group>;
  onDragStart?: () => void;
  onDragEnd?: (newPos: THREE.Vector3) => void;
}

export function DragManager({ children, meshRef, onDragStart, onDragEnd }: DragManagerProps) {
  const { camera, raycaster, gl } = useThree();
  const [isDragging, setIsDragging] = useState(false);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const planeIntersection = useMemo(() => new THREE.Vector3(), []);

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);
    if (onDragStart) onDragStart();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerUp = (e: any) => {
    if (!isDragging) return;
    e.stopPropagation();
    setIsDragging(false);
    if (meshRef.current && onDragEnd) {
      onDragEnd(meshRef.current.position.clone());
    }
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    if (!isDragging || !meshRef.current) return;
    e.stopPropagation();

    const rect = gl.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera({ x, y }, camera);
    if (raycaster.ray.intersectPlane(plane, planeIntersection)) {
      meshRef.current.position.x = planeIntersection.x;
      meshRef.current.position.z = planeIntersection.z;
    }
  };

  return (
    <group
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
    >
      {children}
    </group>
  );
}

// ==========================================
// 6. MAIN SCENE CANVAS
// ==========================================
export function OfficeCanvas({
  agents: externalAgents,
  decorItems = [],
  selectedId: externalSelectedId,
  onSelectEntity: externalOnSelectEntity
}: OfficeCanvasProps) {
  const [internalAgents, setInternalAgents] = useState<AgentData[]>([
    {
      id: 'mint-1',
      name: 'Mint',
      task: 'idle',
      position: new THREE.Vector3(0, 0, 0),
      targetPos: new THREE.Vector3(0, 0, 0)
    }
  ]);

  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  const agents = externalAgents || internalAgents;
  const selectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;

  const handleSelect = (id: string | null) => {
    if (externalOnSelectEntity) {
      externalOnSelectEntity(id);
    } else {
      setInternalSelectedId(id);
    }
  };

  const handleUpdateTarget = (id: string, newTarget: THREE.Vector3) => {
    setInternalAgents((prev) =>
      prev.map((agent) =>
        agent.id === id ? { ...agent, targetPos: newTarget.clone() } : agent
      )
    );
  };

  const handleArrive = (id: string) => {
    setInternalAgents((prev) =>
      prev.map((agent) =>
        agent.id === id ? { ...agent, position: agent.targetPos.clone() } : agent
      )
    );
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0d0e12' }}>
      <Canvas
        camera={{ position: [0, 9, 11], fov: 45 }}
        shadows
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            handleSelect(null);
          }
        }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[8, 12, 6]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-4, 4, -3]} intensity={1.5} color="#ffd1a1" />

        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={4} maxDistance={22} />

        <DecoratedRoom />

        <Sparkles count={25} scale={12} size={1.5} speed={0.3} color="#ffe5b4" />

        {/* Render Agents */}
        {agents.map((agent) => (
          <Agent3D
            key={agent.id}
            agent={agent}
            isSelected={selectedId === agent.id}
            onSelect={() => handleSelect(agent.id)}
            onUpdateTarget={handleUpdateTarget}
            onArrive={handleArrive}
          />
        ))}

        {/* Render Decor Separately */}
        {decorItems.map((decor) => (
          <Decor3D
            key={decor.id}
            decor={decor}
            isSelected={selectedId === decor.id}
            onSelect={() => handleSelect(decor.id)}
          />
        ))}
      </Canvas>
    </div>
  );
}

export default OfficeCanvas;import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Html,
  Billboard,
  Sparkles,
  useGLTF,
  useAnimations
} from '@react-three/drei';
import * as THREE from 'three';

// ==========================================
// TYPES
// ==========================================
type TaskState = 'idle' | 'working' | 'thinking' | 'sleeping';
type AnimState = 'idle' | 'walking' | 'working' | 'sleeping';

export interface AgentData {
  id: string;
  name: string;
  task: TaskState;
  position: THREE.Vector3;
  targetPos: THREE.Vector3;
  modelUrl?: string;
  scale?: number;
}

export interface DecorData {
  id: string;
  name: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  modelUrl?: string;
}

interface OfficeCanvasProps {
  agents?: AgentData[];
  decorItems?: DecorData[];
  selectedId?: string | null;
  onSelectEntity?: (id: string | null) => void;
}

// ==========================================
// 1. CHARACTER MODEL (WITH RIGGED ACCESSORY FIX)
// ==========================================
interface CharacterModelProps {
  animState: AnimState;
  scale?: number | [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function CharacterModel({
  animState,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0]
}: CharacterModelProps) {
  const group = useRef<THREE.Group>(null!);
  const proceduralMesh = useRef<THREE.Group>(null!);

  const { scene, animations } = useGLTF('/models/mint.glb');
  const { actions, names } = useAnimations(animations, group);

  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    let headBone: THREE.Bone | null = null;

    clonedScene.traverse((child) => {
      if ((child as THREE.Bone).isBone && child.name.toLowerCase().includes('head')) {
        headBone = child as THREE.Bone;
      }
    });

    if (headBone) {
      clonedScene.traverse((child) => {
        if (
          child.type === 'Mesh' &&
          child.parent === clonedScene &&
          /hat|ribbon|accessory|hair|bow/i.test(child.name)
        ) {
          (headBone as THREE.Bone).add(child);
        }
      });
    }
  }, [clonedScene]);

  const activeClipName = useMemo(() => {
    if (!names || names.length === 0) return null;
    const lowerState = animState.toLowerCase();

    let matched = names.find((name) => name.toLowerCase().includes(lowerState));

    if (!matched) {
      if (lowerState === 'walking') matched = names.find((n) => /walk|run|move/i.test(n));
      else if (lowerState === 'working') matched = names.find((n) => /work|sit|type/i.test(n));
      else if (lowerState === 'sleeping') matched = names.find((n) => /sleep|lay|lie/i.test(n));
      else if (lowerState === 'idle') matched = names.find((n) => /idle|stand|wait/i.test(n));
    }

    return matched || names[0] || null;
  }, [animState, names]);

  useEffect(() => {
    if (!activeClipName || !actions[activeClipName]) return;

    const currentAction = actions[activeClipName];
    currentAction.reset().fadeIn(0.25).play();

    return () => {
      currentAction.fadeOut(0.25);
    };
  }, [activeClipName, actions]);

  useFrame((state, delta) => {
    if (!proceduralMesh.current) return;

    const hasWalkClip = activeClipName && /walk|run|move/i.test(activeClipName);

    if (animState === 'walking' && !hasWalkClip) {
      const time = state.clock.getElapsedTime() * 10;
      proceduralMesh.current.position.y = Math.abs(Math.sin(time)) * 0.1;
      proceduralMesh.current.rotation.z = Math.sin(time * 0.5) * 0.05;
    } else {
      proceduralMesh.current.position.y = THREE.MathUtils.damp(
        proceduralMesh.current.position.y,
        0,
        10,
        delta
      );
      proceduralMesh.current.rotation.z = THREE.MathUtils.damp(
        proceduralMesh.current.rotation.z,
        0,
        10,
        delta
      );
    }
  });

  return (
    <group ref={group} position={position} rotation={rotation} scale={scale} dispose={null}>
      <group ref={proceduralMesh}>
        <primitive object={clonedScene} />
      </group>
    </group>
  );
}

useGLTF.preload('/models/mint.glb');

// ==========================================
// 2. STANDALONE DECOR ITEM COMPONENT
// ==========================================
interface Decor3DProps {
  decor: DecorData;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function Decor3D({ decor, isSelected, onSelect }: Decor3DProps) {
  const scale = decor.scale || 1;

  return (
    <group
      position={decor.position}
      rotation={decor.rotation || [0, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect();
      }}
    >
      {/* Decorative Object Geometry */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1 * scale, 1 * scale, 1 * scale]} />
        <meshStandardMaterial color={isSelected ? '#38bdf8' : '#64748b'} />
      </mesh>

      {/* Selection Ring for Decor */}
      {isSelected && (
        <mesh position={[0, -0.48 * scale, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7 * scale, 0.85 * scale, 32]} />
          <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

// ==========================================
// 3. FULL DECORATED ROOM SCENERY
// ==========================================
function DecoratedRoom() {
  return (
    <group position={[0, 0, 0]}>
      {/* Flooring - Warm Oak Wood */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#c29b72" roughness={0.4} />
      </mesh>

      {/* Rug - Living Room */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2, 0.01, 2]}>
        <planeGeometry args={[4.5, 3.5]} />
        <meshStandardMaterial color="#e3dedb" roughness={0.9} />
      </mesh>

      {/* Back Wall */}
      <mesh position={[0, 3, -7]} receiveShadow>
        <planeGeometry args={[14, 6]} />
        <meshStandardMaterial color="#2d3238" />
      </mesh>

      {/* Left Wall */}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-7, 3, 0]} receiveShadow>
        <planeGeometry args={[14, 6]} />
        <meshStandardMaterial color="#373d45" />
      </mesh>

      {/* Baseboards */}
      <mesh position={[0, 0.15, -6.95]}>
        <boxGeometry args={[14, 0.3, 0.1]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      {/* --- WORKSTATION AREA --- */}
      <group position={[4, 0, -4]}>
        <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.08, 1.2]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.2} />
        </mesh>
        {[-1.1, 1.1].map((x, i) => (
          <mesh key={i} position={[x, 0.375, 0]}>
            <boxGeometry args={[0.08, 0.75, 1.1]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        ))}
        <mesh position={[-0.5, 1.15, -0.3]} rotation={[0, 0.1, 0]}>
          <boxGeometry args={[0.8, 0.5, 0.04]} />
          <meshStandardMaterial color="#050505" />
        </mesh>
        <mesh position={[0.4, 1.15, -0.3]} rotation={[0, -0.2, 0]}>
          <boxGeometry args={[0.8, 0.5, 0.04]} />
          <meshStandardMaterial color="#050505" />
        </mesh>
        <mesh position={[0, 0.79, 0.1]}>
          <boxGeometry args={[0.9, 0.01, 0.35]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <pointLight position={[0.9, 1.3, -0.2]} intensity={2} color="#ffaa44" distance={3} />
      </group>

      {/* --- BEDROOM AREA --- */}
      <group position={[-4.5, 0, -4.5]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <boxGeometry args={[2.4, 0.5, 3.2]} />
          <meshStandardMaterial color="#5c4033" />
        </mesh>
        <mesh position={[0, 0.55, 0.1]}>
          <boxGeometry args={[2.2, 0.35, 2.9]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.6, 0.4]}>
          <boxGeometry args={[2.22, 0.3, 2.1]} />
          <meshStandardMaterial color="#4a6b82" />
        </mesh>
        <mesh position={[-0.6, 0.78, -1.0]}>
          <boxGeometry args={[0.8, 0.15, 0.5]} />
          <meshStandardMaterial color="#eeeeee" />
        </mesh>
        <mesh position={[0.6, 0.78, -1.0]}>
          <boxGeometry args={[0.8, 0.15, 0.5]} />
          <meshStandardMaterial color="#eeeeee" />
        </mesh>
      </group>

      {/* --- LIVING ROOM / SOFA AREA --- */}
      <group position={[-2, 0, 2]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[3.2, 0.4, 1.2]} />
          <meshStandardMaterial color="#3d405b" />
        </mesh>
        <mesh position={[0, 0.8, -0.5]}>
          <boxGeometry args={[3.2, 0.7, 0.3]} />
          <meshStandardMaterial color="#3d405b" />
        </mesh>
        <mesh position={[0, 0.3, 1.4]} castShadow>
          <boxGeometry args={[1.8, 0.06, 0.8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </group>

      {/* --- DECOR & PLANTS --- */}
      <group position={[5.8, 0, 5]}>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.3, 0.2, 0.8]} />
          <meshStandardMaterial color="#e0e0e0" />
        </mesh>
        <mesh position={[0, 1.1, 0]}>
          <sphereGeometry args={[0.55, 8, 8]} />
          <meshStandardMaterial color="#2d6a4f" roughness={0.9} />
        </mesh>
      </group>

      <mesh position={[2, 3.8, -6.9]}>
        <boxGeometry args={[2, 1.4, 0.04]} />
        <meshStandardMaterial color="#e0a96d" />
      </mesh>
      <mesh position={[-3, 3.8, -6.9]}>
        <boxGeometry args={[1.5, 1.8, 0.04]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
    </group>
  );
}

// ==========================================
// 4. AGENT 3D COMPONENT
// ==========================================
interface Agent3DProps {
  agent: AgentData;
  isSelected?: boolean;
  onSelect?: () => void;
  onUpdateTarget: (id: string, newTarget: THREE.Vector3) => void;
  onArrive?: (id: string) => void;
}

export function Agent3D({
  agent,
  isSelected = false,
  onSelect,
  onUpdateTarget,
  onArrive
}: Agent3DProps) {
  const meshRef = useRef<THREE.Group>(null!);
  const [animState, setAnimState] = useState<AnimState>('idle');
  const [isDragging, setIsDragging] = useState(false);

  const targetQuaternion = useRef(new THREE.Quaternion());
  const dummyMatrix = useRef(new THREE.Matrix4());

  useEffect(() => {
    const interval = setInterval(() => {
      if (isDragging) return;

      if (agent.task === 'working' || agent.task === 'thinking') {
        onUpdateTarget(agent.id, new THREE.Vector3(4, 0, -2.8));
        return;
      }
      if (agent.task === 'sleeping') {
        onUpdateTarget(agent.id, new THREE.Vector3(-4.5, 0, -3.5));
        return;
      }

      const rand = Math.random();
      if (rand < 0.33) {
        onUpdateTarget(agent.id, new THREE.Vector3(-4.5, 0, -3.5));
      } else if (rand < 0.66) {
        onUpdateTarget(agent.id, new THREE.Vector3(-2, 0, 2));
      } else {
        const randomX = (Math.random() - 0.5) * 6;
        const randomZ = (Math.random() - 0.5) * 6;
        onUpdateTarget(agent.id, new THREE.Vector3(randomX, 0, randomZ));
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [agent.id, agent.task, isDragging, onUpdateTarget]);

  useFrame((state, delta) => {
    if (!meshRef.current || isDragging) return;

    const currentPos = meshRef.current.position;
    const targetPos = agent.targetPos;

    const dx = targetPos.x - currentPos.x;
    const dz = targetPos.z - currentPos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    const ARRIVAL_THRESHOLD = 0.35;
    const WALK_SPEED = 3.5;

    if (distance > ARRIVAL_THRESHOLD) {
      currentPos.x = THREE.MathUtils.damp(currentPos.x, targetPos.x, WALK_SPEED, delta);
      currentPos.z = THREE.MathUtils.damp(currentPos.z, targetPos.z, WALK_SPEED, delta);

      const lookAtTarget = new THREE.Vector3(targetPos.x, currentPos.y, targetPos.z);
      dummyMatrix.current.lookAt(lookAtTarget, currentPos, meshRef.current.up);
      targetQuaternion.current.setFromRotationMatrix(dummyMatrix.current);
      meshRef.current.quaternion.slerp(targetQuaternion.current, delta * 8);

      if (animState !== 'walking') setAnimState('walking');
    } else {
      if (animState === 'walking') {
        if (agent.task === 'working' || agent.task === 'thinking') setAnimState('working');
        else if (agent.task === 'sleeping') setAnimState('sleeping');
        else setAnimState('idle');

        if (onArrive) onArrive(agent.id);
      }
    }
  });

  return (
    <DragManager
      meshRef={meshRef}
      onDragStart={() => {
        setIsDragging(true);
        if (onSelect) onSelect();
      }}
      onDragEnd={(newPos) => {
        setIsDragging(false);
        onUpdateTarget(agent.id, newPos);
      }}
    >
      <group
        ref={meshRef}
        position={[agent.position.x, agent.position.y, agent.position.z]}
        onClick={(e) => {
          e.stopPropagation();
          if (onSelect) onSelect();
        }}
      >
        <CharacterModel animState={animState} scale={agent.scale || 1} />

        {isSelected && (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.55, 0.7, 32]} />
            <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.85} />
          </mesh>
        )}

        <Billboard position={[0, 2.2 * (agent.scale || 1), 0]}>
          <Html center distanceFactor={10}>
            <div style={{
              background: isSelected ? 'rgba(2, 132, 199, 0.95)' : 'rgba(20, 20, 25, 0.85)',
              color: 'white',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: isSelected ? '0 0 10px rgba(56, 189, 248, 0.5)' : 'none'
            }}>
              <strong>{agent.name}</strong> ({animState})
            </div>
          </Html>
        </Billboard>
      </group>
    </DragManager>
  );
}

// ==========================================
// 5. DRAG MANAGER COMPONENT
// ==========================================
interface DragManagerProps {
  children: React.ReactNode;
  meshRef: React.RefObject<THREE.Group>;
  onDragStart?: () => void;
  onDragEnd?: (newPos: THREE.Vector3) => void;
}

export function DragManager({ children, meshRef, onDragStart, onDragEnd }: DragManagerProps) {
  const { camera, raycaster, gl } = useThree();
  const [isDragging, setIsDragging] = useState(false);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const planeIntersection = useMemo(() => new THREE.Vector3(), []);

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);
    if (onDragStart) onDragStart();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerUp = (e: any) => {
    if (!isDragging) return;
    e.stopPropagation();
    setIsDragging(false);
    if (meshRef.current && onDragEnd) {
      onDragEnd(meshRef.current.position.clone());
    }
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    if (!isDragging || !meshRef.current) return;
    e.stopPropagation();

    const rect = gl.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera({ x, y }, camera);
    if (raycaster.ray.intersectPlane(plane, planeIntersection)) {
      meshRef.current.position.x = planeIntersection.x;
      meshRef.current.position.z = planeIntersection.z;
    }
  };

  return (
    <group
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
    >
      {children}
    </group>
  );
}

// ==========================================
// 6. MAIN SCENE CANVAS
// ==========================================
export function OfficeCanvas({
  agents: externalAgents,
  decorItems = [],
  selectedId: externalSelectedId,
  onSelectEntity: externalOnSelectEntity
}: OfficeCanvasProps) {
  const [internalAgents, setInternalAgents] = useState<AgentData[]>([
    {
      id: 'mint-1',
      name: 'Mint',
      task: 'idle',
      position: new THREE.Vector3(0, 0, 0),
      targetPos: new THREE.Vector3(0, 0, 0)
    }
  ]);

  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  const agents = externalAgents || internalAgents;
  const selectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;

  const handleSelect = (id: string | null) => {
    if (externalOnSelectEntity) {
      externalOnSelectEntity(id);
    } else {
      setInternalSelectedId(id);
    }
  };

  const handleUpdateTarget = (id: string, newTarget: THREE.Vector3) => {
    setInternalAgents((prev) =>
      prev.map((agent) =>
        agent.id === id ? { ...agent, targetPos: newTarget.clone() } : agent
      )
    );
  };

  const handleArrive = (id: string) => {
    setInternalAgents((prev) =>
      prev.map((agent) =>
        agent.id === id ? { ...agent, position: agent.targetPos.clone() } : agent
      )
    );
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0d0e12' }}>
      <Canvas
        camera={{ position: [0, 9, 11], fov: 45 }}
        shadows
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            handleSelect(null);
          }
        }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[8, 12, 6]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-4, 4, -3]} intensity={1.5} color="#ffd1a1" />

        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={4} maxDistance={22} />

        <DecoratedRoom />

        <Sparkles count={25} scale={12} size={1.5} speed={0.3} color="#ffe5b4" />

        {/* Render Agents */}
        {agents.map((agent) => (
          <Agent3D
            key={agent.id}
            agent={agent}
            isSelected={selectedId === agent.id}
            onSelect={() => handleSelect(agent.id)}
            onUpdateTarget={handleUpdateTarget}
            onArrive={handleArrive}
          />
        ))}

        {/* Render Decor Separately */}
        {decorItems.map((decor) => (
          <Decor3D
            key={decor.id}
            decor={decor}
            isSelected={selectedId === decor.id}
            onSelect={() => handleSelect(decor.id)}
          />
        ))}
      </Canvas>
    </div>
  );
}

export default OfficeCanvas;