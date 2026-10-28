import { useState, useRef, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentData, AnimState } from '../types';
import { CharacterModel } from './CharacterModel';
import { shuffleThoughts } from '../services/agentThoughts';

interface Agent3DProps {
  agent: AgentData & { thought?: string };
  isSelected?: boolean;
  onSelect?: () => void;
  onPositionChange?: (position: THREE.Vector3) => void;
  obstacles?: Array<{ x: number; z: number; radius: number; label: string }>;
  isPovControlled?: boolean;
  editMode?: boolean;
  onDragChange?: (dragging: boolean) => void;
}

const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
const TEMP_INTERSECTION = new THREE.Vector3();
const MOUSE_NDC = new THREE.Vector2();

export function Agent3D({ agent, isSelected = false, onSelect, onPositionChange, obstacles = [], isPovControlled = false, editMode = false, onDragChange }: Agent3DProps) {
  const meshRef = useRef<THREE.Group>(null!);
  const dragMarkerRef = useRef<THREE.Group>(null!);
  const onPositionChangeRef = useRef(onPositionChange);

  const [animState, setAnimState] = useState<AnimState>('idle');
  const animStateRef = useRef<AnimState>('idle');

  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const behaviorState = useRef<'walking' | 'idle' | 'idleAction'>('idle');
  const idleTimer = useRef<number>(3.0);
  const walkAfterIdleLoop = useRef(false);
  const [hasIdleAction, setHasIdleAction] = useState(false);

  const [showThought, setShowThought] = useState(false);
  const [isFacingLeft, setIsFacingLeft] = useState(false);
  const [generatedThought, setGeneratedThought] = useState('');
  const povKeys = useRef<Record<string, boolean>>({});
  const povRotation = useRef({ yaw: 0, pitch: 0 });
  const dragHeight = useRef(0);
  const verticalVelocity = useRef(0);
  const restHeight = useRef(agent.startPos?.y ?? 0);
  const lastPovSave = useRef(0);
  const lastPovPosition = useRef(new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));

  const { raycaster, camera, gl } = useThree();

  const updateAnimState = useCallback((newState: AnimState) => {
    if (animStateRef.current !== newState) {
      animStateRef.current = newState;
      setAnimState(newState);
    }
  }, []);

  useEffect(() => { onPositionChangeRef.current = onPositionChange; }, [onPositionChange]);
  useEffect(() => { restHeight.current = agent.startPos?.y ?? 0; }, [agent.startPos?.y]);

  const updatePointerPosition = useCallback((clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect();
    MOUSE_NDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    MOUSE_NDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }, [gl.domElement]);

  useEffect(() => {
    if (!isDragging) return;
    const handleHeightKey = (event: KeyboardEvent) => {
      if (isPovControlled) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.code !== 'Space' && event.key !== 'Shift') return;
      event.preventDefault();
      dragHeight.current = THREE.MathUtils.clamp(dragHeight.current + (event.code === 'Space' ? 1 : -1) * 0.15, -5, 12);
    };
    const handleMove = (event: PointerEvent) => updatePointerPosition(event.clientX, event.clientY);
    const handleUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      onDragChange?.(false);
      if (meshRef.current) meshRef.current.position.y = dragHeight.current;
      if (meshRef.current) onPositionChange?.(meshRef.current.position.clone());
      behaviorState.current = 'idle';
      walkAfterIdleLoop.current = false;
      idleTimer.current = THREE.MathUtils.randFloat(3, 6);
      updateAnimState('idle');
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    window.addEventListener('keydown', handleHeightKey);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      window.removeEventListener('keydown', handleHeightKey);
      onDragChange?.(false);
    };
  }, [isDragging, onPositionChange, onDragChange, updateAnimState]);

  useEffect(() => {
    if (!isPovControlled) {
      povKeys.current = {};
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
      if (meshRef.current && meshRef.current.position.y !== restHeight.current) {
        meshRef.current.position.y = restHeight.current;
        onPositionChangeRef.current?.(meshRef.current.position.clone());
      }
      verticalVelocity.current = 0;
      behaviorState.current = 'idle';
      idleTimer.current = THREE.MathUtils.randFloat(3, 6);
      updateAnimState('idle');
      return;
    }

    behaviorState.current = 'walking';
    walkAfterIdleLoop.current = false;
    updateAnimState('idle');
    povRotation.current = { yaw: meshRef.current.rotation.y + Math.PI, pitch: 0 };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.code === 'Space' ? 'space' : event.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'space'].includes(key)) return;
      event.preventDefault();
      if (key === 'space' && !event.repeat && meshRef.current.position.y <= 0.001) verticalVelocity.current = 5.2;
      povKeys.current[key] = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.code === 'Space' ? 'space' : event.key.toLowerCase();
      povKeys.current[key] = false;
    };
    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      povRotation.current.yaw -= event.movementX * 0.0022;
      // Screen Y grows downward: adding the pointer delta makes moving the
      // cursor upward look upward in POV, matching the expected mouse feel.
      povRotation.current.pitch = THREE.MathUtils.clamp(povRotation.current.pitch - event.movementY * 0.0022, -1.35, 1.35);
    };
    const handleTouchLook = (event: Event) => {
      const { movementX, movementY } = (event as CustomEvent<{ movementX: number; movementY: number }>).detail;
      povRotation.current.yaw -= movementX * 0.0022;
      povRotation.current.pitch = THREE.MathUtils.clamp(povRotation.current.pitch - movementY * 0.0022, -1.35, 1.35);
    };
    const clearKeys = () => { povKeys.current = {}; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('aetheria:povlook', handleTouchLook);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('aetheria:povlook', handleTouchLook);
      povKeys.current = {};
    };
  }, [gl.domElement, isPovControlled, updateAnimState]);

  useEffect(() => {
    setShowThought(false);
    setGeneratedThought('');
    const thoughts = agent.savedThoughts || [];
    if (!agent.liveThoughts || !thoughts.length) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let hideTimeout: ReturnType<typeof setTimeout>;
    let previous = '';
    let queue: string[] = [];
    const playNext = () => {
      if (cancelled) return;
      const position = meshRef.current?.position;
      if (document.hidden || !position || Math.hypot(camera.position.x - position.x, camera.position.z - position.z) > 40) {
        timer = setTimeout(playNext, 5000);
        return;
      }
      if (!queue.length) queue = shuffleThoughts(thoughts, previous);
      const text = queue.shift();
      if (!text) return;
      previous = text;
      setGeneratedThought(text);
      setShowThought(true);
      hideTimeout = setTimeout(() => setShowThought(false), 10_000);
      timer = setTimeout(playNext, 15_000 + Math.random() * 7000);
    };
    timer = setTimeout(playNext, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(hideTimeout);
    };
  }, [agent.id, agent.liveThoughts, agent.savedThoughts, camera]);

  const getRandomWaypoint = useCallback(() => {
    const origin = meshRef.current?.position || agent.startPos;
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = origin.x + THREE.MathUtils.randFloatSpread(13);
      const z = origin.z + THREE.MathUtils.randFloatSpread(13);
      if (!obstacles.some((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + 0.5)) {
        return new THREE.Vector3(x, 0, z);
      }
    }
    return new THREE.Vector3(origin.x, 0, origin.z);
  }, [obstacles, agent.startPos]);

  const targetPos = useRef<THREE.Vector3>(getRandomWaypoint());

  const startWalking = useCallback(() => {
    targetPos.current = getRandomWaypoint();
    behaviorState.current = 'walking';
    updateAnimState('walking');
  }, [getRandomWaypoint]);

  const handleIdleActionFinished = useCallback(() => {
    if (behaviorState.current !== 'idleAction') return;
    behaviorState.current = 'idle';
    updateAnimState('idle');
    startWalking();
  }, [startWalking, updateAnimState]);

  const handleIdleLoopFinished = useCallback(() => {
    if (behaviorState.current !== 'idle' || !walkAfterIdleLoop.current) return;
    walkAfterIdleLoop.current = false;
    startWalking();
  }, [startWalking]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (dragMarkerRef.current) dragMarkerRef.current.position.y = 0.025 - meshRef.current.position.y;

    if (isPovControlled) {
      const pos = meshRef.current.position;
      const yaw = povRotation.current.yaw;
      // Keep walking on the world X/Z plane and aligned with the camera view.
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const movement = new THREE.Vector3();
      if (povKeys.current.w) movement.add(forward);
      if (povKeys.current.s) movement.sub(forward);
      if (povKeys.current.d) movement.add(right);
      if (povKeys.current.a) movement.sub(right);
      if (movement.lengthSq() > 0) {
        movement.normalize().multiplyScalar(4 * delta);
        const clearance = 0.45 * agentScale;
        const collides = (x: number, z: number) => obstacles.some((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + clearance);
        const nextX = pos.x + movement.x;
        const nextZ = pos.z + movement.z;
        if (!collides(nextX, pos.z)) pos.x = nextX;
        if (!collides(pos.x, nextZ)) pos.z = nextZ;
        meshRef.current.rotation.y = yaw - Math.PI;
        updateAnimState('walking');
      } else {
        updateAnimState('idle');
      }

      verticalVelocity.current -= 14 * delta;
      pos.y = Math.max(0, pos.y + verticalVelocity.current * delta);
      if (pos.y === 0) verticalVelocity.current = 0;
      camera.position.set(pos.x, pos.y + 1.55 * agentScale, pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(povRotation.current.pitch, yaw, 0);

      const now = performance.now();
      if (now - lastPovSave.current > 350 && pos.distanceToSquared(lastPovPosition.current) > 0.0025) {
        lastPovSave.current = now;
        lastPovPosition.current.copy(pos);
        onPositionChange?.(pos.clone());
      }
      return;
    }

    const facingDir = Math.sin(meshRef.current.rotation.y);
    const facingLeftNow = facingDir < 0;
    if (facingLeftNow !== isFacingLeft) {
      setIsFacingLeft(facingLeftNow);
    }

    if (isDraggingRef.current) {
      raycaster.setFromCamera(MOUSE_NDC, camera);
      if (raycaster.ray.intersectPlane(DRAG_PLANE, TEMP_INTERSECTION)) {
        const targetX = TEMP_INTERSECTION.x;
        const targetZ = TEMP_INTERSECTION.z;
        meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetX, delta * 25);
        meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, targetZ, delta * 25);
        meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, dragHeight.current + 1.2, delta * 15);
      }
      return;
    }

    if (behaviorState.current !== 'walking') {
      if (behaviorState.current === 'idle') {
        idleTimer.current -= delta;
        if (idleTimer.current <= 0) {
          if (hasIdleAction && Math.random() < 0.35) {
            behaviorState.current = 'idleAction';
            updateAnimState('idleAction');
          } else {
            // Let Mint's current sway cycle complete before leaving idle.
            walkAfterIdleLoop.current = true;
          }
        }
      }
      return;
    }

    const pos = meshRef.current.position;
    const target = targetPos.current;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const distSq = dx * dx + dz * dz;

    if (distSq > 0.08) {
      const dist = Math.sqrt(distSq);
      const step = Math.min(1.8 * delta, dist);
      const nextX = pos.x + (dx / dist) * step;
      const nextZ = pos.z + (dz / dist) * step;
      const blockedBy = obstacles.find((obstacle) => Math.hypot(nextX - obstacle.x, nextZ - obstacle.z) < obstacle.radius + 0.5 * agentScale);
      if (blockedBy) {
        const clearance = blockedBy.radius + 0.5 * agentScale;
        const currentDistance = Math.hypot(pos.x - blockedBy.x, pos.z - blockedBy.z);
        const awayAngle = currentDistance > 0.001 ? Math.atan2(pos.z - blockedBy.z, pos.x - blockedBy.x) : Math.random() * Math.PI * 2;
        if (currentDistance < clearance) {
          pos.x = blockedBy.x + Math.cos(awayAngle) * clearance;
          pos.z = blockedBy.z + Math.sin(awayAngle) * clearance;
        }
        const side = dx * (pos.z - blockedBy.z) - dz * (pos.x - blockedBy.x) >= 0 ? 1 : -1;
        const detourAngle = awayAngle + side * Math.PI / 2;
        const detourRadius = blockedBy.radius + 0.7 * agentScale;
        targetPos.current = new THREE.Vector3(
          blockedBy.x + Math.cos(detourAngle) * detourRadius,
          0,
          blockedBy.z + Math.sin(detourAngle) * detourRadius
        );
        return;
      }
      pos.x = nextX;
      pos.z = nextZ;

      const targetAngle = Math.atan2(dx, dz);
      let diff = targetAngle - meshRef.current.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      meshRef.current.rotation.y += diff * delta * 8;
    } else {
      behaviorState.current = 'idle';
      walkAfterIdleLoop.current = false;
      idleTimer.current = THREE.MathUtils.randFloat(3.0, 6.0);
      updateAnimState('idle');
    }
  });

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    if (!editMode || isPovControlled) return;
    updatePointerPosition(e.nativeEvent?.clientX ?? e.clientX, e.nativeEvent?.clientY ?? e.clientY);
    dragHeight.current = meshRef.current.position.y;
    isDraggingRef.current = true;
    onDragChange?.(true);
    walkAfterIdleLoop.current = false;
    setIsDragging(true);
    updateAnimState('dragged');
    onSelect?.();
  };

  const handlePointerMove = (e: any) => {
    if (!editMode || !isDraggingRef.current) return;
    updatePointerPosition(e.nativeEvent?.clientX ?? e.clientX, e.nativeEvent?.clientY ?? e.clientY);
  };

  const agentScale = (agent as any).scale || (agent as any).size || 1;
  const initialX = agent.startPos?.x ?? 0;
  const initialY = agent.startPos?.y ?? 0;
  const initialZ = agent.startPos?.z ?? 0;
  const thoughtText = generatedThought;

  return (
    <group
      ref={meshRef}
      position={[initialX, initialY, initialZ]}
      raycast={!isPovControlled ? undefined : () => null}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onClick={(e) => {
        e.stopPropagation();
        if (editMode && !isPovControlled) onSelect?.();
      }}
    >
      <mesh position={[0, 0.95 * agentScale, 0]} visible={false}>
        <cylinderGeometry args={[0.5 * agentScale, 0.5 * agentScale, 1.9 * agentScale, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <CharacterModel
        modelUrl={agent.modelUrl}
        animState={animState}
        isSelected={isSelected}
        idleAnimation={agent.idleAnimation}
        walkingAnimation={agent.walkingAnimation}
        animationRetargeting={agent.animationRetargeting}
        modelHiddenParts={agent.modelHiddenParts}
        modelUseVertexColors={agent.modelUseVertexColors}
        modelRotation={agent.modelRotation}
        visible={!isPovControlled}
        scale={agentScale}
        onAnimationFinished={handleIdleActionFinished}
        onIdleActionAvailability={setHasIdleAction}
        onIdleLoopFinished={handleIdleLoopFinished}
      />

      <group ref={dragMarkerRef} visible={isDragging} position={[0, 0.025, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.48 * agentScale, 40]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48 * agentScale, 0.53 * agentScale, 40]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.92} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <Billboard position={[0, 2.05 * agentScale, 0]} follow={true} visible={!isPovControlled}>
        <Html
          center
          distanceFactor={9.5}
          zIndexRange={[40, 0]}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isSelected
                ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                : 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: '#ffffff',
              padding: '4px 14px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.4px',
              border: isSelected
                ? '1px solid #38bdf8'
                : '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: isSelected
                ? '0 0 12px rgba(56, 189, 248, 0.4), 0 4px 8px rgba(0,0,0,0.3)'
                : '0 4px 10px rgba(0, 0, 0, 0.35)',
              marginBottom: '8px'
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isSelected ? '#7dd3fc' : '#22c55e',
                boxShadow: '0 0 6px currentColor'
              }}
            />
            {agent.name}
          </div>
        </Html>
      </Billboard>
      <Billboard position={[0, 2.72 * agentScale, 0]} follow={true} visible={!isPovControlled}>
        <Html center distanceFactor={9.5} zIndexRange={[30, 0]} style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div
            style={{
              width: '220px',
              minHeight: '30px',
              display: 'flex',
              justifyContent: isFacingLeft ? 'flex-start' : 'flex-end',
              opacity: showThought ? 1 : 0,
              visibility: showThought ? 'visible' : 'hidden',
              transform: `translateX(${isFacingLeft ? -12 : 12}px) translateY(${showThought ? 0 : 8}px) scale(${showThought ? 1 : 0.94})`,
              transition: 'opacity 0.25s ease, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), visibility 0.25s'
            }}
          >
            <div
              style={{
                position: 'relative',
                alignSelf: 'flex-start',
                maxWidth: '190px',
                padding: '12px 15px',
                borderRadius: '18px 18px 18px 6px',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.98), rgba(241,245,249,0.96))',
                border: isSelected ? '1px solid rgba(56,189,248,0.8)' : '1px solid rgba(148,163,184,0.45)',
                boxShadow: isSelected ? '0 8px 24px rgba(2,132,199,0.22)' : '0 8px 24px rgba(15,23,42,0.2)',
                color: '#0f172a',
                font: '600 12px/1.4 system-ui, -apple-system, sans-serif',
                textAlign: 'center',
                overflowWrap: 'anywhere'
              }}
            >
              <span style={{ display: 'block', color: '#0284c7', fontSize: '9px', fontWeight: 800, letterSpacing: '1.1px', textTransform: 'uppercase', marginBottom: '3px' }}>Thinking</span>
              {thoughtText}
              <span aria-hidden="true" style={{ position: 'absolute', bottom: '-7px', [isFacingLeft ? 'left' : 'right']: '18px', width: '13px', height: '13px', background: '#f8fafc', borderRight: '1px solid rgba(148,163,184,0.45)', borderBottom: '1px solid rgba(148,163,184,0.45)', transform: 'rotate(45deg)' }} />
            </div>
          </div>
        </Html>
      </Billboard>
    </group>
  );
}
