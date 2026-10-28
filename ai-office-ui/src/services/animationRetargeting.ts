import { AnimationClip, Bone, Euler, Object3D, PropertyBinding, Quaternion, Vector3 } from 'three';
import { bakeRigAnimation } from './rigAlignment';

export type HumanoidRigLayout = {upperArmTwists:number;forearmTwists:number;upperLegTwists:number;lowerLegTwists:number;spineSegments:number;neckSegments:number;fingerSegments:number;shoulders:boolean;toeEnds:boolean;chest:boolean;glutes:boolean};
export type AnimationRigEdit = {kind:'add';id:string;alias:string;name:string;parentAlias:string;position:[number,number,number]} | {kind:'delete';alias:string};
export type AnimationSource = {
  id: string; name: string;
  builtin?: string;
  bodyProfile?: 'neutral' | 'female' | 'male';
  rigLayout?: HumanoidRigLayout;
  rigEdits?: AnimationRigEdit[];
  boneAliases?: Record<string,string>;
  motionVersion?: number;
  sampleRate?: number;
  looping?: Record<string,boolean>;
  gait?: {strideLength:number;armSwing:number;bodyLean:number;bounce:number;kneeLift:number};
  clips: ReturnType<typeof AnimationClip.toJSON>[];
  bones: Record<string, {name: string; position: number[]; rotation: number[]; nodeId?: string}>;
  rig?: Array<{id: string; parent: string | null; name: string; bone: boolean; position: number[]; rotation: number[]; scale: number[]}>;
};
export type SecondaryMotionSettings={enabled:boolean;strength:number;damping:number;rate:number;delay:number;duration:number;loop:boolean;boneIds?:string[]};
export type BoneAdjustment = {rotation?: [number,number,number]; position?: [number,number,number]};
export type SkeletonPlacement = {position: [number,number,number]; rotation: [number,number,number]; scale: number};
export type AnimationRetargeting = { skeletonPlacement?: SkeletonPlacement; boneAdjustments?: Record<string, BoneAdjustment>; rebindSkeleton?: boolean; boneMap: Record<string, string>; speed: number; inPlace: boolean; sources?: AnimationSource[]; secondaryMotion?:{chest?:SecondaryMotionSettings;clothes?:SecondaryMotionSettings;glutes?:SecondaryMotionSettings}; alignment?: {matchPalmOrientation?: boolean; sourceYaw?: number; matchDirections?: boolean; referencePose?: 'bind' | 'firstFrame'; offsets?: Record<string,[number,number,number]>} };
export const DEFAULT_RETARGETING: AnimationRetargeting = { boneMap: {}, speed: 1, inPlace: true };
export type RigBone = { id: string; name: string; bone: Bone; depth: number };
const restPoses = new WeakMap<Bone, {position: Vector3; rotation: Quaternion; scale: Vector3}>();
export function boneRestPose(bone: Bone) {
  return restPoses.get(bone) || {position:bone.position, rotation:bone.quaternion, scale:bone.scale};
}
export function rigBones(root: Object3D): RigBone[] {
  const bones: RigBone[] = [];
  const walk = (node: Object3D, id: string, depth: number) => {
    if (node instanceof Bone) {
      if (!restPoses.has(node)) restPoses.set(node, {position:node.position.clone(), rotation:node.quaternion.clone(), scale:node.scale.clone()});
      bones.push({ id, name: node.name || 'Unnamed bone', bone: node, depth });
    }
    node.children.forEach((child, index) => walk(child, `${id}/${index}`, depth + (node instanceof Bone ? 1 : 0)));
  };
  walk(root, '0', 0); return bones;
}
export function animationBoneName(trackName: string): string | null {
  try {
    const parsed = PropertyBinding.parseTrackName(trackName);
    return parsed.objectName === 'bones' ? String(parsed.objectIndex) : parsed.nodeName || null;
  } catch { return null; }
}
export function animationClips(clips: AnimationClip[], config?: AnimationRetargeting) {
  return [...clips, ...(config?.sources || []).flatMap((source) => source.clips.map((clip) => AnimationClip.parse(clip)))];
}
export function animationChannelLabel(name: string, config?: AnimationRetargeting): string {
  for (const source of config?.sources || []) if (source.bones[name]) return `${source.bones[name].name} · ${source.name}`;
  return name;
}
export function retargetAnimations(root: Object3D, clips: AnimationClip[], config?: AnimationRetargeting): AnimationClip[] {
  if (!config) return clips;
  const bones = rigBones(root);
  const importedBones = Object.assign({}, ...(config.sources || []).map((source) => source.bones)) as AnimationSource['bones'];
  return animationClips(clips, config).map((clip) => {
    const donor = config.sources?.find((entry) => entry.rig?.length && entry.clips.some((item) => item.name === clip.name));
    if (donor) return bakeRigAnimation(root,bones.map((entry) => ({...entry,rest:boneRestPose(entry.bone)})),donor,clip,config);
    const clipChannels = new Set(clip.tracks.map((track) => animationBoneName(track.name)));
    const assignedTargets = new Set(Object.entries(config.boneMap).filter(([source,id]) => clipChannels.has(source) && id !== '__ignore').map(([,id]) => id));
    const tracks = clip.tracks.flatMap((original) => {
      const sourceName = animationBoneName(original.name);
      const destination = sourceName ? config.boneMap[sourceName] : undefined;
      if (destination === '__ignore') return [];
      const source = bones.find((entry) => entry.name === sourceName)?.bone;
      // A reassigned channel owns its destination, replacing that bone's
      // original channel so two tracks do not fight over the same transform.
      if (!destination && source && bones.some((entry) => entry.bone === source && assignedTargets.has(entry.id))) return [];
      const target = destination ? bones.find((entry) => entry.id === destination)?.bone : undefined;
      const imported = sourceName ? importedBones[sourceName] : undefined;
      // Imported tracks must be mapped explicitly or automatically before
      // playback; never leave donor bone bindings attached to this model.
      if (imported && !target) return [];
      const track = original.clone();
      const parsed = PropertyBinding.parseTrackName(original.name);
      if (target) {
        track.name = `${target.uuid}.${parsed.propertyName}${parsed.propertyIndex !== undefined ? `[${parsed.propertyIndex}]` : ''}`;
      }
      if ((source || imported) && target) {
        const sourceRest = imported ? {position:new Vector3().fromArray(imported.position), rotation:new Quaternion().fromArray(imported.rotation)} : restPoses.get(source!)!;
        const targetRest = restPoses.get(target)!;
        // Transfer local animation deltas around the two bones' rest poses.
        if (parsed.propertyName === 'quaternion') {
          const correction = targetRest.rotation.clone().multiply(sourceRest.rotation.clone().invert());
          const rotation = new Quaternion();
          for (let i = 0; i < track.values.length; i += 4) rotation.fromArray(track.values, i).premultiply(correction).normalize().toArray(track.values, i);
          const offset = sourceName ? config.alignment?.offsets?.[sourceName] : undefined;
          if (offset) {
            const adjustment = new Quaternion().setFromEuler(new Euler(...offset.map((degrees) => degrees * Math.PI / 180) as [number,number,number]));
            for (let i = 0; i < track.values.length; i += 4) rotation.fromArray(track.values,i).multiply(adjustment).normalize().toArray(track.values,i);
          }
        } else if (parsed.propertyName === 'position') {
          const ratio = sourceRest.position.length() > 0.0001 ? targetRest.position.length() / sourceRest.position.length() : 1;
          const position = new Vector3();
          for (let i = 0; i < track.values.length; i += 3) position.fromArray(track.values, i).sub(sourceRest.position).multiplyScalar(ratio || 1).add(targetRest.position).toArray(track.values, i);
        }
      }
      if (config.inPlace && parsed.propertyName === 'position' && sourceName && /hips|pelvis|root|センター|全ての親/i.test(imported?.name || sourceName)) {
        const x = track.values[0]; const z = track.values[2];
        for (let i = 0; i < track.values.length; i += 3) { track.values[i] = x; track.values[i + 2] = z; }
      }
      return [track];
    });
    return new AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
  });
}
