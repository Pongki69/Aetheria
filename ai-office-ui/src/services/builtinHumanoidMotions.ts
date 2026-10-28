import { AnimationClip, Bone, Euler, Group, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';
import { replayAnimationRigEdits } from './animationJointEditing';
import { captureAnimationSource } from './animationImport';
import type { AnimationSource, HumanoidRigLayout } from './animationRetargeting';

export const HUMANOID_PACK_ID = 'aetheria-humanoid-starter-v1';
export const HUMANOID_MOTION_VERSION = 8;
export const HUMANOID_MOTIONS = [
  {id:'idle',label:'Idle',duration:3,loop:true},
  {id:'walk',label:'Walk',duration:1.2,loop:true},
  {id:'run',label:'Run',duration:.78,loop:true},
  {id:'sprint',label:'Sprint',duration:.6,loop:true},
  {id:'jump',label:'Jump',duration:1.25,loop:false},
  {id:'dash',label:'Dash',duration:.55,loop:false},
  {id:'crouch',label:'Crouch',duration:2,loop:true},
  {id:'wave',label:'Wave',duration:2.2,loop:false},
  {id:'sit',label:'Sit',duration:3.2,loop:true},
  {id:'sitDown',label:'Sit Down',duration:1.15,loop:false},
  {id:'standUp',label:'Stand Up',duration:1.25,loop:false},
] as const;
export function humanoidMotionName(id: string) {return `Aetheria · ${HUMANOID_MOTIONS.find((motion)=>motion.id===id)?.label || id}`;}
export type HumanoidBodyProfile = NonNullable<AnimationSource['bodyProfile']>;
export type HumanoidGait = NonNullable<AnimationSource['gait']>;
export const DEFAULT_HUMANOID_GAIT: HumanoidGait = {strideLength:1,armSwing:1,bodyLean:0,bounce:1,kneeLift:1};
export const DEFAULT_HUMANOID_LAYOUT:HumanoidRigLayout={upperArmTwists:1,forearmTwists:1,upperLegTwists:0,lowerLegTwists:0,spineSegments:3,neckSegments:2,fingerSegments:3,shoulders:true,toeEnds:true,chest:true,glutes:true};
export function normalizeHumanoidLayout(value?:Partial<HumanoidRigLayout>):HumanoidRigLayout {
  const layout={...DEFAULT_HUMANOID_LAYOUT,...value};
  for(const key of ['upperArmTwists','forearmTwists','upperLegTwists','lowerLegTwists','fingerSegments','spineSegments','neckSegments'] as const){const min=key==='spineSegments'||key==='neckSegments'?1:0;const max=key==='neckSegments'?2:3;layout[key]=Number.isFinite(layout[key])?Math.min(max,Math.max(min,Math.round(layout[key]))):DEFAULT_HUMANOID_LAYOUT[key];}
  return layout;
}
let cachedPack: AnimationSource | undefined;
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

function legPose(height:number,footZ:number,footLift:number,pitch:number): [number,number,number] {
  const length=.43;const vertical=Math.max(.1,height-.08-(.06+footLift));
  const distance=Math.min(length*1.995,Math.max(.05,Math.hypot(vertical,footZ)));
  const bend=Math.acos(Math.max(-1,Math.min(1,(distance*distance-2*length*length)/(2*length*length))));
  const hip=Math.atan2(-footZ,vertical)-bend/2;
  return [hip,bend,pitch-hip-bend];
}

// Authored starter keyframes, generated locally; no model download or provider key.
export function builtinHumanoidPack(options?: Partial<HumanoidGait>, previous?: AnimationSource, bodyProfile: HumanoidBodyProfile = previous?.bodyProfile || 'neutral', requestedLayout?:Partial<HumanoidRigLayout>): AnimationSource {
  if(!options && !previous && !requestedLayout && cachedPack && bodyProfile==='neutral')return cachedPack;
  const gait={...DEFAULT_HUMANOID_GAIT,...options};
  const layout=normalizeHumanoidLayout(requestedLayout || previous?.rigLayout);
  const root=new Group();const bones=new Map<string,Bone>();
  const add=(name:string,parent:string|null,x:number,y:number,z=0)=>{
    const bone=new Bone();bone.name=name;bone.position.set(x,y,z);(parent?bones.get(parent)!:root).add(bone);bones.set(name,bone);
  };
  add('Hips',null,0,1);
  if(layout.spineSegments>=2)add('Spine','Hips',0,.14);
  if(layout.spineSegments>=3)add('Spine1','Spine',0,.08);
  add('Spine2',layout.spineSegments===3?'Spine1':layout.spineSegments===2?'Spine':'Hips',0,layout.spineSegments===3?.08:layout.spineSegments===2?.16:.3);
  add('Neck','Spine2',0,.29);
  if(layout.neckSegments===2)add('Neck1','Neck',0,.065);
  add('Head',layout.neckSegments===2?'Neck1':'Neck',0,layout.neckSegments===2?.065:.13);
  const chain=(name:string,parent:string,count:number,x:number,y:number)=>{
    let current=parent;
    for(let i=0;i<count;i++){const next=`${name}${i?i+1:''}`;add(next,current,x/(count+1),y/(count+1));current=next;}
    return current;
  };
  for(const [side,sign] of [['Left',1],['Right',-1]] as const){
    if(layout.chest){add(`${side}Chest`,'Spine2',sign*(bodyProfile==='female'?.085:bodyProfile==='male'?.07:.075),.06,bodyProfile==='female'?.085:.075);add(`${side}ChestEnd`,`${side}Chest`,sign*.025,.015,.025);}
    if(layout.shoulders)add(`${side}Shoulder`,'Spine2',sign*.12,.22);
    add(`${side}Arm`,layout.shoulders?`${side}Shoulder`:'Spine2',sign*(layout.shoulders?.12:.24),layout.shoulders?0:.22);
    const armParent=chain(`${side}ArmTwist`,`${side}Arm`,layout.upperArmTwists,sign*.28,0);
    add(`${side}ForeArm`,armParent,sign*.28/(layout.upperArmTwists+1),0);
    const forearmParent=chain(`${side}ForeArmTwist`,`${side}ForeArm`,layout.forearmTwists,sign*.24,0);
    add(`${side}Hand`,forearmParent,sign*.24/(layout.forearmTwists+1),0);
    if(layout.glutes){add(`${side}Glute`,'Hips',sign*(bodyProfile==='female'?.09:bodyProfile==='male'?.075:.08),-.05,-(bodyProfile==='female'?.075:.065));add(`${side}GluteEnd`,`${side}Glute`,sign*.02,-.02,-.035);}
    add(`${side}UpLeg`,'Hips',sign*.105,-.08);
    const thighParent=chain(`${side}UpLegTwist`,`${side}UpLeg`,layout.upperLegTwists,0,-.43);
    add(`${side}Leg`,thighParent,0,-.43/(layout.upperLegTwists+1));
    const shinParent=chain(`${side}LegTwist`,`${side}Leg`,layout.lowerLegTwists,0,-.43);
    add(`${side}Foot`,shinParent,0,-.43/(layout.lowerLegTwists+1));add(`${side}ToeBase`,`${side}Foot`,0,-.055,.16);
    if(layout.toeEnds)add(`${side}ToeEnd`,`${side}ToeBase`,0,0,.07);
    for(const [finger,z] of [['Thumb',.045],['Index',.032],['Middle',.01],['Ring',-.012],['Pinky',-.032]] as const){
      if(layout.fingerSegments>=1)add(`${side}Hand${finger}1`,`${side}Hand`,sign*(finger==='Thumb'?.035:.08),0,z);
      if(layout.fingerSegments>=2)add(`${side}Hand${finger}2`,`${side}Hand${finger}1`,sign*.028,0);
      if(layout.fingerSegments>=3)add(`${side}Hand${finger}3`,`${side}Hand${finger}2`,sign*.022,0);
    }
  }
  const clips=HUMANOID_MOTIONS.map((motion)=>{
    const frames=Math.ceil(motion.duration*60);const times=Array.from({length:frames+1},(_,index)=>index/frames*motion.duration);
    const values=new Map([...bones.keys()].map((name)=>[name,[] as number[]]));const positions:number[]=[];
    const rotation=new Quaternion(),partRotation=new Quaternion();
    for(let frame=0;frame<=frames;frame++){
      const t=frame/frames,phase=t*Math.PI*2;const pose=new Map<string,[number,number,number]>();let height=1,travel=0;
      const moving=['walk','run','sprint','dash'].includes(motion.id);
      const fast=motion.id==='run'||motion.id==='sprint'||motion.id==='dash';
      const crouch=motion.id==='crouch'?.65:0;
      let kneeBend=crouch,hipBend=-crouch*.5;
      pose.set('LeftArm',[.025,0,-1.38]);pose.set('RightArm',[.025,0,1.38]);
      pose.set('LeftForeArm',[0,-.15,0]);pose.set('RightForeArm',[0,.15,0]);
      if(moving){
        const stance=motion.id==='walk'?.62:motion.id==='run'?.44:.38;
        const reach=(motion.id==='walk'?.2:motion.id==='run'?.3:.35)*gait.strideLength;
        height=(motion.id==='walk'?.965:motion.id==='run'?.93:.91)+(fast?.025:.009)*Math.cos(phase*2)*gait.bounce;
        for(const [side,sign] of [['Left',1],['Right',-1]] as const){
          const u=(t+(side==='Right'?.5:0))%1;
          const inStance=u<stance;const swing=(u-stance)/(1-stance);
          const footZ=inStance?reach*(1-2*u/stance):-reach+2*reach*smooth(swing);
          const footLift=inStance?0:Math.pow(Math.sin(Math.PI*swing),1.7)*(fast?.15:.055)*gait.kneeLift;
          const pitch=inStance?-.1*(1-smooth(u/.1))+.22*smooth((u/stance-.75)/.25):-.12*Math.sin(Math.PI*swing);
          const contactLift=inStance?Math.max(0,.19*Math.sin(pitch)+.053*Math.cos(pitch)-.053):0;
          const [hip,knee,ankle]=legPose(height,footZ,footLift+contactLift,pitch);
          pose.set(`${side}UpLeg`,[hip,0,sign*.015]);pose.set(`${side}Leg`,[knee,0,0]);pose.set(`${side}Foot`,[ankle,0,0]);pose.set(`${side}ToeBase`,[-Math.max(0,pitch)*.45,0,0]);
          // Elbows lead the swing; wrists follow later. A small second harmonic
          // eases each reversal without a mechanical, locked-elbow pendulum.
          const armPhase=phase+(side==='Right'?Math.PI:0);
          const armSwing=Math.sin(armPhase+.12)+.1*Math.sin(2*armPhase+.24);
          const forward=(1+Math.sin(armPhase-.1))/2;
          pose.set(`${side}Arm`,[(fast?.63:.34)*armSwing*gait.armSwing,sign*(.025+.035*Math.sin(armPhase-.2))*gait.armSwing,-sign*(1.4-(fast?.07:.025)*Math.cos(armPhase))]);
          pose.set(`${side}ForeArm`,[0,-sign*((fast?.85:.2)+(fast?.3:.18)*forward*gait.armSwing),sign*.015*Math.sin(armPhase-.25)]);
          pose.set(`${side}Shoulder`,[.025*Math.sin(armPhase-.15),sign*(fast?.045:.025)*Math.sin(armPhase),sign*(fast?.035:.018)*Math.cos(armPhase)]);
          pose.set(`${side}Hand`,[(fast?.045:.025)*Math.sin(armPhase-.55),sign*.04*Math.sin(armPhase-.45),-sign*(.045+.035*Math.sin(armPhase-.5))]);
        }
        const lean=(motion.id==='walk'?.025:motion.id==='run'?.13:.22)+gait.bodyLean*Math.PI/180;
        pose.set('Hips',[0,.025*Math.sin(phase),.015*Math.sin(phase)]);
        const twist=(fast?.075:.055)*Math.sin(phase-.15)*gait.armSwing;
        pose.set('Spine',[lean*.5,-twist*.35,-.018*Math.sin(phase)]);
        pose.set('Spine1',[lean*.3+.009*Math.cos(phase*2),-twist*.4,.012*Math.sin(phase-.1)]);
        pose.set('Spine2',[lean*.2-.006*Math.cos(phase*2),-twist*.25,.009*Math.sin(phase-.2)]);
        pose.set('Neck',[-lean*.65,twist*.45,0]);
        pose.set('Neck1',[-lean*.2,twist*.2,-.008*Math.sin(phase-.2)]);
        pose.set('Head',[-lean*.15,twist*.2,0]);
        travel=t*(2*reach/stance);
      }
      if(motion.id==='jump'){
        const anticipate=Math.sin(Math.min(t/.2,1)*Math.PI/2)*(t<.2?1:Math.max(0,1-(t-.2)/.15));
        const air=t>=.25&&t<=.8?Math.sin((t-.25)/.55*Math.PI):0;
        const land=t>.8?Math.sin((t-.8)/.2*Math.PI):0;
        kneeBend=anticipate*.85+air*.75+land*.7;hipBend=-kneeBend*.5;height=.14+.86*Math.cos(kneeBend/2)+air*.7;
        pose.set('LeftArm',[-air*.7,0,-1.2+air*.3]);pose.set('RightArm',[-air*.7,0,1.2-air*.3]);
      }
      if(motion.id==='crouch'){kneeBend=1.2;hipBend=-.6;height=.14+.86*Math.cos(.6);pose.set('Spine',[.18,0,0]);}
      if(motion.id==='crouch'||motion.id==='jump')for(const side of ['Left','Right']){pose.set(`${side}UpLeg`,[hipBend,0,0]);pose.set(`${side}Leg`,[kneeBend,0,0]);pose.set(`${side}Foot`,[hipBend,0,0]);}
      if(motion.id==='idle'){pose.set('Spine',[Math.sin(phase)*.012,Math.sin(phase)*.007,.008*Math.sin(phase)]);pose.set('Neck',[-.004*Math.sin(phase),0,0]);height+=Math.sin(phase)*.003;}
      if(motion.id==='wave'){
        const envelope=Math.sin(Math.PI*t);pose.set('RightArm',[0,0,1.38-envelope*2.6]);pose.set('RightForeArm',[0,envelope*1.3,0]);pose.set('RightHand',[0,0,envelope*.3*Math.sin(phase*3)]);
      }
      if(motion.id==='dash'){const burst=Math.pow(Math.sin(Math.PI*t),.8);pose.set('Spine',[burst*.48+gait.bodyLean*Math.PI/180,0,0]);pose.set('Neck',[-burst*.16,0,0]);travel=2*smooth(t);}
      if(motion.id==='sit'||motion.id==='sitDown'||motion.id==='standUp'){
        const seated=motion.id==='sit'?1:motion.id==='sitDown'?smooth(t):1-smooth(t);
        const hip=-Math.PI/2*seated,knee=Math.PI/2*seated;
        height=.14+.43*Math.cos(hip)+.43;
        for(const [side,sign] of [['Left',1],['Right',-1]] as const){pose.set(`${side}UpLeg`,[hip,0,sign*.025*seated]);pose.set(`${side}Leg`,[knee,0,0]);pose.set(`${side}Foot`,[0,0,0]);pose.set(`${side}Arm`,[-.03*seated,0,-sign*(1.38+seated*.42)]);pose.set(`${side}ForeArm`,[0,-sign*(.15+seated*.35),0]);}
        pose.set('Spine',[seated*.035+Math.sin(phase)*.005*seated,0,0]);pose.set('Neck',[-seated*.02,0,0]);
      }
      // Small distributed rotations keep the torso, wrists and hands from
      // moving as rigid blocks. Finger curl stays gentle outside the wave.
      const sway=moving?Math.sin(phase):Math.sin(phase)*.3;
      if(!pose.has('Spine1'))pose.set('Spine1',[Math.sin(phase-.15)*.007,-sway*.016,0]);
      if(!pose.has('Spine2'))pose.set('Spine2',[Math.sin(phase-.3)*.005,sway*.009,-sway*.01]);
      if(!pose.has('Neck1'))pose.set('Neck1',[-Math.sin(phase-.2)*.005,0,0]);
      for(const [side,sign] of [['Left',1],['Right',-1]] as const){
        if(!pose.has(`${side}Shoulder`))pose.set(`${side}Shoulder`,[Math.sin(phase-.2)*sign*.012,0,sign*.008*Math.cos(phase)]);
        pose.set(`${side}ArmTwist`,[sign*sway*.035,0,0]);pose.set(`${side}ForeArmTwist`,[-sign*sway*.025,0,0]);
        if(!pose.has(`${side}Hand`))pose.set(`${side}Hand`,[0,sign*.025*Math.sin(phase-.15),-sign*.04]);
        for(const finger of ['Thumb','Index','Middle','Ring','Pinky'])for(let joint=1;joint<=3;joint++){
          const relaxed=motion.id==='wave'&&side==='Right'?.035:motion.id==='sit'?.12:fast?.25:.16;
          pose.set(`${side}Hand${finger}${joint}`,[0,finger==='Thumb'?-sign*.35:0,-sign*(relaxed+Math.sin(phase-.15*joint)*.015)*(joint===1?.75:1)]);
        }
      }
      positions.push(0,height,travel);
      for(const name of bones.keys()){
        const names=name==='Spine2'?[...(!bones.has('Spine')?['Spine']:[]),...(!bones.has('Spine1')?['Spine1']:[]),name]:name==='Head'&&!bones.has('Neck1')?['Neck1',name]:!layout.shoulders&&/^(Left|Right)Arm$/.test(name)?[name.replace('Arm','Shoulder'),name]:[name];
        rotation.identity();for(const part of names){const [x,y,z]=pose.get(part)||[0,0,0];rotation.multiply(partRotation.setFromEuler(new Euler(x,y,z)));}rotation.toArray(values.get(name)!,values.get(name)!.length);
      }
    }
    const tracks=[...values].map(([name,keys])=>new QuaternionKeyframeTrack(`${name}.quaternion`,times,keys).optimize());
    return new AnimationClip(humanoidMotionName(motion.id),motion.duration,[...tracks,new VectorKeyframeTrack('Hips.position',times,positions).optimize()]);
  });
  const pack=captureAnimationSource(root,clips,'Aetheria humanoid starter');pack.id=HUMANOID_PACK_ID;pack.builtin=HUMANOID_PACK_ID;
  pack.motionVersion=HUMANOID_MOTION_VERSION;pack.bodyProfile=bodyProfile;pack.rigLayout=layout;
  pack.sampleRate=60;
  pack.clips.forEach((clip,index)=>{clip.name=humanoidMotionName(HUMANOID_MOTIONS[index].id);});
  pack.looping=Object.fromEntries(HUMANOID_MOTIONS.map((motion)=>[humanoidMotionName(motion.id),motion.loop]));
  pack.gait=gait;
  // Keep channel identifiers stable when editing an installed pack so manual
  // bone assignments and per-joint corrections survive regeneration.
  const reference=previous||cachedPack;
  if(reference){
    const aliases=new Map([...Object.entries(reference.boneAliases||{}),...Object.entries(reference.bones).map(([key,bone])=>[bone.name,key] as [string,string])]);
    const replacements=new Map(Object.entries(pack.bones).map(([key,bone])=>[key,aliases.get(bone.name)||key]));
    pack.bones=Object.fromEntries(Object.entries(pack.bones).map(([key,bone])=>[replacements.get(key)!,bone]));
    for(const clip of pack.clips)for(const track of clip.tracks){const dot=track.name.lastIndexOf('.');track.name=`${replacements.get(track.name.slice(0,dot))||track.name.slice(0,dot)}${track.name.slice(dot)}`;}
  }
  pack.boneAliases={...reference?.boneAliases,...Object.fromEntries(Object.entries(reference?.bones||{}).map(([alias,bone])=>[bone.name,alias])),...Object.fromEntries(Object.entries(pack.bones).map(([alias,bone])=>[bone.name,alias]))};
  if(!options && !previous && !requestedLayout && bodyProfile==='neutral')cachedPack=pack;return previous?.rigEdits?.length?replayAnimationRigEdits(pack,previous.rigEdits):pack;
}
