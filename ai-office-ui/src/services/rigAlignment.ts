import { AnimationClip, AnimationMixer, Bone, Euler, Group, LoopOnce, Matrix4, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import type { AnimationRetargeting, AnimationSource } from './animationRetargeting';
import { humanoidBoneRole } from './humanoidBones';

type TargetBone = {id: string; name: string; bone: Bone; depth: number; rest: {position: Vector3; rotation: Quaternion; scale?: Vector3}};
export function buildSourceRig(source: AnimationSource) {
  const root = new Group(); const nodes = new Map<string,Object3D>(); const aliases = new Map<string,Object3D>();
  for (const entry of source.rig || []) {
    const node = entry.bone ? new Bone() : new Group();
    node.name = entry.name; node.position.fromArray(entry.position); node.quaternion.fromArray(entry.rotation); node.scale.fromArray(entry.scale);
    nodes.set(entry.id,node);
    (entry.parent !== null ? nodes.get(entry.parent) || root : root).add(node);
  }
  for (const [alias,bone] of Object.entries(source.bones)) {
    const node = bone.nodeId ? nodes.get(bone.nodeId) : undefined;
    if (node) {node.name = alias; aliases.set(alias,node);}
  }
  root.updateMatrixWorld(true); return {root,nodes,aliases};
}
export function buildTargetRig(root: Object3D, bones: TargetBone[]) {
  const result = new Group(); const nodes = new Map<string,Object3D>(); const rest = new Map(bones.map((entry) => [entry.bone,entry.rest]));
  const walk = (node: Object3D, parent: Object3D, id: string) => {
    const copy = node instanceof Bone ? new Bone() : new Group(); copy.name=node.name;
    copy.position.copy(rest.get(node as Bone)?.position || node.position); copy.quaternion.copy(rest.get(node as Bone)?.rotation || node.quaternion); copy.scale.copy(rest.get(node as Bone)?.scale || node.scale);
    nodes.set(id,copy); parent.add(copy); node.children.forEach((child,index) => walk(child,copy,`${id}/${index}`));
  };
  walk(root,result,'0'); result.updateMatrixWorld(true); return {root:result,nodes};
}
const nextRole: Record<string,string> = {hips:'spine',spine:'chest',chest:'upperChest',upperChest:'neck',neck:'head',upperNeck:'head'};
function childRole(role: string | null) {
  if (!role) return null;
  if (nextRole[role]) return nextRole[role];
  const limb: Record<string,string> = {glute:'gluteEnd',chestSoft:'chestSoftEnd',shoulder:'upperArm',upperArm:'lowerArm',upperArmTwist:'lowerArm',lowerArm:'hand',lowerArmTwist:'hand',hand:'middle.1',upperLeg:'lowerLeg',lowerLeg:'foot',foot:'toes','1':'2','2':'3'};
  const pieces=role.split('.'); const last=pieces[pieces.length-1];
  return limb[last] ? [...pieces.slice(0,-1),limb[last]].join('.') : null;
}
// The wrist-to-finger direction alone cannot determine palm roll. Three
// finger landmarks provide an unambiguous frame without assuming local axes.
export function palmOrientationFrame(hand:Object3D,nameOf:(node:Object3D)=>string=(node)=>node.name) {
  const markers=new Map<string,Object3D>();
  hand.traverse((node)=>{
    if(!(node instanceof Bone)||node===hand)return;
    const name=nameOf(node),role=humanoidBoneRole(name);
    const finger=role?.match(/\.(index|middle|pinky)\.1$/)?.[1];
    const biped=name.match(/Finger([124])$/i);
    const key=finger||(biped?({'1':'index','2':'middle','4':'pinky'} as Record<string,string>)[biped[1]]:undefined);
    if(key&&!markers.has(key))markers.set(key,node);
  });
  const index=markers.get('index'),middle=markers.get('middle'),pinky=markers.get('pinky');
  if(!index||!middle||!pinky)return null;
  const forward=middle.getWorldPosition(new Vector3()).sub(hand.getWorldPosition(new Vector3()));
  const across=index.getWorldPosition(new Vector3()).sub(pinky.getWorldPosition(new Vector3()));
  const normal=new Vector3().crossVectors(forward,across);
  if(forward.lengthSq()<1e-8||normal.lengthSq()<1e-8)return null;
  forward.normalize();normal.normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(forward,normal,new Vector3().crossVectors(forward,normal).normalize()));
}
export function bakeRigAnimation(root: Object3D, bones: TargetBone[], source: AnimationSource, clip: AnimationClip, config: AnimationRetargeting) {
  const donor = buildSourceRig(source); const target = buildTargetRig(root,bones);
  const mixer = new AnimationMixer(donor.root); const action = mixer.clipAction(clip);
  action.clampWhenFinished = true; action.setLoop(LoopOnce,1);
  const yaw = new Quaternion().setFromEuler(new Euler(0,(config.alignment?.sourceYaw || 0)*Math.PI/180,0));
  const yawInverse = yaw.clone().invert();
  if (config.alignment?.referencePose === 'firstFrame') {action.play(); mixer.update(0); donor.root.updateMatrixWorld(true);}
  const used = new Set<string>();
  const directionCorrections=new Map<Object3D,Quaternion>();
  const mappings = bones.flatMap((bone) => {
    const alias = Object.keys(config.boneMap).find((key) => config.boneMap[key] === bone.id && donor.aliases.has(key));
    const from = alias ? donor.aliases.get(alias) : undefined; const to = target.nodes.get(bone.id);
    if (!alias || !from || !to || used.has(bone.id)) return [];
    used.add(bone.id);
    const sourceRest = from.getWorldQuaternion(new Quaternion()); const targetRest = to.getWorldQuaternion(new Quaternion());
    const sourcePosition = from.getWorldPosition(new Vector3()); const targetPosition = to.getWorldPosition(new Vector3());
    const role = humanoidBoneRole(source.bones[alias].name);
    const aim = childRole(role);
    const childAlias = aim ? Object.keys(source.bones).find((key) => humanoidBoneRole(source.bones[key].name) === aim && donor.aliases.has(key) && config.boneMap[key]) : undefined;
    const sourceAim = aim ? source.rig?.find((node) => node.bone && humanoidBoneRole(node.name) === aim) : undefined;
    const targetAim = aim ? bones.find((node) => humanoidBoneRole(node.name) === aim) : undefined;
    const sourceChild = childAlias ? donor.aliases.get(childAlias) : sourceAim ? donor.nodes.get(sourceAim.id) : undefined;
    const targetChild = childAlias ? target.nodes.get(config.boneMap[childAlias]) : targetAim ? target.nodes.get(targetAim.id) : undefined;
    const correction = new Quaternion();
    let corrected=false;
    if(config.alignment?.matchPalmOrientation&&config.alignment?.matchDirections!==false&&role?.endsWith('.hand')){
      const sourceFrame=palmOrientationFrame(from,(node)=>source.bones[node.name]?.name||node.name),targetFrame=palmOrientationFrame(to);
      if(sourceFrame&&targetFrame){correction.copy(sourceFrame).premultiply(yaw).multiply(targetFrame.invert());corrected=true;}
    }
    if (!corrected && config.alignment?.matchDirections !== false && sourceChild && targetChild && sourceChild !== from && targetChild !== to) {
      const sourceDirection = sourceChild.getWorldPosition(new Vector3()).sub(sourcePosition).applyQuaternion(yaw);
      const targetDirection = targetChild.getWorldPosition(new Vector3()).sub(targetPosition);
      if (sourceDirection.lengthSq() > 1e-8 && targetDirection.lengthSq() > 1e-8) {correction.setFromUnitVectors(targetDirection.normalize(),sourceDirection.normalize());corrected=true;}
    }
    if(!corrected && config.alignment?.matchDirections!==false){let ancestor=to.parent;while(ancestor){const inherited=directionCorrections.get(ancestor);if(inherited){correction.copy(inherited);break;}ancestor=ancestor.parent;}}
    directionCorrections.set(to,correction);
    const offset = config.alignment?.offsets?.[alias] || [0,0,0];
    return [{alias,bone,from,to,sourceRest,targetRest,sourcePosition,targetPosition,correction,offset:new Quaternion().setFromEuler(new Euler(offset[0]*Math.PI/180,offset[1]*Math.PI/180,offset[2]*Math.PI/180)),values:[] as number[],positions:[] as number[]}];
  });
  if (!mappings.length) {mixer.stopAllAction(); return new AnimationClip(clip.name,clip.duration,[]);}
  const pelvis = mappings.find((entry) => humanoidBoneRole(source.bones[entry.alias].name) === 'hips');
  const head = mappings.find((entry) => humanoidBoneRole(source.bones[entry.alias].name) === 'head');
  const scale = pelvis && head && head.sourcePosition.distanceTo(pelvis.sourcePosition) > 1e-5 ? head.targetPosition.distanceTo(pelvis.targetPosition)/head.sourcePosition.distanceTo(pelvis.sourcePosition) : 1;
  const frames = Math.max(1,Math.ceil(clip.duration*Math.min(60,source.sampleRate||30))); const times: number[] = [];
  action.reset().play();
  const world = new Quaternion(); const parent = new Quaternion(); const delta = new Vector3();
  for (let frame=0;frame<=frames;frame++) {
    const time=frame/frames*clip.duration; times.push(time); mixer.setTime(Math.min(time,Math.max(0,clip.duration-1e-6))); donor.root.updateMatrixWorld(true);
    for (const entry of mappings) {
      // Transfer world-space motion, then recover local rotation under the
      // target's animated parent. This handles different joint axes/hierarchies.
      entry.from.getWorldQuaternion(world).multiply(entry.sourceRest.clone().invert()).premultiply(yaw).multiply(yawInverse).multiply(entry.correction).multiply(entry.targetRest);
      entry.to.parent?.getWorldQuaternion(parent); if (!entry.to.parent) parent.identity();
      entry.to.quaternion.copy(parent.invert().multiply(world)).multiply(entry.offset).normalize();
      if (entry === pelvis) {
        entry.from.getWorldPosition(delta).sub(entry.sourcePosition).applyQuaternion(yaw).multiplyScalar(scale);
        if (config.inPlace) {delta.x=0; delta.z=0;}
        delta.add(entry.targetPosition); entry.to.parent?.worldToLocal(delta); entry.to.position.copy(delta);
        entry.to.position.toArray(entry.positions,entry.positions.length);
      }
      entry.to.updateMatrixWorld(true);
      entry.to.quaternion.toArray(entry.values,entry.values.length);
    }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(donor.root);
  const tracks = mappings.flatMap((entry) => {
    const rotation = new QuaternionKeyframeTrack(`${entry.bone.bone.uuid}.quaternion`,times,entry.values).optimize();
    return entry.positions.length ? [rotation,new VectorKeyframeTrack(`${entry.bone.bone.uuid}.position`,times,entry.positions).optimize()] : [rotation];
  });
  return new AnimationClip(clip.name,clip.duration,tracks,clip.blendMode);
}
