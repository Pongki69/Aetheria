import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FriendRequestRecord, FriendshipRecord, UserBlockRecord, UserProfile } from '../types';
import { db } from '../db/database';
import { ArrowLeft, BadgeCheck, Box, Check, Copy, DoorOpen, Heart, Image, ImagePlus, LoaderCircle, LockKeyhole, Pencil, Search, Shield, UserPlus, Users, X, Move, ZoomIn, Trash2 } from 'lucide-react';
import * as THREE from 'three';
import { CommunityPanel } from './CommunityPanel';

interface ProfileCardItem { id: string; title: string; subtitle: string; imageUrl?: string; }
interface UserProfilePanelProps {
  user: UserProfile;
  modelCards: ProfileCardItem[];
  decorCards: ProfileCardItem[];
  onClose: () => void;
  onLogout: () => void;
  onUpdateProfile: (changes: Partial<Pick<UserProfile, 'name' | 'avatar' | 'signature' | 'hideUid' | 'coverImage' | 'showUidOnPlane' | 'avatarAlbum' | 'coverAlbum'>>) => Promise<void>;
  onOpenAdminModal?: () => void;
}

const profileUid = (user: UserProfile) => user.uid || user.id.toUpperCase();
const friendPairId = (left: string, right: string) => `friend:${[left, right].sort().join(':')}`;
const requestId = (from: string, to: string) => `request:${from}:${to}`;

