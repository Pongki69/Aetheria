import { BoxGeometry, CapsuleGeometry, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { buildSourceRig } from './rigAlignment';
import type { AnimationSource } from './animationRetargeting';

export function createHumanoidDummy(source: AnimationSource) {
  const rig=buildSourceRig(source);
  const body=new MeshStandardMaterial({color:'#9fbacc',roughness:.65,metalness:.08});
  const joints=new MeshStandardMaterial({color:'#4b687c',roughness:.8});
  const face=new MeshStandardMaterial({color:'#263b4a',roughness:.9});
  const nodes=new Map(Object.entries(source.bones).map(([alias,bone])=>[bone.name,rig.aliases.get(alias)!]));
  const add=(name:string,geometry:BoxGeometry|CapsuleGeometry|SphereGeometry,material:MeshStandardMaterial,position:[number,number,number],scale?:[number,number,number])=>{
    const mesh=new Mesh(geometry,material);mesh.position.set(...position);if(scale)mesh.scale.set(...scale);nodes.get(name)?.add(mesh);return mesh;
  };
  add('Hips',new SphereGeometry(.13,20,14),joints,[0,0,0],[1.2,.85,.8]);
  add(nodes.has('Spine')?'Spine':'Spine2',new CapsuleGeometry(.145,.19,6,16),body,[0,nodes.has('Spine')?.11:-.05,0],[1,.95,.7]);
  add('Spine2',new SphereGeometry(.17,20,14),body,[0,.175,0],[1.2,.65,.7]);
  add('Neck',new CapsuleGeometry(.045,.06,4,12),joints,[0,.02,0]);
  add('Head',new SphereGeometry(.12,24,18),body,[0,.09,0],[.9,1.15,.85]);
  for(const sign of [-1,1])add('Head',new SphereGeometry(.012,10,8),face,[sign*.038,.11,.091]);
  for(const [side,sign] of [['Left',1],['Right',-1]] as const){
    for(const [part,length,radius,axis] of [['Arm',.28,.055,'x'],['ForeArm',.24,.045,'x'],['UpLeg',.43,.075,'y'],['Leg',.43,.055,'y']] as const){
      const direction=axis==='x'?new Vector3(sign,0,0):new Vector3(0,-1,0);
      const mesh=add(`${side}${part}`,new CapsuleGeometry(radius,length-radius*2,5,14),body,[direction.x*length/2,direction.y*length/2,0]);
      mesh.quaternion.setFromUnitVectors(new Vector3(0,1,0),direction);
      add(`${side}${part}`,new SphereGeometry(radius*.85,14,10),joints,[0,0,0]);
    }
    add(`${side}Hand`,new BoxGeometry(.09,.06,.085),body,[sign*.04,0,0]);
    add(`${side}Foot`,new BoxGeometry(.115,.065,.24),body,[0,-.023,.07]);
    for(const finger of ['Thumb','Index','Middle','Ring','Pinky'])for(let joint=1;joint<=3;joint++){
      if(!nodes.has(`${side}Hand${finger}${joint}`))continue;
      const length=joint===1?.028:joint===2?.022:.018;
      const mesh=add(`${side}Hand${finger}${joint}`,new CapsuleGeometry(.007,length-.014,3,8),body,[sign*length/2,0,0]);mesh.quaternion.setFromUnitVectors(new Vector3(0,1,0),new Vector3(sign,0,0));
    }
  }
  return rig.root;
}
