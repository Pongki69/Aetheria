import { generateAgentResponse } from '../services/aiService';
import { useAgentStore } from '../store/useAgentStore';

export const handleSendMessage = async (agentId: string, userText: string) => {
  const store = useAgentStore.getState();
  const agent = store.agents.find((a) => a.id === agentId);
  if (!agent) return;

  // 1. Add User Message
  store.addMessage(agentId, 'user', userText);
  store.updateAgentStatus(agentId, 'thinking', 'Formulating response...');

  // 2. Call the configured model service with the agent's role and rules.
  const { text, providerUsed } = await generateAgentResponse(
    agent.name,
    agent.role,
    agent.config,
    userText,
    agent.messages
  );

  // 4. Save Response & Reset Status
  store.addMessage(agentId, 'agent', text, providerUsed);
  store.updateAgentStatus(agentId, 'working', 'Task finished');
};
