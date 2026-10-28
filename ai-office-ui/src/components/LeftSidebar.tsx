import React from 'react';
import {
  Search,
  Plus,
  MoveVertical,
  Send,
  Box,
  Trash2,
  CheckCircle2,
  ShieldAlert
} from 'lucide-react';
import { Agent, FurnitureItem, ChatMessage, SystemRule } from '../types';

interface LeftSidebarProps {
  agents: Agent[];
  filteredAgents: Agent[];
  selectedAgent: Agent;
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  searchFilter: string;
  setSearchFilter: (filter: string) => void;
  activeTab: 'DIRECT' | 'DECOR' | 'RULES';
  setActiveTab: (tab: 'DIRECT' | 'DECOR' | 'RULES') => void;
  setIsAddAgentOpen: (open: boolean) => void;
  
  // Direct / Chat Tab Props
  chatLog: Record<string, ChatMessage[]>;
  inputCommand: string;
  setInputCommand: (val: string) => void;
  handleSendMessage: (e: React.FormEvent) => void;
  handleUpdateAgentScale: (id: string, scale: number) => void;
  isTyping: boolean;
  chatEndRef: React.RefObject<HTMLDivElement>;

  // Decor Tab Props
  furniture: FurnitureItem[];
  selectedFurniture: FurnitureItem | undefined;
  selectedFurnitureId: string | null;
  setSelectedFurnitureId: (id: string | null) => void;
  setIsAddFurnitureOpen: (open: boolean) => void;
  handleDeleteFurniture: (id: string) => void;
  handleUpdateFurnitureScale: (id: string, scale: number) => void;