export function UserProfilePanel({ user, modelCards, decorCards, onClose, onLogout, onUpdateProfile, onOpenAdminModal }: UserProfilePanelProps) {
  const [tab, setTab] = useState<'overview' | 'friends' | 'blocked' | 'album' | 'community'>('overview');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar);
  const [signature, setSignature] = useState(user.signature || '');
  const [hideUid, setHideUid] = useState(!!user.hideUid);
  const [uidVisible, setUidVisible] = useState(user.showUidOnPlane !== false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<FriendRequestRecord[]>([]);
  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);
  const [blocks, setBlocks] = useState<UserBlockRecord[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [cropTarget, setCropTarget] = useState<{ file: File; aspect: number; target: 'avatar' | 'cover' } | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const refreshSocial = async () => {
    setSocialLoading(true);
    try {
      const [storedPeople, storedRequests, storedFriendships, storedBlocks] = await Promise.all([
        db.users.toArray(),
        db.friendRequests.toArray(),
        db.friendships.toArray(),
        db.blocks.toArray()
      ]);
      setPeople(storedPeople);
      setRequests(storedRequests.filter((request) => request.status === 'PENDING'));
      setFriendships(storedFriendships);
      setBlocks(storedBlocks);
    } catch (error) {
      console.error('Unable to load local friend data:', error);
    } finally {
      setSocialLoading(false);
    }
  };

  useEffect(() => {
    setName(user.name);
    setAvatar(user.avatar);
    setSignature(user.signature || '');
    setHideUid(!!user.hideUid);
    setUidVisible(user.showUidOnPlane !== false);
    void refreshSocial();
  }, [user]);

  const currentFriendships = friendships.filter((friendship) => friendship.userA === user.id || friendship.userB === user.id);
  const friendIds = new Set(currentFriendships.map((friendship) => friendship.userA === user.id ? friendship.userB : friendship.userA));
  const friends = people.filter((person) => friendIds.has(person.id));
  const incoming = requests.filter((request) => request.toUserId === user.id);
  const outgoingRequests = requests.filter((request) => request.fromUserId === user.id);
  const outgoingIds = new Set(outgoingRequests.map((request) => request.toUserId));
  const blockedByMe = blocks.filter((block) => block.blockerId === user.id);
  const blockedIds = new Set(blockedByMe.map((block) => block.blockedId));
  const uid = profileUid(user);
  const discoverablePeople = people.filter((person) => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch || person.id === user.id || person.hideUid || blockedIds.has(person.id) || friendIds.has(person.id)) return false;
    if (blocks.some((block) => block.blockerId === person.id && block.blockedId === user.id)) return false;
    return `${person.name} ${profileUid(person)}`.toLowerCase().includes(normalizedSearch);
  });
  const selectedBlockedPeople = people.filter((person) => blockedIds.has(person.id));
  const visibleModelCards = useMemo(() => modelCards.slice(0, 6), [modelCards]);
  const visibleDecorCards = useMemo(() => decorCards.slice(0, 6), [decorCards]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setSaveError('Enter a display name first.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      await onUpdateProfile({ name: name.trim(), avatar: avatar.trim() || user.avatar, signature: signature.trim(), hideUid });
      setEditing(false);
    } catch {
      setSaveError('Your profile could not be saved. Try again.');
    } finally { setSaving(false); }
  };

  const addFriend = async (person: UserProfile) => {
    const reverseRequest = await db.friendRequests.get(requestId(person.id, user.id));
    if (reverseRequest?.status === 'PENDING') {
      await db.friendships.put({ id: friendPairId(user.id, person.id), userA: [user.id, person.id].sort()[0], userB: [user.id, person.id].sort()[1], createdAt: new Date().toISOString() });
      await db.friendRequests.delete(reverseRequest.id);
    } else {
      await db.friendRequests.put({ id: requestId(user.id, person.id), fromUserId: user.id, toUserId: person.id, status: 'PENDING', createdAt: new Date().toISOString() });
    }
    await refreshSocial();
  };

  const acceptRequest = async (request: FriendRequestRecord) => {
    const [userA, userB] = [request.fromUserId, request.toUserId].sort();
    await db.friendships.put({ id: friendPairId(userA, userB), userA, userB, createdAt: new Date().toISOString() });
    await db.friendRequests.delete(request.id);
    await refreshSocial();
  };

  const declineRequest = async (request: FriendRequestRecord) => { await db.friendRequests.delete(request.id); await refreshSocial(); };
  const cancelFriendRequest = async (personId: string) => { await db.friendRequests.delete(requestId(user.id, personId)); await refreshSocial(); };
  const blockPerson = async (personId: string) => {
    await db.blocks.put({ id: `block:${user.id}:${personId}`, blockerId: user.id, blockedId: personId, createdAt: new Date().toISOString() });
    await db.friendships.delete(friendPairId(user.id, personId));
    await db.friendRequests.where('fromUserId').equals(user.id).and((request) => request.toUserId === personId).delete();
    await db.friendRequests.where('fromUserId').equals(personId).and((request) => request.toUserId === user.id).delete();
    await refreshSocial();
  };
  const unblockPerson = async (personId: string) => { await db.blocks.delete(`block:${user.id}:${personId}`); await refreshSocial(); };

  const copyUid = async () => {
    try { await navigator.clipboard.writeText(uid); setCopied(true); window.setTimeout(() => setCopied(false), 1400); }
    catch { setSaveError('Clipboard access is unavailable in this browser.'); }
  };

  const beginImageCrop = (file: File | undefined, target: 'avatar' | 'cover') => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
      setSaveError('Choose an image file smaller than 20 MB.');
      return;
    }
    setSaveError('');
    setCropTarget({ file, aspect: target === 'avatar' ? 1 : 1060 / 220, target });
  };

  const applyCrop = async (croppedImage: string) => {
    if (!cropTarget) return;
    try {
      await onUpdateProfile(cropTarget.target === 'avatar' ? { avatar: croppedImage } : { coverImage: croppedImage });
      setCropTarget(null);
      setSaveError('');
    } catch {
      setSaveError('Your image could not be saved. Try a smaller image.');
      throw new Error('Could not save profile image');
    }
  };

  const buttonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '9px 12px', borderRadius: '9px', border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.8)', color: '#cbd5e1', fontSize: '11px', fontWeight: 700, cursor: 'pointer' };
  const fieldStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 11px', borderRadius: '9px', border: '1px solid rgba(148,163,184,0.2)', background: '#0b1322', color: '#f8fafc', fontSize: '12px' };

  if (tab === 'community') return <div role="dialog" aria-modal="true" aria-label="Aetheria Community" className="community-page">
    <div className="community-page-shell">
      <header className="community-page-header">
        <div><div style={{ color: '#7dd3fc', fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>Aetheria</div><h1 style={{ margin: '4px 0 0', fontSize: 22 }}>Community</h1><p style={{ margin: '5px 0 0', color: '#718198', fontSize: 12 }}>Share ideas, ask questions, and connect around your projects.</p></div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}><button onClick={() => setTab('overview')} style={buttonStyle}><ArrowLeft size={14} />Back to profile</button><button onClick={onClose} aria-label="Close community" style={{ ...buttonStyle, width: 38, padding: 0 }}><X size={16} /></button></div>
      </header>
      <div className="community-page-content"><CommunityPanel user={user} friends={friends} /></div>
    </div>
  </div>;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${user.name}'s profile`} style={{ position: 'fixed', inset: 0, zIndex: 150, overflowY: 'auto', padding: 'clamp(12px, 3vw, 36px)', background: 'rgba(2,6,23,0.26)', backdropFilter: 'blur(3px)' }}>
      <div className="profile-card-shell" style={{ maxWidth: '1060px', minHeight: 'min(850px, calc(100vh - 48px))', margin: '0 auto', overflow: 'hidden', border: '1px solid rgba(148,163,184,0.16)', borderRadius: '22px', background: '#0c1422', boxShadow: '0 28px 90px rgba(0,0,0,0.55)' }}>
        <header style={{ height: '68px', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'rgba(56,189,248,0.12)', color: '#7dd3fc' }}><UserPlus size={16} /></div><span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.3px' }}>Aetheria profiles</span></div>
          <button onClick={onClose} aria-label="Close profile" style={{ ...buttonStyle, width: 36, height: 36, padding: 0 }}><X size={17} /></button>
        </header>

        <div className="profile-cover" style={{ height: '220px', position: 'relative', overflow: 'hidden', background: user.coverImage ? `linear-gradient(90deg,rgba(2,6,23,.22),rgba(2,6,23,.04)), url("${user.coverImage}") center 48% / cover` : 'radial-gradient(ellipse at 20% 10%, rgba(59,130,246,0.44), transparent 48%), radial-gradient(ellipse at 78% 20%, rgba(217,70,239,0.25), transparent 48%), linear-gradient(115deg,#172744,#12203b 50%,#211b3b)' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.3, backgroundImage: 'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '42px 42px', maskImage: 'linear-gradient(90deg,transparent,#000)' }} />
          <div style={{ position: 'absolute', right: 24, bottom: 18, color: 'rgba(226,232,240,.68)', fontSize: '10px', letterSpacing: '1.7px', fontWeight: 800 }}>PLAYER PROFILE · LOCAL PREVIEW</div>
          {editing && <><input ref={coverFileRef} type="file" accept="image/*" hidden onChange={(event) => { beginImageCrop(event.target.files?.[0], 'cover'); event.target.value = ''; }} />
          <button className="profile-cover-edit" onClick={() => coverFileRef.current?.click()} title="Upload and crop profile wallpaper"><ImagePlus size={14} /><span>Edit wallpaper</span></button></>}
        </div>

        <section style={{ padding: '0 clamp(18px, 4vw, 42px) 18px', display: 'grid', gridTemplateColumns: 'minmax(260px,1.4fr) minmax(250px,1fr)', gap: '20px', alignItems: 'end' }} className="profile-hero">
          <div style={{ display: 'flex', alignItems: 'end', gap: '18px', minWidth: 0, marginTop: '-56px' }}>
            <div className="profile-avatar-wrap">
              <img className="profile-avatar-image" src={user.avatar} alt={`${user.name}'s avatar`} style={{ width: '116px', height: '116px', flexShrink: 0, objectFit: 'cover', borderRadius: '24px', border: '4px solid #0c1422', background: '#17243a', boxShadow: '0 8px 30px rgba(0,0,0,.36)' }} />
              {editing && <><input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={(event) => { beginImageCrop(event.target.files?.[0], 'avatar'); event.target.value = ''; }} />
              <button className="profile-avatar-edit" onClick={() => avatarFileRef.current?.click()} title="Upload and crop profile photo" aria-label="Change profile photo"><Pencil size={14} /></button></>}
            </div>
            <div style={{ paddingBottom: '3px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}><h1 style={{ margin: 0, fontSize: 'clamp(21px,3vw,29px)', letterSpacing: '-0.8px' }}>{user.name}</h1><span style={{ padding: '4px 7px', borderRadius: '6px', background: 'rgba(56,189,248,0.14)', border: '1px solid rgba(56,189,248,0.22)', color: '#7dd3fc', fontSize: '9px', fontWeight: 800 }}>{user.role}</span></div>
              <div style={{ marginTop: '5px', color: '#94a3b8', fontSize: '12px', overflowWrap: 'anywhere' }}>{user.signature || 'Aetheria member'} · Joined {user.joinedDate}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingBottom: '4px', flexWrap: 'wrap' }}>
            <button onClick={() => { setEditing((value) => !value); setSaveError(''); }} style={{ ...buttonStyle, color: '#e2e8f0' }}><Pencil size={13} />{editing ? 'Close editor' : 'Edit profile'}</button>
            {user.role === 'ADMIN' && <button onClick={onOpenAdminModal} style={{ ...buttonStyle, color: '#fca5a5' }}><Shield size={13} />Admin</button>}
            <button onClick={onLogout} style={{ ...buttonStyle, color: '#fda4af' }}><DoorOpen size={13} />Sign out</button>
          </div>
        </section>

        <main style={{ padding: '0 clamp(18px, 4vw, 42px) 36px' }}>
          <section className="profile-stats" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '16px', alignItems: 'center', padding: '18px 0', borderTop: '1px solid rgba(148,163,184,0.12)', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 800, letterSpacing: '1px' }}>AETHERIA UID</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginTop: '6px', flexWrap: 'wrap' }}>
                <button type="button" title="Show or hide UID on the plane" onClick={() => { const next = !uidVisible; setUidVisible(next); void onUpdateProfile({ showUidOnPlane: next }).catch(() => { setUidVisible(!next); setSaveError('Could not update UID visibility.'); }); }} style={{ border: 0, padding: 0, color: '#7dd3fc', background: 'transparent', font: '750 13px ui-monospace,monospace', letterSpacing: '0.6px', cursor: 'pointer' }}>{uidVisible ? uid : '*'.repeat(Math.min(uid.length, 20))}</button>
                <button onClick={() => void copyUid()} style={{ ...buttonStyle, padding: '5px 8px', fontSize: '10px' }}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy UID'}</button>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: user.hideUid ? '#fbbf24' : '#34d399', fontSize: '10px' }}>{user.hideUid ? <LockKeyhole size={12} /> : <BadgeCheck size={12} />}{user.hideUid ? 'Hidden from discovery' : 'Discoverable'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'clamp(14px,3vw,30px)', textAlign: 'center' }}>
              <div><div style={{ color: '#64748b', fontSize: '10px' }}>Friends</div><div style={{ marginTop: 4, fontSize: '20px', fontWeight: 800 }}>{friends.length}</div></div>
              <div><div style={{ color: '#64748b', fontSize: '10px' }}>Models</div><div style={{ marginTop: 4, fontSize: '20px', fontWeight: 800 }}>{modelCards.length}</div></div>
              <div><div style={{ color: '#64748b', fontSize: '10px' }}>Decor</div><div style={{ marginTop: 4, fontSize: '20px', fontWeight: 800 }}>{decorCards.length}</div></div>
            </div>
          </section>

          {editing && <form onSubmit={saveProfile} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 18, padding: 16, borderRadius: 14, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(56,189,248,0.2)' }}>
            <label style={{ color: '#94a3b8', fontSize: 10 }}>Display name<input value={name} maxLength={48} onChange={(event) => setName(event.target.value)} style={{ ...fieldStyle, display: 'block', marginTop: 6 }} /></label>
            <label style={{ color: '#94a3b8', fontSize: 10 }}>Avatar image URL<input value={avatar} onChange={(event) => setAvatar(event.target.value)} style={{ ...fieldStyle, display: 'block', marginTop: 6 }} /></label>
            <label style={{ color: '#94a3b8', fontSize: 10 }}>Profile signature<textarea value={signature} maxLength={180} onChange={(event) => setSignature(event.target.value)} style={{ ...fieldStyle, display: 'block', minHeight: 42, marginTop: 6, resize: 'none' }} /></label>
            <label style={{ alignSelf: 'end', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 2px', color: '#cbd5e1', fontSize: 11, cursor: 'pointer' }}><input type="checkbox" checked={hideUid} onChange={(event) => setHideUid(event.target.checked)} /> Hide my UID from discovery</label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gridColumn: '1/-1' }}><span role="alert" style={{ color: '#fca5a5', fontSize: 10 }}>{saveError}</span><button type="submit" disabled={saving} style={{ ...buttonStyle, background: '#0284c7', borderColor: '#0284c7', color: 'white' }}>{saving ? <LoaderCircle size={13} /> : <Check size={13} />}{saving ? 'Saving…' : 'Save profile'}</button></div>
          </form>}

          <nav style={{ display: 'flex', gap: 24, marginTop: 18, borderBottom: '1px solid rgba(148,163,184,0.12)', overflowX: 'auto' }}>
            {(['overview', 'friends', 'album', 'community', 'blocked'] as const).map((item) => <button key={item} onClick={() => setTab(item)} style={{ padding: '10px 2px', border: 0, borderBottom: tab === item ? '2px solid #38bdf8' : '2px solid transparent', color: tab === item ? '#e2e8f0' : '#64748b', background: 'transparent', fontSize: 11, fontWeight: 750, textTransform: 'capitalize', cursor: 'pointer' }}>{item === 'friends' ? `Friends${incoming.length ? ` · ${incoming.length} requests` : ''}` : item}</button>)}
          </nav>

          {tab === 'overview' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 22, paddingTop: 20 }}>
            <ProfileCollection title="Models in use" icon={<Users size={15} />} cards={visibleModelCards} empty="No agent models in the current plane yet." />
            <ProfileCollection title="Decor in this plane" icon={<Box size={15} />} cards={visibleDecorCards} empty="No furniture placed in the current plane yet." />
          </div>}

          {tab === 'album' && <div style={{ display: 'grid', gap: 22, paddingTop: 20 }}>
            <ProfileAlbumSection title="Profile photos" current={user.avatar} images={user.avatarAlbum || []} dates={user.avatarAlbumDates} onChoose={(image) => onUpdateProfile({ avatar: image })} onDelete={(image) => onUpdateProfile({ avatarAlbum: (user.avatarAlbum || []).filter((entry) => entry !== image) })} />
            <ProfileAlbumSection title="Wallpapers" current={user.coverImage} images={user.coverAlbum || []} dates={user.coverAlbumDates} onChoose={(image) => onUpdateProfile({ coverImage: image })} onDelete={(image) => onUpdateProfile({ coverAlbum: (user.coverAlbum || []).filter((entry) => entry !== image) })} />
          </div>}

          {tab === 'friends' && <div style={{ paddingTop: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
              <section>
                <h2 style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><Users size={15} color="#38bdf8" />Your friends <span style={{ color: '#64748b', fontSize: 11 }}>({friends.length})</span></h2>
                {friends.length ? <div style={{ display: 'grid', gap: 8 }}>{friends.map((friend) => <PersonRow key={friend.id} person={friend} action={<button onClick={() => void blockPerson(friend.id)} style={{ ...buttonStyle, color: '#fda4af', padding: '7px 9px' }}><Shield size={12} />Block</button>} />)}</div> : <EmptyState>Friends will appear here when they accept your request.</EmptyState>}
              </section>
              <section>
                <h2 style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><Heart size={15} color="#f472b6" />Requests <span style={{ color: '#64748b', fontSize: 11 }}>({incoming.length})</span></h2>
                {incoming.length ? <div style={{ display: 'grid', gap: 8 }}>{incoming.map((request) => { const person = people.find((candidate) => candidate.id === request.fromUserId); return person ? <PersonRow key={request.id} person={person} action={<><button onClick={() => void acceptRequest(request)} style={{ ...buttonStyle, color: '#86efac', padding: '7px 9px' }}><Check size={12} />Accept</button><button onClick={() => void declineRequest(request)} aria-label="Decline request" style={{ ...buttonStyle, padding: '7px' }}><X size={13} /></button></>} /> : null; })}</div> : <EmptyState>No incoming requests.</EmptyState>}
                <section style={{ marginTop: 18 }}>
                  <h3 style={{ margin: '0 0 9px', display: 'flex', alignItems: 'center', gap: 7, color: '#94a3b8', fontSize: 11, fontWeight: 750 }}><UserPlus size={13} color="#38bdf8" />Sent requests <span style={{ color: '#64748b', fontWeight: 500 }}>({outgoingRequests.length})</span></h3>
                  {outgoingRequests.length ? <div style={{ display: 'grid', gap: 8 }}>{outgoingRequests.map((request) => {
                    const person = people.find((candidate) => candidate.id === request.toUserId);
                    if (!person) return null;
                    const requestedDate = new Date(request.createdAt);
                    const dateLabel = Number.isNaN(requestedDate.getTime()) ? 'Waiting for a response' : `Sent ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(requestedDate)}`;
                    return <PersonRow key={request.id} person={person} action={<button type="button" onClick={() => void cancelFriendRequest(person.id)} title={`Cancel request to ${person.name}`} style={{ ...buttonStyle, padding: '7px 9px', borderColor: 'rgba(248,113,113,.3)', background: 'rgba(127,29,29,.14)', color: '#fda4af' }}><X size={12} />Cancel</button>} subtitle={dateLabel} />;
                  })}</div> : <EmptyState>You haven’t sent any friend requests.</EmptyState>}
                </section>
              </section>
            </div>
            <section style={{ marginTop: 22, maxWidth: 640 }}>
              <h2 style={{ margin: '0 0 9px', fontSize: 13 }}>Find a player</h2>
              <div style={{ position: 'relative' }}><Search size={14} color="#64748b" style={{ position: 'absolute', left: 11, top: 12 }} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search visible UID or display name" style={{ ...fieldStyle, paddingLeft: 34 }} /></div>
              <p style={{ margin: '7px 0 10px', color: '#64748b', fontSize: 10 }}>This browser’s local directory only. Shared player search will be available after a multiplayer server is connected.</p>
              {socialLoading ? <EmptyState>Loading player directory…</EmptyState> : discoverablePeople.length ? <div style={{ display: 'grid', gap: 8 }}>{discoverablePeople.slice(0, 6).map((person) => <PersonRow key={person.id} person={person} action={outgoingIds.has(person.id) ? <button type="button" onClick={() => void cancelFriendRequest(person.id)} style={{ ...buttonStyle, color: '#fda4af', padding: '7px 9px', borderColor: 'rgba(248,113,113,.3)' }}><X size={12} />Cancel</button> : <button type="button" onClick={() => void addFriend(person)} style={{ ...buttonStyle, color: '#7dd3fc', padding: '7px 9px' }}><UserPlus size={12} />Add friend</button>} />)}</div> : search.trim() ? <EmptyState>No discoverable players match that search.</EmptyState> : <EmptyState>Enter a name or UID to look for players stored in this browser.</EmptyState>}
            </section>
          </div>}

          {tab === 'blocked' && <div style={{ maxWidth: 650, paddingTop: 20 }}><h2 style={{ margin: '0 0 10px', fontSize: 13 }}>Blocked players</h2>{selectedBlockedPeople.length ? <div style={{ display: 'grid', gap: 8 }}>{selectedBlockedPeople.map((person) => <PersonRow key={person.id} person={person} action={<button onClick={() => void unblockPerson(person.id)} style={{ ...buttonStyle, padding: '7px 10px' }}>Unblock</button>} />)}</div> : <EmptyState>You haven’t blocked anyone.</EmptyState>}</div>}
          {saveError && !editing && <div role="alert" style={{ marginTop: 14, color: '#fca5a5', fontSize: 11 }}>{saveError}</div>}
        </main>
      </div>
      {cropTarget && <ImageCropDialog file={cropTarget.file} aspect={cropTarget.aspect} label={cropTarget.target === 'avatar' ? 'Crop profile photo' : 'Crop profile wallpaper'} onCancel={() => setCropTarget(null)} onApply={applyCrop} />}
    </div>
  );
}

