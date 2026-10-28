import { useEffect, useState } from 'react';
import type { AnimationClip, Group } from 'three';
import { applyMotionPreset, createMotionPreset, motionPresetDb, type MotionPreset } from '../services/motionPresets';
import type { AnimationRetargeting } from '../services/animationRetargeting';

type Props = {
  ownerId?: string; scene: Group; clips: AnimationClip[]; config: AnimationRetargeting;
  idleAnimation?: string; walkingAnimation?: string;
  onApply: (config: AnimationRetargeting, idle: string, walk: string) => void;
};
export function MotionPresetLibrary({ownerId='local',scene,clips,config,idleAnimation,walkingAnimation,onApply}: Props) {
  const [presets,setPresets] = useState<MotionPreset[]>([]);
  const [name,setName] = useState('');
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  useEffect(() => {let cancelled = false; void motionPresetDb.presets.where('ownerId').equals(ownerId).reverse().sortBy('createdAt').then((items) => {if (!cancelled) setPresets(items);}).catch(() => {if (!cancelled) setError('Could not load presets from this browser.');}); return () => {cancelled=true;};}, [ownerId]);
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const preset = createMotionPreset(scene,clips,config,name,ownerId,idleAnimation,walkingAnimation);
      await motionPresetDb.presets.add(preset); setPresets((items) => [preset,...items]); setName(''); setNotice('Preset saved in this browser. Reuse it on any of your agents.');
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Could not save this preset.');}
    finally {setBusy(false);}
  };
  return <section className="agent-motion-presets" aria-label="Motion presets"><h3>Saved motion presets</h3><p>Keep animations, bone assignments, speed, and idle/walk choices for reuse. Presets are saved in this browser.</p>
    <label>Preset name<input aria-label="Motion preset name" value={name} maxLength={80} placeholder="e.g. Relaxed idle and walk" onChange={(event) => setName(event.target.value)} /></label>
    <button type="button" disabled={busy || !name.trim() || (!clips.length && !Object.keys(config.boneAdjustments || {}).length && !config.rebindSkeleton && !config.skeletonPlacement)} onClick={() => void save()}>{busy ? 'Saving preset…' : 'Save motion preset'}</button>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!presets.length && <p>No saved presets yet.</p>}
    {presets.map((preset) => <div className="agent-motion-preset" key={preset.id}><strong>{preset.name}</strong><small>{preset.config.sources?.reduce((total,source) => total+source.clips.length,0) || 0} clips · {preset.config.speed}×</small><div>
      <button type="button" disabled={busy} aria-label={`Preview preset ${preset.name}`} onClick={() => {const result = applyMotionPreset(scene,preset); onApply(result.config,preset.idleAnimation,preset.walkingAnimation); setError(''); setNotice(result.unmatched ? `Preset loaded. ${result.unmatched} bone assignments need mapping for this skeleton.` : 'Preset loaded for preview. Save model changes or deploy to keep it on this agent.');}}>Preview & use</button>
      <button type="button" disabled={busy} aria-label={`Delete preset ${preset.name}`} onClick={() => {setBusy(true); void motionPresetDb.presets.delete(preset.id).then(() => setPresets((items) => items.filter((item) => item.id !== preset.id))).catch(() => setError('Could not delete this preset.')).finally(() => setBusy(false));}}>Delete</button>
    </div></div>)}
  </section>;
}