  // Rules Tab Props
  systemRules: SystemRule[];
  newRuleInput: string;
  setNewRuleInput: (val: string) => void;
  handleAddRule: (e: React.FormEvent) => void;
  toggleRule: (id: string) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  filteredAgents,
  selectedAgent,
  selectedAgentId,
  setSelectedAgentId,
  searchFilter,
  setSearchFilter,
  activeTab,
  setActiveTab,
  setIsAddAgentOpen,
  chatLog,
  inputCommand,
  setInputCommand,
  handleSendMessage,
  handleUpdateAgentScale,
  isTyping,
  chatEndRef,
  furniture,
  selectedFurniture,
  selectedFurnitureId,
  setSelectedFurnitureId,
  setIsAddFurnitureOpen,
  handleDeleteFurniture,
  handleUpdateFurnitureScale,
  systemRules,
  newRuleInput,
  setNewRuleInput,
  handleAddRule,
  toggleRule
}) => {
  const currentAgentMessages = chatLog[selectedAgent.id] || [];

  return (
    <div style={{ width: '340px', flexShrink: 0, borderRight: '1px solid rgba(56, 189, 248, 0.2)', backgroundColor: '#090d16', display: 'flex', flexDirection: 'column' }}>
      
      {/* BRAND HEADER */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/images/aetheria-logo.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <span style={{ fontWeight: 800, fontSize: '14px', letterSpacing: '0.5px' }}>AETHERIA</span>
        </div>
        <span style={{ fontSize: '9px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', border: '1px solid #0284c7' }}>
          PROD-OPERATIONS
        </span>
      </div>

      {/* ROSTER HEADER & SEARCH & ADD */}
      <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>Agent Roster</span>
          <button
            onClick={() => setIsAddAgentOpen(true)}
            title="Add Custom Agent"
            style={{ background: '#0284c7', border: 'none', borderRadius: '4px', padding: '4px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus size={14} />
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={14} color="#64748b" style={{ position: 'absolute', left: '8px', top: '8px' }} />
          <input
            type="text"
            placeholder="Search roster..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 6px 6px 28px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: 'white',
              fontSize: '11px',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {/* AGENTS LIST */}
      <div style={{ padding: '8px', height: '140px', overflowY: 'auto', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {filteredAgents.map((agent) => (
          <div
            key={agent.id}
            onClick={() => {
              setSelectedAgentId(agent.id);
              setSelectedFurnitureId(null);
            }}
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              background: selectedAgentId === agent.id && !selectedFurnitureId ? 'rgba(2, 132, 199, 0.2)' : 'rgba(15, 23, 42, 0.4)',
              border: selectedAgentId === agent.id && !selectedFurnitureId ? '1px solid #0284c7' : '1px solid rgba(255,255,255,0.05)',
              marginBottom: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '13px', color: '#ffffff' }}>{agent.name}</span>
              <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                {agent.status}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{agent.role}</div>
          </div>
        ))}
      </div>

      {/* NAVIGATION TABS */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#0b1120' }}>
          <button
            onClick={() => setActiveTab('DIRECT')}
            style={{
              flex: 1,
              padding: '10px 4px',
              background: activeTab === 'DIRECT' ? 'transparent' : 'rgba(15, 23, 42, 0.6)',
              border: 'none',
              borderBottom: activeTab === 'DIRECT' ? '2px solid #0284c7' : '2px solid transparent',
              color: activeTab === 'DIRECT' ? '#ffffff' : '#64748b',
              fontSize: '10px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            COMM
          </button>
          <button
            onClick={() => setActiveTab('DECOR')}
            style={{
              flex: 1,
              padding: '10px 4px',
              background: activeTab === 'DECOR' ? 'transparent' : 'rgba(15, 23, 42, 0.6)',
              border: 'none',
              borderBottom: activeTab === 'DECOR' ? '2px solid #f59e0b' : '2px solid transparent',
              color: activeTab === 'DECOR' ? '#f59e0b' : '#64748b',
              fontSize: '10px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            DECOR
          </button>
          <button
            onClick={() => setActiveTab('RULES')}
            style={{
              flex: 1,
              padding: '10px 4px',
              background: activeTab === 'RULES' ? 'transparent' : 'rgba(15, 23, 42, 0.6)',
              border: 'none',
              borderBottom: activeTab === 'RULES' ? '2px solid #0284c7' : '2px solid transparent',
              color: activeTab === 'RULES' ? '#ffffff' : '#64748b',
              fontSize: '10px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            RULES
          </button>
        </div>

        {activeTab === 'DIRECT' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>Comm Link: {selectedAgent.name}</span>
                <span style={{ color: '#64748b', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Model: {selectedAgent.modelName}</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(2, 6, 23, 0.6)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                <MoveVertical size={12} color="#38bdf8" />
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>Size: {selectedAgent.scale || 1}x</span>
                <input
                  type="range"
                  min="0.01"
                  max="10"
                  step="0.01"
                  value={selectedAgent.scale || 1}
                  onChange={(e) => handleUpdateAgentScale(selectedAgent.id, parseFloat(e.target.value))}
                  style={{ flex: 1, cursor: 'pointer' }}
                />
              </div>
            </div>

            <div style={{ flex: 1, padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {currentAgentMessages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '8px 10px',
                    borderRadius: msg.sender === 'user' ? '8px 8px 0px 8px' : '8px 8px 8px 0px',
                    backgroundColor: msg.sender === 'user' ? '#0284c7' : 'rgba(30, 41, 59, 0.8)',
                    border: msg.sender === 'user' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    color: 'white',
                    fontSize: '11px'
                  }}
                >
                  <div style={{ fontSize: '9px', opacity: 0.7, marginBottom: '2px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <span>{msg.sender === 'user' ? 'OPERATOR' : selectedAgent.name}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>
                </div>
              ))}
              {isTyping && (
                <div style={{ alignSelf: 'flex-start', fontSize: '10px', color: '#38bdf8', fontStyle: 'italic', padding: '4px' }}>
                  {selectedAgent.name} is processing instruction...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder={`Instruct ${selectedAgent.name}...`}
                value={inputCommand}
                onChange={(e) => setInputCommand(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '11px',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="submit"
                disabled={isTyping}
                style={{ padding: '8px 12px', background: '#0284c7', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 700, fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Send size={12} />
              </button>
            </form>
          </div>
        )}

        {activeTab === 'DECOR' && (
          <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#f59e0b', letterSpacing: '0.5px' }}>SCENE FURNITURE & DECOR</span>
              <button
                onClick={() => setIsAddFurnitureOpen(true)}
                style={{ background: '#d97706', border: 'none', borderRadius: '4px', padding: '4px 8px', color: 'white', fontSize: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={12} /> Add Decor
              </button>
            </div>

            {selectedFurniture && (
              <div style={{ padding: '10px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #d97706', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#f59e0b' }}>{selectedFurniture.label}</span>
                  <button
                    onClick={() => handleDeleteFurniture(selectedFurniture.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MoveVertical size={12} color="#f59e0b" />
                  <span style={{ fontSize: '10px', color: '#cbd5e1' }}>Scale: {selectedFurniture.scale}x</span>
                  <input
                    type="range"
                    min="0.01"
                    max="10"
                    step="0.01"
                    value={selectedFurniture.scale}
                    onChange={(e) => handleUpdateFurnitureScale(selectedFurniture.id, parseFloat(e.target.value))}
                    style={{ flex: 1, cursor: 'pointer' }}
                  />
                </div>
              </div>
            )}

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
              {furniture.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
                  No furniture added yet. Click "Add Decor" above to import 3D objects!
                </div>
              ) : (
                furniture.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedFurnitureId(item.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: selectedFurnitureId === item.id ? 'rgba(245, 158, 11, 0.2)' : 'rgba(15, 23, 42, 0.8)',
                      border: selectedFurnitureId === item.id ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Box size={14} color="#f59e0b" />
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'white' }}>{item.label}</div>
                        <div style={{ fontSize: '9px', color: '#64748b' }}>{item.category} • {item.scale}x</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'RULES' && (
          <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px' }}>ACTIVE AGENT GOVERNANCE RULES</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
              {systemRules.map((rule) => (
                <div
                  key={rule.id}
                  onClick={() => toggleRule(rule.id)}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: rule.active ? '1px solid #0284c7' : '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: '11px', color: rule.active ? '#f8fafc' : '#64748b' }}>{rule.text}</span>
                  {rule.active ? <CheckCircle2 size={14} color="#38bdf8" /> : <ShieldAlert size={14} color="#64748b" />}
                </div>
              ))}
            </div>

            <form onSubmit={handleAddRule} style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
              <input
                type="text"
                placeholder="Add new system rule..."
                value={newRuleInput}
                onChange={(e) => setNewRuleInput(e.target.value)}
                style={{ flex: 1, padding: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '11px' }}
              />
              <button type="submit" style={{ padding: '8px 14px', background: '#0284c7', border: 'none', borderRadius: '6px', color: 'white', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                Add
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

