import React, { useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export interface DecorData {
  id: string;
  name: string;
  modelUrl: string;
  position: { x: number; y: number; z: number };
  rotation?: number;
  scale: number;
}

interface Decor3DProps {
  decor: DecorData;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function Decor3D({ decor, isSelected = false, onSelect }: Decor3DProps) {
  const { scene } = useGLTF(decor.modelUrl);
  const ringRef = useRef<THREE.Mesh>(null!);

  const clonedScene = useMemo(() => {
    const sc = scene.clone();
    sc.position.set(0, 0, 0);
    sc.rotation.set(0, 0, 0);
    sc.scale.set(decor.scale, decor.scale, decor.scale);
    return sc;
  }, [scene, decor.scale]);

  return (
    <group
      position={[decor.position.x, decor.position.y, decor.position.z]}
      rotation={[0, decor.rotation || 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect();
      }}
    >
      <primitive object={clonedScene} />

      {/* Selection outline ring specific to decor objects */}
      {isSelected && (
        <mesh ref={ringRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6 * decor.scale, 0.75 * decor.scale, 32]} />
          <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}