import { AnimationClip, AnimationMixer, LoopOnce, Matrix4, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import type { AnimationRigEdit, AnimationSource } from './animationRetargeting';
import { buildSourceRig } from './rigAlignment';

export function canDeleteAnimationJoint(source: AnimationSource, alias?: string) {
  const entry=source.rig?.find((node)=>node.id===source.bones[alias || '']?.nodeId);
  let parent=source.rig?.find((node)=>node.id===entry?.parent);
  while(parent){if(parent.bone)return true;parent=source.rig?.find((node)=>node.id===parent!.parent);}
  return false;
}
function applyOne(source: AnimationSource, edit: AnimationRigEdit): AnimationSource {
  if(!source.rig?.length)throw new Error('Reimport this animation model to include its editable hierarchy.');
  const next=structuredClone(source);
  if(edit.kind==='add'){
    const parent=source.bones[edit.parentAlias];
    if(!parent?.nodeId)throw new Error('Select an animation joint as the parent.');
    if(Object.keys(source.bones).length>=256)throw new Error('This animation rig already has 256 editable joints.');
    if(!edit.name.trim()||Object.values(source.bones).some((bone)=>bone.name===edit.name)||(source.boneAliases?.[edit.name]&&source.boneAliases[edit.name]!==edit.alias))throw new Error('Choose a unique name for the new joint.');
    if(!edit.position.every(Number.isFinite))throw new Error('Enter valid joint position values.');
    next.rig!.push({id:edit.id,parent:parent.nodeId,name:edit.name,bone:true,position:[...edit.position],rotation:[0,0,0,1],scale:[1,1,1]});
    next.bones[edit.alias]={name:edit.name,position:[...edit.position],rotation:[0,0,0,1],nodeId:edit.id};
    next.boneAliases={...next.boneAliases,[edit.name]:edit.alias};
    for(const clip of next.clips)clip.tracks.push(QuaternionKeyframeTrack.toJSON(new QuaternionKeyframeTrack(`${edit.alias}.quaternion`,[0,Math.max(clip.duration || 0,.001)],[0,0,0,1,0,0,0,1])));
    return next;
  }
  if(!canDeleteAnimationJoint(source,edit.alias))throw new Error('Keep the root joint. Select a child joint to delete.');
  const entry=source.rig.find((node)=>node.id===source.bones[edit.alias]?.nodeId)!;
  const original=buildSourceRig(source),children=source.rig.filter((node)=>node.parent===entry.id);
  const parent=entry.parent===null?original.root:original.nodes.get(entry.parent)!;
  const channels=new Map<string,string>();
  for(const child of children){
    const alias=Object.keys(source.bones).find((key)=>source.bones[key].nodeId===child.id);
    const name=alias || `edited_node_${child.id}`;channels.set(child.id,name);
    const node=original.nodes.get(child.id)!;
    const local=new Matrix4().copy(parent.matrixWorld).invert().multiply(node.matrixWorld);
    const position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();local.decompose(position,rotation,scale);
    const modified=next.rig!.find((node)=>node.id===child.id)!;
    modified.parent=entry.parent;modified.position=position.toArray();modified.rotation=rotation.toArray();modified.scale=scale.toArray();
    if(alias){next.bones[alias].position=position.toArray();next.bones[alias].rotation=rotation.toArray();}
    else modified.name=name;
  }
  next.rig=next.rig!.filter((node)=>node.id!==entry.id);delete next.bones[edit.alias];
  if(!children.length){
    for(const clip of next.clips)clip.tracks=clip.tracks.filter((track)=>!track.name.startsWith(`${edit.alias}.`));
    return next;
  }
  // Bake the removed parent's motion into its children before reconnecting.
  // Their original world-space animation is preserved, not just the rest pose.
  for(let index=0;index<source.clips.length;index++){
    const clip=AnimationClip.parse(source.clips[index]),mixer=new AnimationMixer(original.root);
    const action=mixer.clipAction(clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
    const samples=Math.max(1,Math.ceil(clip.duration*Math.min(60,source.sampleRate||30))),times:number[]=[];
    const values=new Map(children.map((node)=>[node.id,{position:[] as number[],rotation:[] as number[],scale:[] as number[]}]));
    for(let frame=0;frame<=samples;frame++){
      const time=frame/samples*clip.duration;times.push(time);mixer.setTime(Math.min(time,Math.max(0,clip.duration-1e-6)));original.root.updateMatrixWorld(true);
      for(const child of children){const local=new Matrix4().copy(parent.matrixWorld).invert().multiply(original.nodes.get(child.id)!.matrixWorld);const p=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(p,q,s);const data=values.get(child.id)!;p.toArray(data.position,data.position.length);q.toArray(data.rotation,data.rotation.length);s.toArray(data.scale,data.scale.length);}
    }
    const replaced=new Set([edit.alias,...channels.values()]);
    next.clips[index].tracks=next.clips[index].tracks.filter((track)=>!replaced.has(track.name.slice(0,track.name.lastIndexOf('.'))));
    for(const [id,data] of values){const name=channels.get(id)!;next.clips[index].tracks.push(...[
      new VectorKeyframeTrack(`${name}.position`,times,data.position).optimize(),new QuaternionKeyframeTrack(`${name}.quaternion`,times,data.rotation).optimize(),new VectorKeyframeTrack(`${name}.scale`,times,data.scale).optimize()
    ].map((track)=>track.constructor===QuaternionKeyframeTrack?QuaternionKeyframeTrack.toJSON(track):VectorKeyframeTrack.toJSON(track)));}
    mixer.stopAllAction();mixer.uncacheRoot(original.root);
  }
  return next;
}
export function editAnimationJoint(source: AnimationSource, edit: AnimationRigEdit) {
  return {...applyOne(source,edit),rigEdits:[...(source.rigEdits||[]),edit]};
}
export function replayAnimationRigEdits(source: AnimationSource, edits: AnimationRigEdit[]) {
  let next=source;
  for(const edit of edits){
    if(edit.kind==='delete'&&!next.bones[edit.alias])continue;
    if(edit.kind==='add'&&(!next.bones[edit.parentAlias]||next.bones[edit.alias]))continue;
    next=applyOne(next,edit);
  }
  return {...next,rigEdits:edits};
}
