import { useMemo, useState } from 'react';
import type { Group } from 'three';
import type { AnimationRetargeting, AnimationSource } from '../services/animationRetargeting';
import { animationMappingIssues, repairAnimationMappingIssues } from '../services/animationMappingChecks';

export function AnimationMappingChecks({scene,source,config,onChange,onSelect}: {scene:Group;source:AnimationSource;config:AnimationRetargeting;onChange?:(value:AnimationRetargeting)=>void;onSelect:(alias:string)=>void}) {
  const issues=useMemo(()=>animationMappingIssues(scene,source,config.boneMap),[scene,source,config.boneMap]);
  const [notice,setNotice]=useState('');
  if(!issues.length&&!notice)return null;
  return <section className="agent-mapping-checks" aria-label="Animation mapping checks">
    {!!issues.length&&<><h3>Check model mappings ({issues.length})</h3><p>These pairings can twist or fold this model. Review them before assuming the mesh is damaged.</p>
      <ul>{issues.map((issue)=><li key={issue.alias}><button type="button" onClick={()=>onSelect(issue.alias)}>{issue.sourceName} → {issue.targetName}</button><span>{issue.reason}</span></li>)}</ul>
      <button type="button" disabled={!onChange} onClick={()=>{const result=repairAnimationMappingIssues(scene,source,config);onChange?.(result.config);setNotice(`Repaired ${result.repaired} mappings${result.unassigned?`; ${result.unassigned} channels need a target bone`:''}. Preview the motion, then save model changes.`);}}>Repair flagged mappings</button>
      <small>Changes only flagged pairings and their rotation corrections for this animation rig on this agent. Other mappings, animations, and agents are kept.</small></>}
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
