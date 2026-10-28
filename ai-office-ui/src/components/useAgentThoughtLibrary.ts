import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AgentData } from '../types';
import { appendThoughts, generateAgentThoughts, updateSavedThoughts } from '../services/agentThoughtLibrary';

export function useAgentThoughtLibrary(ownerId: string | undefined, setAgents: Dispatch<SetStateAction<AgentData[]>>) {
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const requests = useRef(new Map<string, AbortController>());
  const owner = useRef(ownerId); owner.current = ownerId;
  useEffect(() => {
    setStatuses({}); setGenerating({});
    const pending = requests.current;
    return () => {pending.forEach((controller) => controller.abort()); pending.clear();};
  }, [ownerId]);
  const apply = (id: string, thoughts: string[]) => setAgents((agents) => agents.map((agent) => agent.id === id ? {...agent, savedThoughts: thoughts} : agent));
  const generate = async (agent: AgentData) => {
    if (!ownerId || requests.current.has(agent.id) || agent.status === 'OFFLINE') return;
    const controller = new AbortController(); requests.current.set(agent.id, controller);
    setGenerating((state) => ({...state, [agent.id]: true}));
    setStatuses((state) => ({...state, [agent.id]: 'Generating 10 thoughts…'}));
    const timer = setTimeout(() => controller.abort(), 125_000);
    try {
      const batch = await generateAgentThoughts(agent, controller.signal);
      if (owner.current !== ownerId || controller.signal.aborted) return;
      const thoughts = await updateSavedThoughts(agent.id, ownerId, (current) => appendThoughts(current, batch));
      if (owner.current !== ownerId) return;
      apply(agent.id, thoughts);
      setStatuses((state) => ({...state, [agent.id]: 'Thoughts saved. Review the list below; only kept thoughts will play.'}));
    } catch (error) {
      if (owner.current === ownerId) setStatuses((state) => ({...state, [agent.id]: controller.signal.aborted ? 'Generation timed out. Your saved thoughts are unchanged.' : error instanceof Error ? error.message : 'Could not save thoughts. Try again.'}));
    } finally {
      clearTimeout(timer);
      if (requests.current.get(agent.id) === controller) {
        requests.current.delete(agent.id);
        setGenerating((state) => ({...state, [agent.id]: false}));
      }
    }
  };
  const remove = async (id: string, text: string) => {
    if (!ownerId) return;
    try {
      const thoughts = await updateSavedThoughts(id, ownerId, (current) => current.filter((thought) => thought !== text));
      if (owner.current === ownerId) apply(id, thoughts);
    } catch {
      if (owner.current === ownerId) setStatuses((state) => ({...state, [id]: 'Could not remove this thought. Try again.'}));
    }
  };
  return {statuses, generating, generate, remove};
}
