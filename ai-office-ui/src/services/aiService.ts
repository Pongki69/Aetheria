
import { authRequest, getAuthToken } from './authClient';

export const AVAILABLE_MODELS = [
  { id: 'auto', name: 'Auto · configured hosted models' },
  { id: 'openrouter', name: 'OpenRouter · free model catalog' },
  { id: 'gemini', name: 'Gemini · available models' },
  { id: 'groq', name: 'Groq · available models' },
  { id: 'lmstudio', name: 'LM Studio · local models' },
];

type ModelOption = { id: string; name: string; provider: 'openrouter' | 'gemini' | 'groq' | 'lmstudio'; free: boolean; local: boolean };
type ChatResult = { text: string; providerUsed: string };
let activeModelId = 'auto';

export function setActiveModel(modelId: string) { activeModelId = modelId; }
export function getActiveModel(modelId?: string) { return modelId || activeModelId; }

export async function generateAgentResponse(
  agentName: string,
  agentRole: string,
  config: { taskGoal?: string; strictRules?: string; responsePersona?: string; assignedModelId?: string },
  prompt: string,
  history: Array<{ sender: 'user' | 'agent'; text: string }> = []
): Promise<ChatResult> {
  const token = getAuthToken();
  if (!token) throw new Error('Sign in to use connected AI models.');
  const models = await authRequest<ModelOption[]>('/api/ai/models', {}, token);
  const assigned = config.assignedModelId || activeModelId;
  let model = models.find((option) => option.id === assigned || `${option.provider}:${option.id}` === assigned);
  if (!model && (assigned === 'auto' || assigned === 'openrouter')) model = models.find((option) => option.provider === 'openrouter' && option.id === 'openrouter/free');
  if (!model) model = models[0];
  if (!model) throw new Error('No AI providers are configured. Add a provider key or start LM Studio.');
  const systemInstruction = `You are ${agentName}, a ${agentRole}.\nGoal: ${config.taskGoal || 'Help the user.'}\nRules: ${config.strictRules || 'Be accurate, helpful, and clear.'}\nPersona: ${config.responsePersona || 'Friendly and concise.'}`;
  const previous = history.slice(-12).map((message) => `${message.sender === 'user' ? 'User' : agentName}: ${message.text}`).join('\n');
  return authRequest<ChatResult>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ provider: model.provider, modelId: model.id, localModelProfile: 'medium', prompt: `${previous ? `Recent conversation:\n${previous}\n\n` : ''}${prompt}`, systemInstruction })
  }, token);
}
