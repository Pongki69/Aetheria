import { useCallback, useRef, useState } from 'react';

export type EditHistory = {undo:()=>void;redo:()=>void;canUndo:boolean;canRedo:boolean};
export function useEditHistory<T>(value:T,onChange?: (value:T)=>void,scope?:string) {
  const current=useRef(value);current.current=value;
  const past=useRef<T[]>([]),future=useRef<T[]>([]),group=useRef(false),recorded=useRef(false);
  const previousScope=useRef(scope);
  if(previousScope.current!==scope){past.current=[];future.current=[];group.current=false;recorded.current=false;previousScope.current=scope;}
  const callback=useRef(onChange);callback.current=onChange;
  const [,refresh]=useState(0);
  const commit=useCallback((next:T)=>{
    if(!callback.current||next===current.current)return;
    if(!group.current||!recorded.current){past.current=[...past.current.slice(-19),current.current];recorded.current=true;}
    future.current=[];current.current=next;callback.current(next);refresh((n)=>n+1);
  },[]);
  const undo=useCallback(()=>{const previous=past.current.pop();if(previous===undefined||!callback.current)return;future.current.push(current.current);current.current=previous;callback.current(previous);refresh((n)=>n+1);},[]);
  const redo=useCallback(()=>{const next=future.current.pop();if(next===undefined||!callback.current)return;past.current.push(current.current);current.current=next;callback.current(next);refresh((n)=>n+1);},[]);
  return {commit,undo,redo,canUndo:!!past.current.length,canRedo:!!future.current.length,begin:()=>{group.current=true;recorded.current=false;},end:()=>{group.current=false;recorded.current=false;}};
}
