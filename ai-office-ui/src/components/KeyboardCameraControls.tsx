import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface KeyboardCameraControlsProps {
  speed?: number;
}

export function KeyboardCameraControls({ speed = 10 }: KeyboardCameraControlsProps) {
  const { camera } = useThree();
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const moveVector = useRef(new THREE.Vector3());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable WASD if user is typing inside an input element or form field
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      keysPressed.current[e.key.toLowerCase()] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    const handleBlur = () => {
      keysPressed.current = {};
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useFrame((_, delta) => {
    const keys = keysPressed.current;
    if (!keys['w'] && !keys['a'] && !keys['s'] && !keys['d']) return;

    const moveStep = speed * delta;
    moveVector.current.set(0, 0, 0);

    // Camera forward vector parallel to the floor plane (XZ plane)
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    // Camera right vector
    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).negate().normalize();

    if (keys['w']) moveVector.current.addScaledVector(forward, moveStep);
    if (keys['s']) moveVector.current.addScaledVector(forward, -moveStep);
    if (keys['a']) moveVector.current.addScaledVector(right, -moveStep);
    if (keys['d']) moveVector.current.addScaledVector(right, moveStep);

    camera.position.add(moveVector.current);
  });

  return null;
}