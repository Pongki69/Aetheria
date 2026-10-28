import React from 'react';
import * as THREE from 'three';

export function RoomEnvironment() {
  return (
    <group>
      {/* Metallic Tech Room Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Grid Overlay */}
      <gridHelper args={[20, 20, '#38bdf8', '#1e293b']} position={[0, 0, 0]} />

      {/* Back Wall */}
      <mesh position={[0, 5, -10]} receiveShadow>
        <planeGeometry args={[20, 10]} />
        <meshStandardMaterial color="#020617" roughness={0.6} />
      </mesh>

      {/* Wall Glow Strips */}
      <mesh position={[0, 4, -9.95]}>
        <boxGeometry args={[18, 0.1, 0.1]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[0, 8, -9.95]}>
        <boxGeometry args={[18, 0.1, 0.1]} />
        <meshBasicMaterial color="#2563eb" />
      </mesh>

      {/* Workstation Desk */}
      <group position={[0, 0, -4]}>
        {/* Tabletop */}
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[4, 0.1, 1.8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.9} />
        </mesh>
        {/* Table Legs */}
        <mesh position={[-1.8, 0.6, -0.7]}>
          <boxGeometry args={[0.1, 1.2, 0.1]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[1.8, 0.6, -0.7]}>
          <boxGeometry args={[0.1, 1.2, 0.1]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[-1.8, 0.6, 0.7]}>
          <boxGeometry args={[0.1, 1.2, 0.1]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[1.8, 0.6, 0.7]}>
          <boxGeometry args={[0.1, 1.2, 0.1]} />
          <meshStandardMaterial color="#475569" />
        </mesh>

        {/* Dual Monitor Setup */}
        <mesh position={[0, 2.0, -0.2]}>
          <boxGeometry args={[2.2, 1.1, 0.05]} />
          <meshStandardMaterial color="#0f172a" roughness={0.1} />
        </mesh>
        {/* Screen Display Emissive Glow */}
        <mesh position={[0, 2.0, -0.17]}>
          <planeGeometry args={[2.1, 1.0]} />
          <meshBasicMaterial color="#0284c7" />
        </mesh>
        {/* Monitor Stand */}
        <mesh position={[0, 1.4, -0.3]}>
          <boxGeometry args={[0.3, 0.4, 0.2]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      </group>

      {/* Decorative Potted Plants */}
      <group position={[-5, 0, -5]}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.4, 0.3, 1, 16]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        <mesh position={[0, 1.4, 0]}>
          <dodecahedronGeometry args={[0.7, 1]} />
          <meshStandardMaterial color="#16a34a" roughness={0.8} />
        </mesh>
      </group>

      <group position={[5, 0, -5]}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.4, 0.3, 1, 16]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        <mesh position={[0, 1.4, 0]}>
          <dodecahedronGeometry args={[0.7, 1]} />
          <meshStandardMaterial color="#22c55e" roughness={0.8} />
        </mesh>
      </group>

      {/* Ambient Room Point Lights */}
      <pointLight position={[0, 4, -4]} intensity={2.5} color="#38bdf8" distance={10} />
      <pointLight position={[-6, 3, 2]} intensity={1.5} color="#a855f7" distance={8} />
      <pointLight position={[6, 3, 2]} intensity={1.5} color="#3b82f6" distance={8} />
    </group>
  );
}