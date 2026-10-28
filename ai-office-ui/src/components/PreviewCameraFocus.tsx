import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { OrbitControls } from 'three-stdlib';
import { Vector3 } from 'three';

export type CameraFocusRequest = {point: Vector3; distance?: number};
export function PreviewCameraFocus({request}: {request: CameraFocusRequest | null}) {
  const {camera,controls,invalidate}=useThree();
  useEffect(()=>{
    if(!request || !controls)return;
    const orbit=controls as OrbitControls;
    const offset=camera.position.clone().sub(orbit.target);
    const distance=request.distance ?? offset.length();
    if(offset.lengthSq()<1e-10)offset.set(0,0,1);
    offset.setLength(Math.max(distance,.001));
    camera.position.copy(request.point).add(offset);orbit.target.copy(request.point);
    orbit.update();invalidate();
  },[request,camera,controls,invalidate]);
  return null;
}
