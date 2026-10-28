import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AgentData } from '../types';
import { AgentModelPreview } from './AgentModelPreview';
import { DEFAULT_RETARGETING } from '../services/animationRetargeting';

export type AgentModelChanges = Pick<AgentData, 'modelHiddenParts' | 'modelRotation' | 'scale' | 'modelUseVertexColors' | 'animationRetargeting' | 'idleAnimation' | 'walkingAnimation'>;

export function AgentModelEditor({ agent, onSave, onClose, ownerId }: { agent: AgentData; onSave: (changes: AgentModelChanges) => Promise<void>; onClose: () => void; ownerId?: string }) {
  const [hiddenParts, setHiddenParts] = useState<string[]>(() => [...(agent.modelHiddenParts || [])]);
  const [rotation, setRotation] = useState<[number, number, number]>(() => [...(agent.modelRotation || [0, 0, 0])]);
  const [scale, setScale] = useState(agent.scale || 1);
  const [useVertexColors, setUseVertexColors] = useState(agent.modelUseVertexColors);
  const [retargeting, setRetargeting] = useState(agent.animationRetargeting || DEFAULT_RETARGETING);
  const [idleAnimation, setIdleAnimation] = useState(agent.idleAnimation || '');
  const [walkingAnimation, setWalkingAnimation] = useState(agent.walkingAnimation || '');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const onReady = useCallback((value: boolean) => setReady(value), []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previous?.focus();
  }, []);
  const save = async () => {
    setSaving(true); setError('');
    try { await onSave({ modelHiddenParts: hiddenParts, modelRotation: rotation, scale, modelUseVertexColors: useVertexColors, animationRetargeting:retargeting, idleAnimation, walkingAnimation }); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save model changes.'); setSaving(false); }
  };
  return <div className="agent-model-editor-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }} onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === 'Escape' && !saving) onClose();
    if (event.key === 'Tab') {
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, select, [tabindex="0"]'));
      const first = targets[0]; const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <section className="agent-model-editor" role="dialog" aria-modal="true" aria-labelledby="agent-model-editor-title">
      <header><div><span>MODEL APPEARANCE</span><h2 id="agent-model-editor-title">{agent.name}</h2></div><button ref={closeButton} type="button" aria-label="Close model editor" disabled={saving} onClick={onClose}><X size={20} /></button></header>
      <div className="agent-deploy-form">
        <div className="agent-deploy-preview-column"><AgentModelPreview presetOwnerId={ownerId} url={agent.modelUrl} hiddenParts={hiddenParts} rotation={rotation} onHiddenParts={setHiddenParts} onRotation={setRotation} onReady={onReady} useVertexColors={useVertexColors} onUseVertexColors={setUseVertexColors} animationRetargeting={retargeting} onAnimationRetargeting={setRetargeting} idleAnimation={idleAnimation} walkingAnimation={walkingAnimation} onIdleAnimation={setIdleAnimation} onWalkingAnimation={setWalkingAnimation} /></div>
        <div className="agent-model-editor-settings">
          <h3>Preview & edit</h3><p>Drag to inspect the character. Uncheck mesh objects to hide them, or use Show all to restore every part.</p>
          <label>World model size<div className="deploy-scale-controls"><input type="range" min="0.01" max="10" step="0.01" value={scale} onChange={(event) => setScale(Number(event.target.value))} /><input type="number" aria-label="World model size value" min="0.01" max="10" step="0.01" key={scale} defaultValue={scale} onBlur={(event) => { const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value)) setScale(Math.min(10, Math.max(0.01, value))); }} /></div></label>
          <h3>Orientation</h3><div className="agent-model-rotation-inputs">{(['X', 'Y', 'Z'] as const).map((axis, index) => <label key={axis}>Rotate {axis} (°)<input type="number" step="1" value={Math.round(rotation[index] * 180 / Math.PI)} onChange={(event) => { const degrees = event.currentTarget.valueAsNumber; if (Number.isFinite(degrees)) setRotation((previous) => previous.map((angle, i) => i === index ? degrees * Math.PI / 180 : angle) as [number, number, number]); }} /></label>)}</div>
          <p>Changes stay in this preview until you save. Model size applies in the world; the preview automatically fits the character.</p>
          {error && <p role="alert" className="agent-model-save-error">{error}</p>}
          <footer><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="button" disabled={!ready || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save model changes'}</button></footer>
        </div>
      </div>
    </section>
  </div>;
}
