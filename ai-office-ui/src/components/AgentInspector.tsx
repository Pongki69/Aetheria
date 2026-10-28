import React, { useState, useRef, useEffect } from 'react';
import { useAgentStore } from '../store/useAgentStore';
import type { AgentStatus } from '../store/useAgentStore';
import { generateAgentResponse, getActiveModel } from '../services/aiService';
import { Send, X, Bot, CheckCircle2, Loader2, AlertCircle, Edit3, Cpu, Sparkles, Sliders, Plus, ChevronDown, ChevronUp } from 'lucide-react';

interface AgentInspectorProps {
  onCloseMobile?: () => void;
}

const getStatusBadge = (status: AgentStatus) => {
  switch (status) {
    case 'working':
      return { text: 'Working', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> };
    case 'thinking':
      return { text: 'Thinking', class: 'bg-amber-500/20 text-amber-400 border-amber-500/40', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> };
    case 'error':
      return { text: 'Error', class: 'bg-rose-500/20 text-rose-400 border-rose-500/40', icon: <AlertCircle className="w-3.5 h-3.5" /> };
    default:
      return { text: 'Idle', class: 'bg-blue-500/20 text-blue-400 border-blue-500/40', icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
  }
};

export const AgentInspector: React.FC<AgentInspectorProps> = ({ onCloseMobile }) => {
  const {
    agents,
    customModels,
    selectedAgentId,
    selectAgent,
    addMessage,
    updateAgentStatus,
    updateAgentRole,
    updateAgentConfig,
    addCustomModel,
  } = useAgentStore();

  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat');
  const [isEditingRole, setIsEditingRole] = useState(false);

  const [showModelDetails, setShowModelDetails] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelGoal, setNewModelGoal] = useState('');
  const [newModelRules, setNewModelRules] = useState('');
  const [newModelContext, setNewModelContext] = useState('');

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedAgent) {
      setEditName(selectedAgent.name);
      setEditRole(selectedAgent.role);
    }
  }, [selectedAgent?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedAgent?.messages]);

  const handleClose = () => {
    selectAgent(null);
    if (onCloseMobile) onCloseMobile();
  };

  if (!selectedAgent) {
    return (
      <div className="h-full flex flex-col justify-between p-6 text-slate-400 overflow-y-auto">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bot className="w-6 h-6 text-blue-500" />
              <h2 className="text-xl font-bold text-slate-100">AI Agents</h2>
            </div>
            {onCloseMobile && (
              <button onClick={onCloseMobile} className="lg:hidden p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Select an agent to assign specific job goals, strict rules, custom models, and chat live.
          </p>

          <div className="space-y-2.5 pt-2">
            <div className="text-xs font-bold uppercase text-slate-500 tracking-wider">Active Teammates</div>
            {agents.map((agent) => {
              const badge = getStatusBadge(agent.status);
              return (
                <button
                  key={agent.id}
                  onClick={() => selectAgent(agent.id)}
                  className="w-full text-left p-3 rounded-xl bg-[#131b2e] hover:bg-[#1a243d] border border-slate-800/80 transition-all flex items-center justify-between group"
                >
                  <div>
                    <div className="font-medium text-slate-200 group-hover:text-blue-400 transition-colors">
                      {agent.name}
                    </div>
                    <div className="text-xs text-slate-400">{agent.role}</div>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold flex items-center gap-1.5 ${badge.class}`}>
                    {badge.icon}
                    <span>{badge.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editRole.trim()) return;
    updateAgentRole(selectedAgent.id, editName.trim(), editRole.trim());
    setIsEditingRole(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    setInputText('');

    addMessage(selectedAgent.id, 'user', userText);
    updateAgentStatus(selectedAgent.id, 'thinking', userText);

    const response = await generateAgentResponse(
      selectedAgent.name,
      selectedAgent.role,
      selectedAgent.config,
      userText,
      selectedAgent.messages
    );

    updateAgentStatus(selectedAgent.id, 'working', userText);
    addMessage(selectedAgent.id, 'agent', response.text, response.modelUsed);
  };

  const handleAddModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelName.trim()) return;

    const modelId = `custom-${Date.now()}`;
    const defaultConfig = {
      taskGoal: newModelGoal.trim() || selectedAgent.config.taskGoal,
      strictRules: newModelRules.trim() || selectedAgent.config.strictRules,
      contextParams: newModelContext.trim() || selectedAgent.config.contextParams,
    };

    addCustomModel({
      id: modelId,
      name: newModelName.trim(),
      provider: 'custom',
      defaultConfig,
    });

    updateAgentConfig(selectedAgent.id, {
      assignedModelId: modelId,
      ...defaultConfig,
    });

    setNewModelName('');
    setNewModelGoal('');
    setNewModelRules('');
    setNewModelContext('');
    setShowModelDetails(false);
  };

  const activeModel = getActiveModel(selectedAgent.config.assignedModelId);
  const statusBadge = getStatusBadge(selectedAgent.status);

  return (
    <div className="h-full flex flex-col justify-between p-4 sm:p-5 relative overflow-hidden bg-[#0d121f]">
      {/* Header */}
      <div className="pb-3 border-b border-slate-800/80">
        <div className="flex items-center justify-between">
          {!isEditingRole ? (
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-wide">{selectedAgent.name}</h2>
                <button
                  onClick={() => setIsEditingRole(true)}
                  className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                  title="Edit Agent Name & Role"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-slate-400 font-medium">{selectedAgent.role}</p>
            </div>
          ) : (
            <form onSubmit={handleSaveRole} className="flex-1 mr-2 space-y-1.5">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-[#182238] border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
              />
              <input
                type="text"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="w-full bg-[#182238] border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-300"
              />
              <div className="flex gap-2">
                <button type="submit" className="px-2.5 py-1 bg-blue-600 text-white rounded text-[11px] font-semibold">
                  Save
                </button>
                <button type="button" onClick={() => setIsEditingRole(false)} className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded text-[11px]">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {!isEditingRole && (
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-white text-xs font-semibold px-2.5 py-1.5 flex items-center gap-1 transition-colors bg-slate-800/60 rounded-lg border border-slate-700/50"
            >
              Close <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tab Selection */}
        <div className="flex gap-2 mt-3 pt-2 border-t border-slate-800/60">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'chat' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" /> Chat Stream
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> Rules & Models
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="my-2 bg-[#131b2e] border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between">
        <div className={`px-2.5 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${statusBadge.class}`}>
          {statusBadge.icon}
          <span>{statusBadge.text}</span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-900/90 px-2.5 py-1 rounded-md border border-slate-800">
          <Cpu className="w-3 h-3 text-purple-400" />
          <span>{activeModel.name}</span>
        </div>
      </div>

      {/* Tab 1: Chat Stream */}
      {activeTab === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto space-y-3 my-1 pr-1 custom-scrollbar">
            {selectedAgent.messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-600/20'
                        : 'bg-[#182238] text-slate-200 border border-slate-800 rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-slate-500">
                    <span>{msg.timestamp}</span>
                    {msg.modelUsed && (
                      <>
                        <span>•</span>
                        <span className="text-purple-400/80 flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" />
                          {msg.modelUsed}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="relative flex items-center">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Message ${selectedAgent.name}...`}
                className="w-full bg-[#131b2e] border border-slate-800/80 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="absolute right-1.5 p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </>
      )}

      {/* Tab 2: Rules & Models */}
      {activeTab === 'settings' && (
        <div className="flex-1 overflow-y-auto space-y-4 my-1 pr-1 custom-scrollbar text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Assigned AI Model</label>
            <select
              value={selectedAgent.config.assignedModelId}
              onChange={(e) => {
                const modelId = e.target.value;
                const foundModel = customModels.find((m) => m.id === modelId);
                updateAgentConfig(selectedAgent.id, {
                  assignedModelId: modelId,
                  ...(foundModel?.defaultConfig || {}),
                });
              }}
              className="w-full bg-[#131b2e] border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none"
            >
              {customModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleAddModel} className="space-y-2 p-2.5 bg-slate-900/60 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Add Custom Model</label>
              <button
                type="button"
                onClick={() => setShowModelDetails(!showModelDetails)}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
              >
                {showModelDetails ? 'Hide details' : 'Set custom preset rules'}
                {showModelDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            <div className="flex gap-1.5">
              <input
                type="text"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="e.g. Llama-3-70B or Localhost"
                className="flex-1 bg-[#131b2e] border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
              />
              <button type="submit" className="px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-1 font-semibold">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>

            {showModelDetails && (
              <div className="space-y-2 pt-2 border-t border-slate-800/60 animate-fadeIn">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Preset Task Goal</label>
                  <input
                    type="text"
                    value={newModelGoal}
                    onChange={(e) => setNewModelGoal(e.target.value)}
                    placeholder="e.g. Perform strict code audit and review"
                    className="w-full bg-[#131b2e] border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Preset Strict Rules</label>
                  <input
                    type="text"
                    value={newModelRules}
                    onChange={(e) => setNewModelRules(e.target.value)}
                    placeholder="e.g. Keep answers under 2 sentences."
                    className="w-full bg-[#131b2e] border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Preset Context Stack</label>
                  <input
                    type="text"
                    value={newModelContext}
                    onChange={(e) => setNewModelContext(e.target.value)}
                    placeholder="e.g. React 19, Tailwind CSS"
                    className="w-full bg-[#131b2e] border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-xs"
                  />
                </div>
              </div>
            )}
          </form>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Primary Task Goal</label>
            <textarea
              rows={2}
              value={selectedAgent.config.taskGoal}
              onChange={(e) => updateAgentConfig(selectedAgent.id, { taskGoal: e.target.value })}
              placeholder="What is this agent responsible for?"
              className="w-full bg-[#131b2e] border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Strict Behavior Rules</label>
            <textarea
              rows={3}
              value={selectedAgent.config.strictRules}
              onChange={(e) => updateAgentConfig(selectedAgent.id, { strictRules: e.target.value })}
              placeholder="e.g. Always respond in less than 3 sentences. Never hallucinate code APIs."
              className="w-full bg-[#131b2e] border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Technical Stack Context</label>
            <textarea
              rows={2}
              value={selectedAgent.config.contextParams}
              onChange={(e) => updateAgentConfig(selectedAgent.id, { contextParams: e.target.value })}
              placeholder="e.g. React 19, Tailwind CSS, Vite"
              className="w-full bg-[#131b2e] border border-slate-800 rounded-xl p-2 text-slate-200 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};
