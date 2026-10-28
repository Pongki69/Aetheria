import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { Vector3 } from 'three';
import { nearestRigJoints } from '../services/rigJointPicking';

export function RigJointPicking({points,onPick,onClear,onHover,onChoices}: {points:Vector3[];onPick:(index:number)=>void;onClear:()=>void;onHover:(index:number|null)=>void;onChoices:(value:{indices:number[];x:number;y:number}|null)=>void}) {
  const {camera,gl}=useThree();const latest=useRef({points,onPick,onClear,onHover,onChoices});latest.current={points,onPick,onClear,onHover,onChoices};
  useEffect(()=>{
    const canvas=gl.domElement;
    let down:{id:number;x:number;y:number;moved:boolean}|null=null;
    const pointers=new Set<number>();
    const start=(event:PointerEvent)=>{
      pointers.add(event.pointerId);latest.current.onChoices(null);
      if(event.button!==0||pointers.size>1){down=null;return;}
      down={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
    };
    const trackDrag=(event:PointerEvent)=>{
      if(down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>4)down.moved=true;
    };
    const move=(event:PointerEvent)=>{
      trackDrag(event);
      if(event.buttons||pointers.size>1){latest.current.onHover(null);return;}
      const candidates=nearestRigJoints(latest.current.points,camera,canvas.getBoundingClientRect(),event.clientX,event.clientY);
      latest.current.onHover(candidates[0]?.index??null);canvas.style.cursor=candidates.length?'pointer':'grab';
    };
    const finish=(event:PointerEvent)=>{
      pointers.delete(event.pointerId);
      if(!down||down.id!==event.pointerId)return;
      const gesture=down;down=null;
      if(gesture.moved||Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>4)return;
      const rect=canvas.getBoundingClientRect();
      const candidates=nearestRigJoints(latest.current.points,camera,rect,event.clientX,event.clientY,event.pointerType==='touch'?16:10);
      if(!candidates.length){latest.current.onClear();return;}
      // Nearly coincident dots need a deliberate choice instead of silently
      // choosing a different bone because it happens to be closer to the camera.
      const close=candidates.filter((candidate)=>candidate.distance<=candidates[0].distance+3);
      if(close.length>1)latest.current.onChoices({indices:close.map((item)=>item.index),x:event.clientX-rect.left,y:event.clientY-rect.top});
      else latest.current.onPick(candidates[0].index);
    };
    const cancel=(event:PointerEvent)=>{pointers.delete(event.pointerId);down=null;};
    const leave=()=>{latest.current.onHover(null);};
    canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerleave',leave);
    window.addEventListener('pointermove',trackDrag);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);
    return()=>{canvas.removeEventListener('pointerdown',start);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);window.removeEventListener('pointermove',trackDrag);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);canvas.style.cursor='';};
  },[camera,gl]);
  return null;
}
