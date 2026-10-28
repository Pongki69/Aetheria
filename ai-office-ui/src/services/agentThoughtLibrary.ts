import { db } from '../db/database';
import type { AgentData } from '../types';
import { authRequest, getAuthToken } from './authClient';
import { characterVoiceInstruction } from './agentPersona';
import { parseThoughtBatch } from './agentThoughts';

export async function generateAgentThoughts(agent: AgentData, signal: AbortSignal) {
  const token = getAuthToken();
  if (!token) throw new Error('Sign in again to generate thoughts.');
  const result = await authRequest<{text: string}>('/api/ai/chat', {
    method: 'POST', signal,
    body: JSON.stringify({
      purpose: 'ambient-thought', provider: agent.aiProvider || 'openrouter', modelId: agent.aiModelId || 'openrouter/free', localModelProfile: agent.localModelProfile || 'medium',
      systemInstruction: `${characterVoiceInstruction(agent.statusText)}\nWrite exactly 10 distinct original first-person fictional thoughts for this character in a virtual 3D world. This is creative roleplay, not private reasoning. Each thought must stand alone and contain at most 24 words. Vary the mood and subject while keeping the character's voice. Never claim real tasks were completed or tools used. Return ONLY a valid JSON array of 10 strings, without markdown or labels.`,
      prompt: `Current activity: ${agent.status}. Create a batch of 10 characterful thoughts that can be shown independently in random order.`
    })
  }, token);
  return parseThoughtBatch(result.text);
}

// Read the latest list inside the write transaction so generation cannot undo
// removals made while the model was responding, or recreate a deleted agent.
export async function updateSavedThoughts(id: string, ownerId: string, edit: (current: string[]) => string[]) {
  return db.transaction('rw', db.agents, async () => {
    const agent = await db.agents.get(id);
    if (!agent || agent.ownerId !== ownerId) throw new Error('This agent is no longer available.');
    const thoughts = edit(agent.savedThoughts || []);
    await db.agents.update(id, {savedThoughts: thoughts});
    return thoughts;
  });
}

export function appendThoughts(current: string[], batch: string[]) {
  const seen = new Set(current.map((text) => text.toLowerCase()));
  return [...current, ...batch.filter((text) => {
    const key = text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  })];
}
