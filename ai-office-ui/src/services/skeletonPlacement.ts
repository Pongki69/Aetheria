import { Box3, Euler, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { boneRestPose, rigBones, type SkeletonPlacement } from './animationRetargeting';

export const DEFAULT_SKELETON_PLACEMENT: SkeletonPlacement = {position:[0,0,0],rotation:[0,0,0],scale:1};
export function skeletonPivot(root: Object3D) {
  // Use canonical rest positions, even if a preview already has pose offsets.
  const bones=rigBones(root), current=bones.map(({bone})=>({bone,p:bone.position.clone(),q:bone.quaternion.clone(),s:bone.scale.clone()}));
  bones.forEach(({bone})=>{const rest=boneRestPose(bone);bone.position.copy(rest.position);bone.quaternion.copy(rest.rotation);bone.scale.copy(rest.scale);});
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),box=new Box3();
  bones.forEach(({bone})=>box.expandByPoint(bone.getWorldPosition(new Vector3()).applyMatrix4(inverse)));
  current.forEach(({bone,p,q,s})=>{bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);});
  root.updateWorldMatrix(true,true);
  return box.isEmpty()?new Vector3():box.getCenter(new Vector3());
}
export function skeletonPlacementMatrix(placement: SkeletonPlacement, pivot: Vector3) {
  const position=new Vector3(...placement.position).add(pivot);
  const rotation=new Quaternion().setFromEuler(new Euler(...placement.rotation.map((angle)=>angle*Math.PI/180) as [number,number,number]));
  const scale=Math.max(.01,Math.min(100,placement.scale));
  return new Matrix4().compose(position,rotation,new Vector3(scale,scale,scale)).multiply(new Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));
}
