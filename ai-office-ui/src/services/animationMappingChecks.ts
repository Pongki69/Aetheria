import type { Object3D } from 'three';
import { humanoidBoneRole } from './humanoidBones';
import { rigBones, type AnimationRetargeting, type AnimationSource } from './animationRetargeting';
import { suggestAnimationBones } from './animationImport';

// Some game exports suffix twist helpers with variant IDs. Recognize these for
// diagnostics without changing the existing automatic mapper on working rigs.
function checkedRole(name: string) {
  return humanoidBoneRole(name) || humanoidBoneRole(name.replace(/^_+/, '').replace(/_[AB]\d+$/i, '').replace(/LowerArmTwist/i, 'ForeArmTwist'));
}
export type MappingIssue = {alias:string;sourceName:string;targetName:string;reason:string};
export function animationMappingIssues(root: Object3D, source: AnimationSource, map: Record<string,string>): MappingIssue[] {
  const bones=rigBones(root);
  const targets=Object.entries(map).filter(([alias,target])=>source.bones[alias]&&target!=='__ignore');
  return targets.flatMap(([alias,target])=>{
    const bone=bones.find((entry)=>entry.id===target),sourceName=source.bones[alias].name;
    if(!bone)return [{alias,sourceName,targetName:'Missing bone',reason:'This target bone is no longer in the model.'}];
    const from=checkedRole(sourceName),to=checkedRole(bone.name);
    const side=(role:string|null)=>role?.match(/^(left|right)\./)?.[1];
    let reason='';
    if(side(from)&&side(to)&&side(from)!==side(to))reason='Left and right sides do not match.';
    else if(from&&to&&from!==to)reason='The animation joint and model bone have different body roles.';
    else if(from&&!/Twist/.test(from)&&/twist|捩/i.test(bone.name))reason='A main joint is assigned to a twist helper.';
    else if(targets.some(([other,id])=>other!==alias&&id===target))reason='More than one joint in this animation rig drives the same model bone.';
    return reason?[{alias,sourceName,targetName:bone.name,reason}]:[];
  });
}
export function repairAnimationMappingIssues(root: Object3D, source: AnimationSource, config: AnimationRetargeting) {
  const issues=animationMappingIssues(root,source,config.boneMap),suggested=suggestAnimationBones(root,source);
  const map={...config.boneMap},offsets={...config.alignment?.offsets};
  for(const {alias} of issues){delete map[alias];delete offsets[alias];}
  const used=new Set(Object.entries(map).filter(([alias,id])=>source.bones[alias]&&id!=='__ignore').map(([,id])=>id));
  let repaired=0;
  for(const {alias} of issues){const target=suggested[alias];if(target&&!used.has(target)){map[alias]=target;used.add(target);repaired++;}}
  return {config:{...config,boneMap:map,alignment:{...config.alignment,offsets}},repaired,unassigned:issues.length-repaired};
}
