import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  X,
  Trash2,
  Ban,
  CheckCircle2,
  UserCheck,
  UserMinus,
  Globe,
  Flame,
  RotateCcw
} from 'lucide-react';
import type { UserSession } from '../types';
import { db, type AdminMessageArchive } from '../db/database';
import { useConfirmModal } from './ConfirmModal';
import { authRequest, getAuthToken, type AuthAccount } from '../services/authClient';

interface AdminDashboardModalProps {
  isOpen: boolean;
  currentUserId?: string;
  onClose: () => void;
  sessions: UserSession[];
  bannedIPs: string[];
  onToggleSessionStatus: (sessionId: string, currentStatus: 'ACTIVE' | 'TERMINATED') => void;
  onDeleteUser: (userId: string, userEmail: string) => void;
  onChangeUserRole: (userId: string, currentRole: 'USER' | 'ADMIN') => void;
  onBanIP: (ip: string) => void;
  onUnbanIP: (ip: string) => void;
  onClearRevokedSessions: () => void;
}

export function AdminDashboardModal({
  isOpen,
  currentUserId,
  onClose,
  sessions,
  bannedIPs,
  onToggleSessionStatus,
  onDeleteUser,
  onChangeUserRole,
  onBanIP,
  onUnbanIP,
  onClearRevokedSessions
}: AdminDashboardModalProps) {
  const { confirm, dialog: confirmDialog } = useConfirmModal();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'REVOKED' | 'BANNED_IPS' | 'MESSAGE_ARCHIVE' | 'USERS'>('ALL');
  const [ipToBan, setIpToBan] = useState('');
  const [messageArchive, setMessageArchive] = useState<AdminMessageArchive[]>([]);
  const [managedUsers, setManagedUsers] = useState<AuthAccount[]>([]);
  const [userDraft, setUserDraft] = useState({ name: '', email: '', role: 'USER' as 'USER' | 'ADMIN' });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [usersError, setUsersError] = useState('');
  const [usersNotice, setUsersNotice] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [userFormOpen, setUserFormOpen] = useState(false);

  const loadUsers = async () => {
    const token = getAuthToken();
    if (!token) { setUsersError('Admin sign-in expired. Sign in again.'); return; }
    setUsersLoading(true); setUsersError('');
    try { setManagedUsers(await authRequest<AuthAccount[]>('/api/admin/users', {}, token)); }
    catch (error) { setUsersError(error instanceof Error ? error.message : 'Unable to load users.'); }
    finally { setUsersLoading(false); }
  };

  useEffect(() => {
    if (!isOpen || filterTab !== 'MESSAGE_ARCHIVE') return;
    void db.adminMessageArchive.orderBy('archivedAt').reverse().toArray().then(setMessageArchive).catch((error) => console.error('Unable to load admin message archive:', error));
  }, [isOpen, filterTab]);
  useEffect(() => { if (isOpen && filterTab === 'USERS') void loadUsers(); }, [isOpen, filterTab]);

  if (!isOpen) return null;

  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      s.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.ipAddress.includes(searchQuery);

    if (!matchesSearch) return false;
    if (filterTab === 'ACTIVE') return s.status === 'ACTIVE';
    if (filterTab === 'REVOKED') return s.status === 'TERMINATED';
    return true;
  });

  const handleBanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ipToBan.trim()) {
      if (await confirm(`Are you sure you want to block IP address: ${ipToBan.trim()}?`, { title: 'Block IP address', confirmLabel: 'Block IP', destructive: true })) {
        onBanIP(ipToBan.trim());
        setIpToBan('');
      }
    }
  };

  return (
    <>
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(2, 6, 23, 0.92)',
      backdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999
    }}>
      <div className="admin-dashboard-card" style={{
        width: 'min(1000px, calc(100vw - 32px))',
        maxHeight: '90dvh',
        backgroundColor: 'rgba(15, 23, 42, 0.98)',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        borderRadius: '16px',
        boxShadow: '0 0 50px rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        color: '#f8fafc',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 100000
      }}>
        {/* HEADER */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px' }}>
              <ShieldAlert size={20} color="#ef4444" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, letterSpacing: '0.5px' }}>ADMIN COMMAND DASHBOARD</h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>Active Operator Logs, Access Control & Revertible Security Actions</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* CONTROLS BAR */}
        <div style={{ padding: '16px 24px', display: 'flex', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['ALL', 'ACTIVE', 'REVOKED', 'BANNED_IPS', 'MESSAGE_ARCHIVE', 'USERS'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                style={{
                  padding: '6px 12px',
                  background: filterTab === tab ? '#0284c7' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search operator, email, or IP address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '6px 12px',
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color: 'white',
              fontSize: '12px'
            }}
          />

          <button
            onClick={() => { void (async () => {
              if (await confirm('Purge all revoked session history permanently from database?', { title: 'Purge revoked sessions', confirmLabel: 'Purge logs', destructive: true })) {
                onClearRevokedSessions();
              }
            })(); }}
            style={{
              padding: '6px 12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '6px',
              color: '#f87171',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Flame size={14} /> Purge Logs
          </button>
        </div>

        {/* IP BAN INPUT SECTION */}
        {filterTab === 'BANNED_IPS' && (
          <form onSubmit={(event) => void handleBanSubmit(event)} style={{ padding: '12px 24px', display: 'flex', gap: '8px', background: 'rgba(239, 68, 68, 0.05)' }}>
            <input
              type="text"
              placeholder="Enter IP address to block (e.g. 192.168.1.104)"
              value={ipToBan}
              onChange={(e) => setIpToBan(e.target.value)}
              style={{ flex: 1, padding: '8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: 'white', fontSize: '12px' }}
            />
            <button type="submit" style={{ padding: '8px 16px', background: '#e11d48', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>
              Ban IP Address
            </button>
          </form>
        )}

        {/* TABLE CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {filterTab === 'USERS' ? (
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div><h3 style={{ margin: 0, fontSize: 15 }}>User accounts</h3><p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 11 }}>Manage verified and invited accounts. Role changes take effect on the server.</p></div>
                <button onClick={() => { setUserFormOpen(true); setEditingUserId(null); setUserDraft({ name: '', email: '', role: 'USER' }); setUsersNotice(''); }} style={{ padding: '8px 12px', border: 0, borderRadius: 7, background: '#0284c7', color: 'white', fontWeight: 700, cursor: 'pointer' }}>+ Add user</button>
              </div>
              {usersError && <div role="alert" style={{ color: '#fca5a5', padding: 10, marginBottom: 10, borderRadius: 8, background: 'rgba(239,68,68,.1)' }}>{usersError}</div>}
              {usersNotice && <div role="status" style={{ color: '#6ee7b7', padding: 10, marginBottom: 10, borderRadius: 8, background: 'rgba(16,185,129,.1)' }}>{usersNotice}</div>}
              {userFormOpen ? <form onSubmit={(event) => { event.preventDefault(); void (async () => {
                const token = getAuthToken(); if (!token) { setUsersError('Admin sign-in expired.'); return; }
                try {
                  if (editingUserId) {
                    const updated = await authRequest<AuthAccount>(`/api/admin/users/${encodeURIComponent(editingUserId)}`, { method: 'PATCH', body: JSON.stringify(userDraft) }, token);
                    setManagedUsers((items) => items.map((item) => item.id === updated.id ? updated : item)); setUsersNotice('User updated.');
                  } else {
                    const result = await authRequest<{ user: AuthAccount; message?: string; warning?: string }>('/api/admin/users', { method: 'POST', body: JSON.stringify({ name: userDraft.name, email: userDraft.email }) }, token);
                    setManagedUsers((items) => [...items, result.user]); setUsersNotice(result.warning || result.message || 'User invited.');
                  }
                  setEditingUserId(null); setUserDraft({ name: '', email: '', role: 'USER' }); setUserFormOpen(false); setUsersError('');
                } catch (error) { setUsersError(error instanceof Error ? error.message : 'Could not save user.'); }
              })(); }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, padding: 12, marginBottom: 12, background: 'rgba(2,132,199,.08)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 9 }}>
                <input aria-label="Display name" placeholder="Display name" value={userDraft.name} onChange={(event) => setUserDraft({ ...userDraft, name: event.target.value })} required minLength={2} style={userInputStyle} />
                <input aria-label="Email" type="email" placeholder="Email address" value={userDraft.email} onChange={(event) => setUserDraft({ ...userDraft, email: event.target.value })} required style={userInputStyle} />
                {editingUserId && editingUserId !== currentUserId && <select aria-label="Role" value={userDraft.role} onChange={(event) => setUserDraft({ ...userDraft, role: event.target.value as 'USER' | 'ADMIN' })} style={userInputStyle}><option value="USER">User</option><option value="ADMIN">Admin</option></select>}
                <button type="submit" style={{ ...userInputStyle, border: 0, background: '#0284c7', fontWeight: 700, cursor: 'pointer' }}>{editingUserId ? 'Save' : 'Invite'}</button>
                <button type="button" onClick={() => { setUserFormOpen(false); setEditingUserId(null); setUserDraft({ name: '', email: '', role: 'USER' }); }} style={{ ...userInputStyle, cursor: 'pointer' }}>Cancel</button>
              </form> : null}
              {usersLoading ? <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading users…</div> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 650, borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}><thead><tr style={{ color: '#64748b', textTransform: 'uppercase', fontSize: 10 }}><th style={userCellStyle}>User</th><th style={userCellStyle}>Role</th><th style={userCellStyle}>Email status</th><th style={userCellStyle}>Joined</th><th style={{ ...userCellStyle, textAlign: 'right' }}>Actions</th></tr></thead><tbody>{managedUsers.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(searchQuery.toLowerCase())).map((item) => <tr key={item.id} style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}><td style={userCellStyle}><strong>{item.name}</strong><div style={{ color: '#64748b', fontSize: 10 }}>{item.email}</div></td><td style={userCellStyle}>{item.role}</td><td style={userCellStyle}>{item.verified ? 'Verified' : 'Invite pending'}</td><td style={userCellStyle}>{item.joinedDate}</td><td style={{ ...userCellStyle, textAlign: 'right' }}><button onClick={() => { setUserFormOpen(true); setEditingUserId(item.id); setUserDraft({ name: item.name, email: item.email, role: item.role === 'ADMIN' ? 'ADMIN' : 'USER' }); setUsersNotice(''); }} style={miniActionStyle}>Edit</button><button onClick={() => { void (async () => { if (!await confirm(`Permanently delete ${item.email}?`, { title: 'Delete account', confirmLabel: 'Delete', destructive: true })) return; const token = getAuthToken(); if (!token) return; try { await authRequest<void>(`/api/admin/users/${encodeURIComponent(item.id)}`, { method: 'DELETE' }, token); setManagedUsers((items) => items.filter((user) => user.id !== item.id)); setUsersNotice('User deleted.'); } catch (error) { setUsersError(error instanceof Error ? error.message : 'Could not delete user.'); } })(); }} style={{ ...miniActionStyle, color: '#fda4af', borderColor: 'rgba(244,63,94,.4)', marginLeft: 6 }}>Delete</button></td></tr>)}</tbody></table>{managedUsers.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No accounts yet.</div>}</div>}
            </section>
          ) : filterTab === 'MESSAGE_ARCHIVE' ? (
            <section aria-label="Deleted message archive" style={{ display: 'grid', gap: 10 }}>
              <p style={{ margin: '0 0 4px', color: '#94a3b8', fontSize: 11 }}>Deleted messages are retained here for admin review, including any attached media.</p>
              {messageArchive.length ? messageArchive.filter((item) => `${item.ownerId} ${item.text} ${item.attachmentName}`.toLowerCase().includes(searchQuery.toLowerCase())).map((item) => <article key={item.id} style={{ padding: 12, borderRadius: 9, border: '1px solid rgba(148,163,184,.16)', background: 'rgba(2,6,23,.35)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#94a3b8', fontSize: 10 }}><span>User {item.ownerId} · {item.sender}</span><span>{new Date(item.archivedAt).toLocaleString()}</span></div><div style={{ marginTop: 7, color: '#e2e8f0', fontSize: 12, whiteSpace: 'pre-wrap' }}>{item.text || 'Media attachment'}</div>{item.attachmentBlob && <ArchivedMedia blob={item.attachmentBlob} type={item.attachmentType || ''} name={item.attachmentName || 'Archived media'} />}{item.attachmentName && <div style={{ marginTop: 6, color: '#7dd3fc', fontSize: 10 }}>{item.attachmentName} · {((item.attachmentSize || 0) / 1024 / 1024).toFixed(1)} MB</div>}</article>) : <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No deleted messages have been archived.</div>}
            </section>
          ) : filterTab === 'BANNED_IPS' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px' }}>Blocked IP Address</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bannedIPs.length === 0 ? (
                  <tr><td colSpan={2} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No blocked IP addresses.</td></tr>
                ) : (
                  bannedIPs.map((ip) => (
                    <tr key={ip} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 8px', color: '#f87171', fontFamily: 'monospace' }}>{ip}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                        <button
                          onClick={() => { void (async () => { if (await confirm(`Unban IP address ${ip}?`, { title: 'Unban IP address', confirmLabel: 'Unban IP' })) onUnbanIP(ip); })(); }}
                          style={{ padding: '4px 8px', background: '#0284c7', border: 'none', borderRadius: '4px', color: 'white', fontSize: '10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <RotateCcw size={12} /> Unban IP
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px' }}>Operator</th>
                  <th style={{ padding: '8px' }}>Role</th>
                  <th style={{ padding: '8px' }}>IP Address</th>
                  <th style={{ padding: '8px' }}>Location</th>
                  <th style={{ padding: '8px' }}>Browser</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((s) => {
                  const isIpBanned = bannedIPs.includes(s.ipAddress);
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img src={s.avatarUrl} alt={s.userName} style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                        <div>
                          <div style={{ fontWeight: 700, color: '#f8fafc' }}>{s.userName}</div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{s.userEmail}</div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{
                          fontSize: '9px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          background: s.role === 'ADMIN' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                          color: s.role === 'ADMIN' ? '#f87171' : '#38bdf8'
                        }}>
                          {s.role}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', color: isIpBanned ? '#f87171' : '#38bdf8', fontFamily: 'monospace' }}>
                        {s.ipAddress} {isIpBanned && '(Banned)'}
                      </td>
                      <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{s.location}</td>
                      <td style={{ padding: '10px 8px', color: '#cbd5e1' }}>{s.browser}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          {/* TOGGLE ROLE (ADMIN / USER) */}
                          {s.role !== 'SUPERADMIN' && <button
                            onClick={() => { void (async () => {
                              const targetRole = s.role === 'ADMIN' ? 'USER' : 'ADMIN';
                              if (await confirm(`Change role of ${s.userName} from ${s.role} to ${targetRole}?`, { title: 'Change account role', confirmLabel: `Change to ${targetRole}`, destructive: s.role === 'ADMIN' })) {
                                onChangeUserRole(s.userId, s.role === 'ADMIN' ? 'ADMIN' : 'USER');
                              }
                            })(); }}
                            style={{ padding: '4px 6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#cbd5e1', fontSize: '10px', cursor: 'pointer' }}
                            title={`Revert/Toggle Role (Currently: ${s.role})`}
                          >
                            {s.role === 'ADMIN' ? <UserMinus size={12} /> : <UserCheck size={12} />}
                          </button>}

                          {/* TOGGLE BAN / UNBAN IP */}
                          <button
                            onClick={() => { void (async () => {
                              if (isIpBanned) {
                                if (await confirm(`Unban IP address ${s.ipAddress}?`, { title: 'Unban IP address', confirmLabel: 'Unban IP' })) onUnbanIP(s.ipAddress);
                              } else {
                                if (await confirm(`Ban IP address ${s.ipAddress}?`, { title: 'Block IP address', confirmLabel: 'Block IP', destructive: true })) onBanIP(s.ipAddress);
                              }
                            })(); }}
                            style={{
                              padding: '4px 6px',
                              background: isIpBanned ? 'rgba(56, 189, 248, 0.2)' : 'rgba(245, 158, 11, 0.15)',
                              border: isIpBanned ? '1px solid #38bdf8' : '1px solid #f59e0b',
                              borderRadius: '4px',
                              color: isIpBanned ? '#38bdf8' : '#fbbf24',
                              fontSize: '10px',
                              cursor: 'pointer'
                            }}
                            title={isIpBanned ? 'Unban IP' : 'Ban IP'}
                          >
                            <Globe size={12} />
                          </button>

                          {/* REVERTIBLE SESSION (REVOKE / REACTIVATE) */}
                          <button
                            onClick={() => { void (async () => {
                              const actionText = s.status === 'ACTIVE' ? 'revoke' : 'reactivate';
                              if (await confirm(`Are you sure you want to ${actionText} session for ${s.userName}?`, { title: `${actionText === 'revoke' ? 'Revoke' : 'Reactivate'} session`, confirmLabel: actionText === 'revoke' ? 'Revoke session' : 'Reactivate', destructive: actionText === 'revoke' })) {
                                onToggleSessionStatus(s.id, s.status);
                              }
                            })(); }}
                            style={{
                              padding: '4px 6px',
                              background: s.status === 'ACTIVE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              border: s.status === 'ACTIVE' ? '1px solid #ef4444' : '1px solid #10b981',
                              borderRadius: '4px',
                              color: s.status === 'ACTIVE' ? '#f87171' : '#34d399',
                              fontSize: '10px',
                              cursor: 'pointer'
                            }}
                            title={s.status === 'ACTIVE' ? 'Revoke Session' : 'Reactivate Session'}
                          >
                            {s.status === 'ACTIVE' ? <Ban size={12} /> : <CheckCircle2 size={12} />}
                          </button>

                          {/* DELETE USER */}
                          <button
                            onClick={() => onDeleteUser(s.userId, s.userEmail)}
                            style={{ padding: '4px 6px', background: 'rgba(225, 29, 72, 0.2)', border: '1px solid #e11d48', borderRadius: '4px', color: '#fda4af', fontSize: '10px', cursor: 'pointer' }}
                            title="Delete User Permanently"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
    {confirmDialog}
    </>
  );
}

function ArchivedMedia({ blob, type, name }: { blob: Blob; type: string; name: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [blob]);
  if (!url) return null;
  return type.startsWith('video/') ? <video controls preload="metadata" src={url} aria-label={name} style={{ display: 'block', maxWidth: 'min(420px, 100%)', maxHeight: 260, marginTop: 8, borderRadius: 8 }} /> : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={name} style={{ display: 'block', maxWidth: 'min(420px, 100%)', maxHeight: 260, marginTop: 8, objectFit: 'contain', borderRadius: 8 }} /></a>;
}

const userCellStyle: React.CSSProperties = { padding: '10px 8px', color: '#cbd5e1' };
const userInputStyle: React.CSSProperties = { minWidth: 0, padding: '8px 10px', color: '#f8fafc', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 12 };
const miniActionStyle: React.CSSProperties = { padding: '5px 9px', color: '#7dd3fc', background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.25)', borderRadius: 5, cursor: 'pointer', fontSize: 11 };
