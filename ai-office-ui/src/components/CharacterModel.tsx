import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { AnimState } from '../types';
import { applyModelParts } from '../services/modelParts';
import { applyVertexColorTint } from '../services/modelVertexColors';
import { repairMmdMaterials } from '../services/modelMmdMaterials';
import { retargetAnimations, type AnimationRetargeting } from '../services/animationRetargeting';
import { SecondaryMotionController } from '../services/secondaryMotion';
import { BoneAdjustmentController } from '../services/boneAdjustments';

interface CharacterModelProps {
  modelUrl: string;
  animState: AnimState;
  isSelected?: boolean;
  scale?: number;
  idleAnimation?: string;
  walkingAnimation?: string;
  animationRetargeting?: AnimationRetargeting;
  modelHiddenParts?: string[];
  modelUseVertexColors?: boolean;
  modelRotation?: [number, number, number];
  visible?: boolean;
  onAnimationFinished?: () => void;
  onIdleActionAvailability?: (available: boolean) => void;
  onIdleLoopFinished?: () => void;
}

export function CharacterModel({
  modelUrl,
  animState,
  isSelected,
  scale = 1,
  idleAnimation,
  walkingAnimation,
  animationRetargeting,
  modelHiddenParts,
  modelUseVertexColors,
  modelRotation,
  visible = true,
  onAnimationFinished,
  onIdleActionAvailability,
  onIdleLoopFinished
}: CharacterModelProps) {
  const group = useRef<THREE.Group>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const activeAction = useRef<THREE.AnimationAction | null>(null);

  const { scene, animations: sourceAnimations } = useGLTF(modelUrl);

  const clonedScene = useMemo(() => {
    const sc = SkeletonUtils.clone(scene);
    // Preserve imported transforms, visibility, textures, and materials.
    // Mesh offsets and names are not a reliable way to identify accessories.
    sc.traverse((child) => {
      child.raycast = () => null;
      if (child instanceof THREE.SkinnedMesh || child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = Array.isArray(child.material) ? child.material.map((material) => material.clone()) : child.material.clone();
      }
    });
    repairMmdMaterials(sc);
    return sc;
  }, [scene]);
  const secondary=useMemo(()=>new SecondaryMotionController(clonedScene),[clonedScene]);
  const boneAdjustments=useMemo(()=>new BoneAdjustmentController(clonedScene),[clonedScene]);
  useEffect(()=>{secondary.reset();return()=>secondary.reset();},[secondary,animState]);
  useEffect(()=>()=>boneAdjustments.dispose(),[boneAdjustments]);
  const animations = useMemo(() => retargetAnimations(clonedScene, sourceAnimations, animationRetargeting), [clonedScene, sourceAnimations, animationRetargeting]);

  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);
  useEffect(() => { applyModelParts(clonedScene, modelHiddenParts || []); }, [clonedScene, modelHiddenParts]);
  useEffect(() => { applyVertexColorTint(clonedScene, modelUseVertexColors); }, [clonedScene, modelUseVertexColors]);
  useEffect(() => () => {
    clonedScene.traverse((object) => {
      if (object instanceof THREE.Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
    });
  }, [clonedScene]);
  const defaultIdleClip = useMemo(
    () => animations.find((clip) => clip.name === idleAnimation)
      || animations.find((clip) => /stand_show/i.test(clip.name))
      || animations.find((clip) => /idle|stand|wait|pose/i.test(clip.name))
      || animations[0],
    [animations, idleAnimation]
  );
  const walkClip = useMemo(
    () => animations.find((clip) => clip.name === walkingAnimation)
      || animations.find((clip) => /walk|run|move|step/i.test(clip.name)),
    [animations, walkingAnimation]
  );
  const idleActionClips = useMemo(
    () => animations.filter((clip) => clip !== defaultIdleClip && clip !== walkClip && !/walk|run|move|step/i.test(clip.name) && !animationRetargeting?.sources?.some((source)=>source.builtin && source.clips.some((item)=>item.name===clip.name))),
    [animations, defaultIdleClip, walkClip,animationRetargeting?.sources]
  );

  useEffect(() => {
    onIdleActionAvailability?.(idleActionClips.length > 0);
  }, [idleActionClips.length, onIdleActionAvailability]);

  useEffect(() => {
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(clonedScene);
      activeAction.current = null;
    };
  }, [mixer, clonedScene, animations]);

  useEffect(() => {
    const handleFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action === activeAction.current && animState === 'idleAction') {
        onAnimationFinished?.();
      }
    };
    const handleLoop = (event: { action: THREE.AnimationAction }) => {
      if (event.action === activeAction.current && animState === 'idle') {
        onIdleLoopFinished?.();
      }
    };
    mixer.addEventListener('finished', handleFinished);
    mixer.addEventListener('loop', handleLoop);
    return () => {
      mixer.removeEventListener('finished', handleFinished);
      mixer.removeEventListener('loop', handleLoop);
    };
  }, [animState, mixer, onAnimationFinished, onIdleLoopFinished]);

  useEffect(() => {
    if (!animations || animations.length === 0) return;

    const lowerState = animState.toLowerCase();
    let targetClip: THREE.AnimationClip | undefined;

    if (lowerState === 'idle') {
      targetClip = defaultIdleClip;
    } else if (lowerState === 'idleaction') {
      targetClip = idleActionClips[Math.floor(Math.random() * idleActionClips.length)];
    } else if (lowerState === 'walking' || lowerState === 'dragged') {
      targetClip = walkClip;
      if (!targetClip) targetClip = defaultIdleClip;
    }

    // If the model has no locomotion clip, freeze its current pose instead of
    // replaying animations[0] (which is commonly an idle loop) while it moves.
    if ((lowerState === 'idleaction' && !targetClip) || ((lowerState === 'walking' || lowerState === 'dragged' || lowerState === 'idle') && !targetClip)) {
      activeAction.current?.fadeOut(0.15);
      activeAction.current = null;
      return;
    }

    if (!targetClip) {
      targetClip = animations[0];
    }

    if (targetClip) {
      const nextAction = mixer.clipAction(targetClip);

      if (activeAction.current !== nextAction) {
        if (activeAction.current) {
          activeAction.current.fadeOut(0.2);
        }

        activeAction.current = nextAction;
      }

      nextAction.reset().fadeIn(0.2);
      if (lowerState === 'idleaction' || animationRetargeting?.sources?.some((source)=>source.looping?.[targetClip.name]===false)) {
        nextAction.setLoop(THREE.LoopOnce, 1);
        nextAction.clampWhenFinished = true;
      } else {
        nextAction.setLoop(THREE.LoopRepeat, Infinity);
        nextAction.clampWhenFinished = false;
      }
      nextAction.play();
      nextAction.timeScale = (animState === 'dragged' ? 2.2 : 1.0) * (animationRetargeting?.speed || 1);
    }
  }, [animState, animations, defaultIdleClip, idleActionClips, mixer, walkClip, animationRetargeting?.speed]);

  useFrame((state, delta) => {
    secondary.restore();
    boneAdjustments.restore();
    mixer.update(delta);
    boneAdjustments.placeSkeleton(animationRetargeting?.skeletonPlacement,animationRetargeting?.rebindSkeleton);
    boneAdjustments.apply(animationRetargeting?.boneAdjustments);
    secondary.update(delta,animationRetargeting?.secondaryMotion,animState==='walking'||animState==='dragged'?1:.4);
    const time = state.clock.getElapsedTime();

    if (isSelected && ringRef.current) {
      ringRef.current.rotation.z = time * 2.0;
    }

    if (animState === 'dragged' && group.current) {
      group.current.rotation.z = Math.sin(time * 25) * 0.18;
      group.current.rotation.x = Math.cos(time * 20) * 0.15;
      group.current.position.y = Math.sin(time * 15) * 0.1;
    } else if (group.current) {
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, 0, delta * 12);
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, 0, delta * 12);
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, 0, delta * 12);
    }
  });

  return (
    <group ref={group} scale={scale} visible={visible} dispose={null}>
      <group rotation={modelRotation || [0, 0, 0]}><primitive object={clonedScene} /></group>
      {isSelected && (
        <mesh ref={ringRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.7, 32]} />
          <meshBasicMaterial color="#3b82f6" side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}
