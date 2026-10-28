import Dexie, { type Table } from 'dexie';
import type { AnimationClip, Object3D } from 'three';
import { boneKey, captureAnimationSource, suggestAnimationBones } from './animationImport';
import { rigBones, type AnimationRetargeting } from './animationRetargeting';

export type MotionPreset = {
  id: string; ownerId: string; name: string; createdAt: number;
  config: AnimationRetargeting; targets: Record<string,string>;
  idleAnimation: string; walkingAnimation: string;
};
class MotionPresetDatabase extends Dexie {
  presets!: Table<MotionPreset,string>;
  constructor() {super('AetheriaMotionPresets'); this.version(1).stores({presets:'id, ownerId, createdAt'});}
}
export const motionPresetDb = new MotionPresetDatabase();

export function createMotionPreset(scene: Object3D, clips: AnimationClip[], config: AnimationRetargeting, name: string, ownerId: string, idleAnimation = '', walkingAnimation = ''): MotionPreset {
  const saved = structuredClone(config);
  const native = clips.filter((clip) => !saved.sources?.some((source) => source.clips.some((item) => item.name === clip.name)));
  if (native.length) {
    const source = captureAnimationSource(scene,native,name);
    const suggestions = suggestAnimationBones(scene,source);
    for (const [alias,bone] of Object.entries(source.bones)) saved.boneMap[alias] = saved.boneMap[bone.name] || suggestions[alias] || '__ignore';
    saved.sources = [...(saved.sources || []),source];
    const copiedName = (original: string) => source.clips.find((clip) => clip.name.includes(` · ${original} [`))?.name || original;
    idleAnimation = copiedName(idleAnimation); walkingAnimation = copiedName(walkingAnimation);
  }
  if (!saved.sources?.length && !Object.keys(saved.boneAdjustments || {}).length && !saved.rebindSkeleton && !saved.skeletonPlacement) throw new Error('Add animations or adjust a character bone before saving a preset.');
  if (JSON.stringify(saved).length > 30_000_000) throw new Error('This preset is too large. Use fewer or shorter clips.');
  return {id:crypto.randomUUID(),ownerId,name:name.trim(),createdAt:Date.now(),config:saved,targets:Object.fromEntries(rigBones(scene).map((entry) => [entry.id,entry.name])),idleAnimation,walkingAnimation};
}

export function applyMotionPreset(scene: Object3D, preset: MotionPreset): {config: AnimationRetargeting; unmatched: number} {
  const config = structuredClone(preset.config);
  const bones = rigBones(scene);
  const suggestions = Object.assign({}, ...(config.sources || []).map((source) => suggestAnimationBones(scene,source))) as Record<string,string>;
  let unmatched = 0;
  for (const [source,target] of Object.entries(config.boneMap)) {
    if (target === '__ignore') {suggestions[source] = target; continue;}
    const name = preset.targets[target];
    const exact = bones.filter((entry) => entry.name === name);
    const matches = exact.length ? exact : name ? bones.filter((entry) => boneKey(entry.name) === boneKey(name)) : [];
    // Bone paths are stable within the same hierarchy; names allow reuse on another rig.
    const samePath = matches.find((entry) => entry.id === target);
    if (samePath || matches.length === 1) suggestions[source] = (samePath || matches[0]).id;
    else {delete suggestions[source]; unmatched++;}
  }
  config.boneMap = suggestions;
  for(const channel of ['chest','clothes','glutes'] as const){
    const settings=config.secondaryMotion?.[channel];if(!settings?.boneIds)continue;
    settings.boneIds=settings.boneIds.flatMap((id)=>{
      const name=preset.targets[id];const matches=bones.filter((bone)=>bone.name===name);
      const selected=matches.find((bone)=>bone.id===id)||(matches.length===1?matches[0]:undefined);
      if(!selected){unmatched++;return [];}return [selected.id];
    });
  }
  if (config.boneAdjustments) {
    config.boneAdjustments = Object.fromEntries(Object.entries(config.boneAdjustments).flatMap(([id, adjustment]) => {
      const name = preset.targets[id];
      const matches = bones.filter((bone) => bone.name === name || (name && boneKey(bone.name) === boneKey(name)));
      const selected = matches.find((bone) => bone.id === id) || (matches.length === 1 ? matches[0] : undefined);
      if (!selected) {unmatched++; return [];}
      return [[selected.id, adjustment]];
    }));
  }
  return {config,unmatched};
}