function ImageCropDialog({ file, aspect, label, onCancel, onApply }: { file: File; aspect: number; label: string; onCancel: () => void; onApply: (image: string) => Promise<void> }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [source, setSource] = useState('');
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setSource(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const clampOffset = (x: number, y: number, nextZoom = zoom) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect || !dimensions.width || !dimensions.height) return { x, y };
    const baseScale = Math.min(rect.width / dimensions.width, rect.height / dimensions.height);
    const cropWidth = Math.min(rect.width, rect.height * aspect);
    const cropHeight = cropWidth / aspect;
    const maxX = Math.max(0, (dimensions.width * baseScale * nextZoom - cropWidth) / 2);
    const maxY = Math.max(0, (dimensions.height * baseScale * nextZoom - cropHeight) / 2);
    return { x: THREE.MathUtils.clamp(x, -maxX, maxX), y: THREE.MathUtils.clamp(y, -maxY, maxY) };
  };

  const saveCrop = async () => {
    const image = imageRef.current;
    const frame = previewRef.current?.getBoundingClientRect();
    if (!image || !frame || !dimensions.width || !dimensions.height) return;
    setSaving(true);
    try {
      const baseScale = Math.min(frame.width / dimensions.width, frame.height / dimensions.height);
      const scale = baseScale * zoom;
      const cropFrameWidth = Math.min(frame.width, frame.height * aspect);
      const cropFrameHeight = cropFrameWidth / aspect;
      const cropWidth = cropFrameWidth / scale;
      const cropHeight = cropFrameHeight / scale;
      const centerX = dimensions.width / 2 - offset.x / scale;
      const centerY = dimensions.height / 2 - offset.y / scale;
      const sourceX = THREE.MathUtils.clamp(centerX - cropWidth / 2, 0, dimensions.width - cropWidth);
      const sourceY = THREE.MathUtils.clamp(centerY - cropHeight / 2, 0, dimensions.height - cropHeight);
      const outputWidth = aspect < 1.2 ? 640 : 1600;
      const outputHeight = Math.round(outputWidth / aspect);
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      context.fillStyle = '#0c1422';
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
      await onApply(canvas.toDataURL('image/jpeg', 0.9));
    } catch {
      setError('Could not crop this image. Try another image file.');
    } finally { setSaving(false); }
  };

  const panelWidth = aspect < 1.2 ? 'min(420px, calc(100vw - 32px))' : 'min(760px, calc(100vw - 32px))';
  const sourceAspect = dimensions.width && dimensions.height ? dimensions.width / dimensions.height : aspect;
  const maxStageHeight = Math.max(120, Math.min(window.innerHeight * 0.38, 360));
  const stageWidth = Math.max(1, Math.min(724, Math.max(160, window.innerWidth - 72), maxStageHeight * sourceAspect));
  const stageHeight = stageWidth / sourceAspect;
  const cropFrameWidth = Math.min(stageWidth, stageHeight * aspect);
  const cropFrameHeight = cropFrameWidth / aspect;

  return <div className="image-crop-overlay" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="image-crop-dialog" style={{ width: panelWidth }}>
      <header><div><h2>{label}</h2><p>Drag the image to frame it, then adjust the zoom.</p></div><button onClick={onCancel} aria-label="Cancel crop"><X size={18} /></button></header>
      {source && <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: 8, borderRadius: 9, border: '1px solid rgba(148,163,184,.16)', background: '#111b2b' }}><img src={source} alt="Full original image preview" style={{ width: 100, height: 64, objectFit: 'contain', borderRadius: 6, background: '#182337' }} /><span style={{ color: '#94a3b8', fontSize: 10, lineHeight: 1.5 }}>Full original · nothing is cropped until you apply the frame below.</span></div>}
      <div ref={previewRef} className={`image-crop-frame${aspect < 1.2 ? ' is-square' : ''}`} style={{ width: stageWidth, height: stageHeight, maxWidth: '100%' }} onPointerDown={(event) => { if (!dimensions.width) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }; }} onPointerMove={(event) => { const start = dragRef.current; if (!start || event.buttons === 0) return; setOffset(clampOffset(start.offsetX + event.clientX - start.x, start.offsetY + event.clientY - start.y)); }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
        {source && <img ref={imageRef} src={source} alt="Image crop preview" onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }} />}
        <div className="image-crop-guide" style={{ width: cropFrameWidth, height: cropFrameHeight }}><span>{aspect < 1.2 ? 'PROFILE PHOTO' : 'PROFILE COVER'}</span><Move size={15} /></div>
      </div>
      <label className="image-crop-zoom"><ZoomIn size={16} /><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => { const nextZoom = Number(event.target.value); setZoom(nextZoom); setOffset((current) => clampOffset(current.x, current.y, nextZoom)); }} /></label>
      {error && <p className="image-crop-error" role="alert">{error}</p>}
      <footer><button onClick={onCancel} className="crop-cancel">Cancel</button><button onClick={() => void saveCrop()} disabled={saving || !dimensions.width} className="crop-apply">{saving ? 'Applying…' : 'Use this image'}</button></footer>
    </section>
  </div>;
}

