import { create } from 'zustand';

export type AgentStatus = 'idle' | 'working' | 'thinking' | 'error';

export interface AgentMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  providerUsed?: string;
  timestamp: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  currentTask: string;
  gridX: number;
  gridY: number;
  messages: AgentMessage[];
  config: {
    taskGoal: string;
    strictRules: string;
  };
}

interface AgentStore {
  agents: Agent[];
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
  updateAgentStatus: (id: string, status: AgentStatus, task?: string) => void;
  moveAgent: (id: string, gridX: number, gridY: number) => void;
  addMessage: (id: string, sender: 'user' | 'agent', text: string, providerUsed?: string) => void;
  stopAgent: (id: string) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  selectedAgentId: '1',
  agents: [
    {
      id: '1',
      name: 'Mint',
      role: 'Research Assistant',
      status: 'idle',
      currentTask: 'Resting',
      gridX: 5,
      gridY: 5,
      messages: [],
      config: {
        taskGoal: 'Help research code and structure applications.',
        strictRules: 'Be direct, helpful, and polite.',
      },
    },
    {
      id: '2',
      name: 'Anya',
      role: 'Project Manager',
      status: 'idle',
      currentTask: 'Chilling',
      gridX: 15,
      gridY: 5,
      messages: [],
      config: {
        taskGoal: 'Manage project tasks and give witty advice.',
        strictRules: 'Keep messages fun and concise.',
      },
    },
  ],

  selectAgent: (id) => set({ selectedAgentId: id }),

  updateAgentStatus: (id, status, currentTask) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id
          ? {
              ...agent,
              status,
              currentTask: currentTask !== undefined ? currentTask : agent.currentTask,
            }
          : agent
      ),
    })),

  moveAgent: (id, gridX, gridY) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id ? { ...agent, gridX, gridY } : agent
      ),
    })),

  addMessage: (id, sender, text, providerUsed) =>
    set((state) => ({
      agents: state.agents.map((agent) => {
        if (agent.id !== id) return agent;
        const newMessage: AgentMessage = {
          id: Math.random().toString(),
          sender,
          text,
          providerUsed,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        return {
          ...agent,
          messages: [...agent.messages, newMessage],
        };
      }),
    })),

  stopAgent: (id) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id
          ? {
              ...agent,
              status: 'idle',
              currentTask: 'Resting / Stopped',
            }
          : agent
      ),
    })),
}));