import { Euler, Quaternion, type Bone, type Object3D } from 'three';
import { humanoidBoneRole } from './humanoidBones';
import { rigBones, type AnimationRetargeting, type RigBone, type SecondaryMotionSettings } from './animationRetargeting';

export const DEFAULT_SECONDARY_MOTION:SecondaryMotionSettings={enabled:false,strength:.6,damping:.8,rate:1.3,delay:0,duration:4,loop:true};
export type SecondaryChannel='chest'|'clothes'|'glutes';
export function secondaryBoneCandidates(bones:RigBone[],channel:SecondaryChannel){
  const matches=bones.filter(({name})=>channel==='chest'
    ? ((humanoidBoneRole(name)||'').endsWith('.chestSoft') || /breast|bust|胸|おっぱい/i.test(name))&&!/plate|ribbon|cloth|飾|リボン|衣|装/i.test(name)
    : channel==='glutes' ? /glute|buttock|butt|尻|臀/i.test(name)
    : /skirt|dress|cloth|coat|cape|ribbon|hem|sleeve|裾|スカート|裙|袖|リボン|披风|披風|衣/i.test(name));
  // Drive a chain once, through its parent, to avoid compounding the motion.
  return matches.filter((bone)=>!matches.some((other)=>other.id!==bone.id&&bone.id.startsWith(`${other.id}/`)));
}
type Spring={bone:Bone;base:Quaternion;x:number;z:number;vx:number;vz:number;channel:SecondaryChannel};
export class SecondaryMotionController{
  private bones:RigBone[];private springs=new Map<string,Spring>();private elapsed={chest:0,clothes:0,glutes:0};private config:AnimationRetargeting['secondaryMotion'];
  constructor(root:Object3D){this.bones=rigBones(root);}
  restore(){for(const spring of this.springs.values())spring.bone.quaternion.copy(spring.base);}
  reset(){this.restore();this.springs.clear();this.elapsed={chest:0,clothes:0,glutes:0};}
  update(delta:number,settings:AnimationRetargeting['secondaryMotion'],intensity=1){
    const dt=Math.min(Math.max(delta,0),.04);
    const used=new Set<string>();
    for(const channel of ['chest','clothes','glutes'] as const){
      if(settings?.[channel]!==this.config?.[channel]){this.elapsed[channel]=0;for(const [id,spring] of this.springs)if(spring.channel===channel)this.springs.delete(id);}
      const config=settings?.[channel];if(!config?.enabled)continue;
      this.elapsed[channel]+=dt;
      const ids=config.boneIds??secondaryBoneCandidates(this.bones,channel).map((bone)=>bone.id);
      const duration=Math.max(.25,config.duration);let time=this.elapsed[channel]-Math.max(0,config.delay);
      if(time<0)continue;if(config.loop)time%=duration;
      const active=config.loop||time<=duration;
      const edge=Math.min(.3,duration*.2);
      const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
      const envelope=active?smooth(time/edge)*smooth((duration-time)/edge):0;
      for(const [index,id] of ids.entries()){
        if(used.has(id))continue;used.add(id);const entry=this.bones.find((bone)=>bone.id===id);if(!entry)continue;
        let spring=this.springs.get(id);if(!spring){spring={bone:entry.bone,base:entry.bone.quaternion.clone(),x:0,z:0,vx:0,vz:0,channel};this.springs.set(id,spring);}
        spring.base.copy(entry.bone.quaternion);
        const phase=channel==='chest'?index*.1:index*1.17;
        const angle=this.elapsed[channel]*Math.PI*2*Math.max(.1,config.rate)+phase;
        const amount=(channel==='clothes'?.1:channel==='chest'?.035:.025)*Math.min(2,Math.max(0,config.strength))*intensity*envelope;
        const tx=Math.sin(angle)*amount,tz=Math.cos(angle*.83+phase)*amount*(channel==='chest'?.25:.5);
        const stiffness=90,damping=2*Math.sqrt(stiffness)*(.4+Math.max(0,Math.min(1,config.damping))*.8);
        spring.vx+=(stiffness*(tx-spring.x)-damping*spring.vx)*dt;spring.vz+=(stiffness*(tz-spring.z)-damping*spring.vz)*dt;
        spring.x+=spring.vx*dt;spring.z+=spring.vz*dt;
        spring.bone.quaternion.multiply(new Quaternion().setFromEuler(new Euler(spring.x,0,spring.z))).normalize();
      }
    }
    for(const id of this.springs.keys())if(!used.has(id))this.springs.delete(id);
    this.config=settings;
  }
}