function ProfileAlbumSection({ title, current, images, dates, onChoose, onDelete }: { title: string; current?: string; images: string[]; dates?: Array<string | null>; onChoose: (image: string) => Promise<void>; onDelete: (image: string) => Promise<void> }) {
  const [folderOpen, setFolderOpen] = useState(false);
  const [preview, setPreview] = useState<{ image: string; active: boolean; savedAt: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [albumDateOrder, setAlbumDateOrder] = useState<'newest' | 'oldest'>('newest');
  const albumButtonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 11px', border: '1px solid rgba(148,163,184,.2)', borderRadius: 8, background: '#111b2b', color: '#cbd5e1', fontSize: 10, fontWeight: 700, cursor: 'pointer' };
  const entries = [
    ...(current ? [{ image: current, active: true, savedAt: null as string | null }] : []),
    ...images.filter((image) => image && image !== current).map((image) => ({ image, active: false, savedAt: dates?.[images.indexOf(image)] || null })),
  ];
  const sortedEntries = [...entries].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    const leftDate = left.savedAt ? Date.parse(left.savedAt) : 0;
    const rightDate = right.savedAt ? Date.parse(right.savedAt) : 0;
    return albumDateOrder === 'newest' ? rightDate - leftDate : leftDate - rightDate;
  });
  const coverImage = current || entries[0]?.image;
  const formatDate = (date: string | null) => {
    if (!date) return 'Date not recorded';
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? 'Date not recorded' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
  };
  const closePreview = () => { setPreview(null); setConfirmDelete(false); };
  const deleteImage = async () => {
    if (!preview || preview.active) return;
    setBusy(true);
    try { await onDelete(preview.image); closePreview(); }
    catch { setError('Could not delete this album image.'); }
    finally { setBusy(false); }
  };
  const useImage = async () => {
    if (!preview || preview.active) return;
    setBusy(true);
    try { await onChoose(preview.image); closePreview(); }
    catch { setError('Could not apply this album image.'); }
    finally { setBusy(false); }
  };

  return <section>
    <h2 style={{ margin: '0 0 10px', fontSize: 13 }}>{title}</h2>
    {entries.length ? <button type="button" onClick={() => { setFolderOpen(true); setError(''); }} aria-label={`Open ${title} album, ${entries.length} images`} style={{ position: 'relative', display: 'block', width: 'min(280px,100%)', padding: 0, overflow: 'hidden', border: '1px solid rgba(56,189,248,.45)', borderRadius: 13, background: '#101a2b', color: '#e2e8f0', textAlign: 'left', cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
      <img src={coverImage} alt={`${title} folder cover`} style={{ display: 'block', width: '100%', height: 154, objectFit: 'cover', background: '#172337' }} />
      <span style={{ position: 'absolute', top: 10, right: 10, padding: '5px 8px', border: '1px solid rgba(125,211,252,.35)', borderRadius: 999, background: 'rgba(2,6,23,.84)', color: '#bae6fd', fontSize: 10, fontWeight: 800 }}>{entries.length} {entries.length === 1 ? 'image' : 'images'}</span>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', fontSize: 11, fontWeight: 750 }}><span>{title}</span><span style={{ color: '#64748b', fontSize: 10 }}>Open album →</span></span>
    </button> : <EmptyState>No saved images yet. New photos and wallpapers will be added here when you change them.</EmptyState>}
    {error && <p role="alert" style={{ marginTop: 8, color: '#fca5a5', fontSize: 10 }}>{error}</p>}

    {folderOpen && createPortal(<div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFolderOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(2,6,23,.78)', backdropFilter: 'blur(8px)' }}>
      <section role="dialog" aria-modal="true" aria-label={`${title} album`} style={{ width: 'min(760px,calc(100vw - 36px))', height: 'min(680px,calc(100dvh - 36px))', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(56,189,248,.28)', borderRadius: 16, background: '#0c1422', boxShadow: '0 24px 80px rgba(0,0,0,.65)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 17px', borderBottom: '1px solid rgba(148,163,184,.15)' }}><div><div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 800 }}>{title}</div><div style={{ marginTop: 3, color: '#64748b', fontSize: 10 }}>{entries.length} {entries.length === 1 ? 'image' : 'images'} · sorted by saved date</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><label style={{ color: '#94a3b8', fontSize: 10 }}>Date<select aria-label="Sort album by date" value={albumDateOrder} onChange={(event) => setAlbumDateOrder(event.target.value as typeof albumDateOrder)} style={{ marginLeft: 7, padding: '7px 8px', border: '1px solid rgba(148,163,184,.2)', borderRadius: 8, background: '#111b2b', color: '#cbd5e1', fontSize: 10 }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><button type="button" onClick={() => setFolderOpen(false)} aria-label="Close album" style={{ ...albumButtonStyle, width: 32, height: 32, padding: 0 }}><X size={15} /></button></div></header>
        <div style={{ flex: 1, minHeight: 0, padding: 16, overflowY: 'auto' }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>{sortedEntries.map(({ image, active, savedAt }, index) => <article key={`${index}-${image.slice(0,32)}`} style={{ position: 'relative', overflow: 'hidden', border: active ? '1px solid #38bdf8' : '1px solid rgba(148,163,184,.16)', borderRadius: 12, background: '#101a2b' }}>
          <button type="button" onClick={() => { setPreview({ image, active, savedAt }); setConfirmDelete(false); }} title="Preview image" style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', color: '#cbd5e1', textAlign: 'left', cursor: 'pointer' }}><img src={image} alt={`${title} ${index + 1}`} style={{ display: 'block', width: '100%', height: 142, objectFit: 'cover', background: '#172337' }} /><span style={{ display: 'block', padding: '8px 9px 2px', fontSize: 10, fontWeight: 750 }}>{active ? 'Currently in use' : 'Saved image'}</span><span style={{ display: 'block', padding: '3px 9px 9px', color: '#64748b', fontSize: 9 }}>{active ? 'Active now' : formatDate(savedAt)}</span></button>
          {!active && <button type="button" onClick={() => { setPreview({ image, active, savedAt }); setConfirmDelete(true); }} aria-label="Delete saved image" title="Delete saved image" style={{ position: 'absolute', top: 7, right: 7, display: 'grid', placeItems: 'center', width: 30, height: 30, border: '1px solid rgba(248,113,113,.45)', borderRadius: 8, background: 'rgba(15,23,42,.92)', color: '#fca5a5', cursor: 'pointer' }}><Trash2 size={14} /></button>}
        </article>)}</div></div>
      </section>
    </div>, document.body)}

    {preview && createPortal(<div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePreview(); }} style={{ position: 'fixed', inset: 0, zIndex: 310, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(2,6,23,.88)', backdropFilter: 'blur(8px)' }}>
      <section role="dialog" aria-modal="true" aria-label={`${title} image preview`} style={{ width: 'min(880px,100%)', maxHeight: '88dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(56,189,248,.28)', borderRadius: 15, background: '#0c1422' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(148,163,184,.15)', color: '#e2e8f0', fontSize: 12, fontWeight: 750 }}>{title}<button type="button" onClick={closePreview} aria-label="Close preview" style={{ ...albumButtonStyle, width: 32, height: 32, padding: 0 }}><X size={15} /></button></header>
        <div style={{ minHeight: 0, flex: 1, display: 'grid', placeItems: 'center', padding: 14, overflow: 'auto' }}><img src={preview.image} alt={`${title} full preview`} style={{ maxWidth: '100%', maxHeight: '62dvh', objectFit: 'contain', borderRadius: 8 }} /></div>
        <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 12, borderTop: '1px solid rgba(148,163,184,.15)' }}>
          {confirmDelete ? <><span style={{ color: '#fca5a5', fontSize: 11 }}>Delete this saved image?</span><div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => setConfirmDelete(false)} style={albumButtonStyle}>Cancel</button><button type="button" disabled={busy} onClick={() => void deleteImage()} style={{ ...albumButtonStyle, color: '#fca5a5' }}>{busy ? <LoaderCircle size={13} /> : <Trash2 size={13} />}Delete</button></div></> : <><span style={{ color: '#64748b', fontSize: 10 }}>{preview.active ? 'Currently in use' : formatDate(preview.savedAt)}</span>{!preview.active && <div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={() => setConfirmDelete(true)} style={{ ...albumButtonStyle, color: '#fca5a5' }}><Trash2 size={13} />Delete</button><button type="button" disabled={busy} onClick={() => void useImage()} style={{ ...albumButtonStyle, background: '#0284c7', borderColor: '#0284c7', color: 'white' }}>{busy ? <LoaderCircle size={13} /> : null}Use image</button></div>}</>}
        </footer>
      </section>
    </div>, document.body)}
  </section>;
}

function ProfileCollection({ title, icon, cards, empty }: { title: string; icon: React.ReactNode; cards: ProfileCardItem[]; empty: string }) {
  return <section>
    <h2 style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>{icon}{title}</h2>
    {cards.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 9 }}>{cards.map((card) => <article key={card.id} style={{ minHeight: 105, overflow: 'hidden', borderRadius: 11, border: '1px solid rgba(148,163,184,0.12)', background: 'linear-gradient(145deg,rgba(30,41,59,.9),rgba(15,23,42,.9))' }}>
      <div style={{ height: 54, display: 'grid', placeItems: 'center', background: 'radial-gradient(ellipse at 40% 20%,rgba(56,189,248,.22),transparent),rgba(2,6,23,.5)' }}>{card.imageUrl ? <img src={card.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Image size={18} color="#38bdf8" />}</div>
      <div style={{ padding: '8px 9px' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 750 }}>{card.title}</div><div style={{ marginTop: 3, color: '#64748b', fontSize: 9 }}>{card.subtitle}</div></div>
    </article>)}</div> : <EmptyState>{empty}</EmptyState>}
  </section>;
}

function PersonRow({ person, action, subtitle }: { person: UserProfile; action: React.ReactNode; subtitle?: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '8px 10px', borderRadius: 11, border: '1px solid rgba(148,163,184,0.12)', background: 'rgba(15,23,42,.7)' }}>
    <img src={person.avatar} alt="" style={{ width: 36, height: 36, borderRadius: 11, objectFit: 'cover', background: '#17243a' }} />
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, fontSize: 11 }}>{person.name}</div><div style={{ marginTop: 3, color: '#64748b', fontSize: 9 }}>{profileUid(person)}</div>{subtitle && <div style={{ marginTop: 3, color: '#7dd3fc', fontSize: 9 }}>{subtitle}</div>}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{action}</div>
  </div>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '13px 14px', border: '1px dashed rgba(148,163,184,.18)', borderRadius: 11, color: '#64748b', fontSize: 10 }}>{children}</div>;
}
