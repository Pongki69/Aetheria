import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, MessageCircle, RefreshCw, Search, Send, Users, X } from 'lucide-react';
import type { PlayerMessageRecord, UserProfile } from '../types';
import { db } from '../db/database';

interface Props { user: UserProfile; onClose: () => void; portalTarget?: HTMLElement | null; }

export function PlayerMessengerModal({ user, onClose, portalTarget }: Props) {
  const [players, setPlayers] = useState<UserProfile[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<PlayerMessageRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    const [directory, allMessages, blocks] = await Promise.all([db.users.toArray(), db.playerMessages.toArray(), db.blocks.toArray()]);
    const blocked = new Set(blocks.filter((item) => item.blockerId === user.id || item.blockedId === user.id).map((item) => item.blockerId === user.id ? item.blockedId : item.blockerId));
    // Older sign-ins could create a second local profile when the email casing changed.
    // Use email as the canonical identity (server accounts are unique by normalized email)
    // and exclude duplicate copies of the currently signed-in player too.
    const seen = new Set<string>();
    const eligible = directory.filter((person) => {
      const email = person.email.trim().toLowerCase();
      if (!email || email === user.email.trim().toLowerCase() || person.id === user.id || person.hideUid || blocked.has(person.id)) return false;
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
    setPlayers(eligible);
    setMessages(allMessages.filter((message) => message.fromUserId === user.id || message.toUserId === user.id).sort((a, b) => a.sentAt.localeCompare(b.sentAt)));
    setOnlineIds((current) => {
      if (current.length) return current.filter((id) => eligible.some((person) => person.id === id));
      return [...eligible].sort(() => Math.random() - 0.5).slice(0, Math.min(6, eligible.length)).map((person) => person.id);
    });
    setLoading(false);
  };

  useEffect(() => { void refresh().catch((error) => { console.error('Unable to load player chat:', error); setLoading(false); }); const timer = window.setInterval(() => { void refresh().catch((error) => console.error('Unable to refresh player chat:', error)); }, 1800); return () => window.clearInterval(timer); }, [user.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, selectedId]);

  const recentIds = useMemo(() => Array.from(new Set(messages.map((message) => message.fromUserId === user.id ? message.toUserId : message.fromUserId))), [messages, user.id]);
  const playersToShow = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const ids = Array.from(new Set([...recentIds, ...onlineIds]));
    return ids.map((id) => players.find((person) => person.id === id)).filter((person): person is UserProfile => !!person && (!needle || `${person.name} ${person.uid || ''}`.toLowerCase().includes(needle)));
  }, [onlineIds, players, recentIds, search]);
  const activePlayer = players.find((person) => person.id === selectedId);
  const thread = messages.filter((message) => selectedId && ((message.fromUserId === user.id && message.toUserId === selectedId) || (message.fromUserId === selectedId && message.toUserId === user.id)));

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activePlayer) return;
    const message: PlayerMessageRecord = { id: `player-message-${crypto.randomUUID()}`, fromUserId: user.id, toUserId: activePlayer.id, fromName: user.name, fromAvatar: user.avatar, text, sentAt: new Date().toISOString() };
    await db.playerMessages.put(message);
    setDraft('');
    await refresh();
  };

  return createPortal(<div role="dialog" aria-modal="true" aria-label="Global player chat" className="player-chat-backdrop">
    <section className="player-chat-window">
      <header className="player-chat-header"><div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><div className="player-chat-icon"><MessageCircle size={18} /></div><div><div style={{ color: '#7dd3fc', fontSize: 9, fontWeight: 800, letterSpacing: '.12em' }}>AETHERIA · LOCAL PREVIEW</div><h1 style={{ margin: '3px 0 0', fontSize: 19 }}>Player messages</h1></div></div><button aria-label="Close player messages" onClick={onClose} className="player-chat-close"><X size={17} /></button></header>
      <div className={`player-chat-body ${selectedId ? 'has-active-thread' : ''}`}>
        <aside className="player-chat-sidebar">
          <div className="player-chat-roster-heading"><div><Users size={14} color="#38bdf8" /> <strong>Discover players</strong></div><span className="player-chat-online-count">{onlineIds.length} picked</span></div>
          <p className="player-chat-hint">A random selection from this browser’s player directory appears each time you open chat.</p>
          <label className="player-chat-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a player" /></label>
          <div className="player-chat-list">
            {loading ? <div className="player-chat-empty">Finding players…</div> : playersToShow.length ? playersToShow.map((person) => {
              const isOnline = onlineIds.includes(person.id);
              const lastMessage = [...messages].reverse().find((message) => message.fromUserId === person.id || message.toUserId === person.id);
              return <button key={person.id} className={`player-chat-person ${selectedId === person.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(person.id)}><span className="player-chat-avatar"><img src={person.avatar} alt="" /></span><span className="player-chat-person-copy"><strong>{person.name}</strong><small>{lastMessage ? lastMessage.text : isOnline ? 'Random pick' : 'Recent conversation'}</small></span>{isOnline && <span className="player-chat-random-tag">NEW</span>}</button>;
            }) : <div className="player-chat-empty">No other discoverable players are saved in this browser yet.</div>}
          </div>
          <div className="player-chat-local-note">Roster and messages stay in this browser. Global live presence needs a multiplayer server.</div>
        </aside>
        <main className="player-chat-thread">
          {activePlayer ? <>
            <div className="player-chat-thread-head"><button className="player-chat-back" onClick={() => setSelectedId(null)} aria-label="Back to player list"><ArrowLeft size={16} /></button><span className="player-chat-avatar large"><img src={activePlayer.avatar} alt="" /></span><div><strong>{activePlayer.name}</strong><small>{onlineIds.includes(activePlayer.id) ? 'Selected for this session' : 'Message history'}</small></div></div>
            <div className="player-chat-messages">{thread.length ? thread.map((message) => { const mine = message.fromUserId === user.id; return <article key={message.id} className={`player-chat-bubble ${mine ? 'mine' : ''}`}><div>{message.text}</div><time>{new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></article>; }) : <div className="player-chat-empty thread-empty">Say hello to {activePlayer.name}.</div>}<div ref={endRef} /></div>
            <form className="player-chat-composer" onSubmit={(event) => void sendMessage(event)}><input value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${activePlayer.name}…`} /><button disabled={!draft.trim()} aria-label="Send message"><Send size={15} /></button></form>
          </> : <div className="player-chat-welcome"><div className="player-chat-icon"><MessageCircle size={23} /></div><h2>Talk with players</h2><p>Choose someone from the online list or reopen chat for a different selection.</p><button onClick={() => { setOnlineIds([...players].sort(() => Math.random() - 0.5).slice(0, Math.min(6, players.length)).map((person) => person.id)); setSelectedId(null); }}><RefreshCw size={13} />Find different players</button></div>}
        </main>
      </div>
    </section>
  </div>, portalTarget || document.body);
}
