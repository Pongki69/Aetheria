import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, MessageCircle, Plus, Share2, Users, UserPlus, Check, X } from 'lucide-react';
import { db } from '../db/database';
import type { CommunityCommentRecord, CommunityGroupRecord, CommunityPostRecord, UserProfile } from '../types';

function fitTextarea(textarea: HTMLTextAreaElement, minHeight: number) {
  const maxHeight = Math.min(window.innerHeight * 0.4, 320);
  textarea.style.height = 'auto';
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

export function CommunityPanel({ user, friends = [] }: { user: UserProfile; friends?: UserProfile[] }) {
  const [groups, setGroups] = useState<CommunityGroupRecord[]>([]);
  const [posts, setPosts] = useState<CommunityPostRecord[]>([]);
  const [comments, setComments] = useState<CommunityCommentRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [postText, setPostText] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [showInvites, setShowInvites] = useState(false);
  const groupDescriptionRef = React.useRef<HTMLTextAreaElement>(null);
  const postTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  const refresh = async () => {
    const [storedGroups, storedPosts, storedComments] = await Promise.all([
      db.communityGroups.orderBy('createdAt').reverse().toArray(),
      db.communityPosts.orderBy('createdAt').reverse().toArray(),
      db.communityComments.orderBy('createdAt').toArray()
    ]);
    setGroups(storedGroups);
    setPosts(storedPosts);
    setComments(storedComments);
  };

  useEffect(() => { void refresh().catch((error) => { console.error('Unable to load community:', error); setNotice('Community data could not be loaded.'); }); }, []);
  useEffect(() => { if (groupDescriptionRef.current) fitTextarea(groupDescriptionRef.current, 64); }, [groupDescription]);
  useEffect(() => { if (postTextareaRef.current) fitTextarea(postTextareaRef.current, 74); }, [postText]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const isMember = !!selectedGroup?.members?.includes(user.id);
  const feedPosts = useMemo(() => posts.filter((post) => selectedGroupId ? post.groupId === selectedGroupId : !post.groupId), [posts, selectedGroupId]);
  const groupedComments = useMemo(() => comments.reduce<Record<string, CommunityCommentRecord[]>>((result, comment) => {
    (result[comment.postId] ||= []).push(comment);
    return result;
  }, {}), [comments]);

  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) return;
    const group: CommunityGroupRecord = { id: `community-group-${crypto.randomUUID()}`, ownerId: user.id, ownerName: user.name, name, description: groupDescription.trim(), members: [user.id], createdAt: new Date().toISOString() };
    try { await db.communityGroups.put(group); setGroupName(''); setGroupDescription(''); setShowGroupForm(false); setSelectedGroupId(group.id); setNotice('Group created.'); await refresh(); }
    catch (error) { console.error('Unable to create group:', error); setNotice('Could not create the group.'); }
  };

  const joinGroup = async (group: CommunityGroupRecord) => {
    const updated = { ...group, members: Array.from(new Set([...(group.members || []), user.id])) };
    await db.communityGroups.put(updated);
    await refresh();
  };

  const inviteFriend = async (friend: UserProfile) => {
    if (!selectedGroup) return;
    const updated = { ...selectedGroup, invitedUserIds: Array.from(new Set([...(selectedGroup.invitedUserIds || []), friend.id])) };
    await db.communityGroups.put(updated);
    await refresh();
  };

  const createPost = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = postText.trim();
    if (!text) return;
    if (selectedGroup && !isMember) { setNotice('Join this group before posting.'); return; }
    const post: CommunityPostRecord = { id: `community-post-${crypto.randomUUID()}`, ownerId: user.id, authorName: user.name, authorAvatar: user.avatar, ...(selectedGroupId ? { groupId: selectedGroupId } : {}), text, createdAt: new Date().toISOString() };
    await db.communityPosts.put(post);
    setPostText(''); setNotice('Your post is live.'); await refresh();
  };

  const createComment = async (event: React.FormEvent, postId: string) => {
    event.preventDefault();
    const text = (commentDrafts[postId] || '').trim();
    if (!text) return;
    const comment: CommunityCommentRecord = { id: `community-comment-${crypto.randomUUID()}`, postId, ownerId: user.id, authorName: user.name, text, createdAt: new Date().toISOString() };
    await db.communityComments.put(comment);
    setCommentDrafts((current) => ({ ...current, [postId]: '' }));
    await refresh();
  };

  const sharePost = async (post: CommunityPostRecord) => {
    const shared: CommunityPostRecord = { id: `community-post-${crypto.randomUUID()}`, ownerId: user.id, authorName: user.name, authorAvatar: user.avatar, text: 'Shared a community post', createdAt: new Date().toISOString(), sharedFromId: post.sharedFromId || post.id, sharedAuthorName: post.sharedAuthorName || post.authorName, sharedText: post.sharedText || post.text };
    await db.communityPosts.put(shared);
    setSelectedGroupId(null); setNotice('Post shared to the community feed.'); await refresh();
  };

  const inputStyle: React.CSSProperties = { boxSizing: 'border-box', width: '100%', padding: '10px 11px', borderRadius: 9, border: '1px solid rgba(148,163,184,.2)', background: '#0b1322', color: '#f8fafc', fontSize: 12 };

  return <section className="community-layout" style={{ display: 'grid', gap: 18, paddingTop: 18 }}>
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
      <button onClick={() => { setSelectedGroupId(null); setShowGroupForm(false); }} style={navButton(!selectedGroupId)}><MessageCircle size={14} /> Community feed</button>
      <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: 10, fontWeight: 800, letterSpacing: '.08em' }}><span>GROUPS · {groups.length}</span><button title="Create group" onClick={() => setShowGroupForm((open) => !open)} style={{ ...navButton(false), width: 28, minHeight: 28, justifyContent: 'center', padding: 0 }}><Plus size={14} /></button></div>
      {showGroupForm && <form onSubmit={(event) => void createGroup(event)} style={{ display: 'grid', gap: 7, padding: 10, borderRadius: 10, border: '1px solid rgba(56,189,248,.22)', background: 'rgba(15,23,42,.8)' }}><input value={groupName} maxLength={48} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" style={inputStyle} /><textarea ref={groupDescriptionRef} value={groupDescription} maxLength={180} onChange={(event) => setGroupDescription(event.target.value)} placeholder="What is this group for?" style={{ ...inputStyle, minHeight: 64, resize: 'none', overflowY: 'hidden' }} /><button type="submit" style={primaryButton}>Create group</button></form>}
      {groups.map((group) => <button key={group.id} onClick={() => { setSelectedGroupId(group.id); setShowGroupForm(false); }} style={{ ...navButton(selectedGroupId === group.id), alignItems: 'flex-start', flexDirection: 'column', gap: 5, minWidth: 0, overflowWrap: 'anywhere' }}><span style={{ display: 'flex', gap: 7, alignItems: 'center', minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}><Users size={13} />{group.name}</span><span style={{ color: '#64748b', fontSize: 9, fontWeight: 500, overflowWrap: 'anywhere' }}>{group.members?.length || 0} members · by {group.ownerName}</span></button>)}
      {!groups.length && <div style={{ padding: '10px 3px', color: '#64748b', fontSize: 10 }}>Start a group around an interest or project.</div>}
    </aside>

    <main style={{ minWidth: 0 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13, minWidth: 0 }}>
        {selectedGroup && <button aria-label="Back to community feed" onClick={() => setSelectedGroupId(null)} style={{ ...navButton(false), width: 36, minWidth: 36, minHeight: 36, flex: '0 0 36px', justifyContent: 'center', padding: 0 }}><ArrowLeft size={13} /></button>}
        <div style={{ minWidth: 0, flex: 1 }}><h2 style={{ margin: 0, fontSize: 17, overflowWrap: 'anywhere' }}>{selectedGroup?.name || 'Community'}</h2><p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 10, overflowWrap: 'anywhere' }}>{selectedGroup?.description || 'Share ideas, ask questions, and connect around your projects.'}</p></div>
        {selectedGroup && isMember && <button onClick={() => setShowInvites((open) => !open)} style={secondaryButton}><UserPlus size={13} />Invite friends</button>}
        {selectedGroup && !isMember && <button onClick={() => void joinGroup(selectedGroup)} style={primaryButton}>Join group</button>}
      </header>
      {showInvites && selectedGroup && <section style={{ marginBottom: 12, padding: 12, borderRadius: 11, border: '1px solid rgba(56,189,248,.2)', background: '#0d1727' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}><strong style={{ fontSize: 11 }}>Invite friends to {selectedGroup.name}</strong><button aria-label="Close invites" onClick={() => setShowInvites(false)} style={iconButton}><X size={14} /></button></div>
        {friends.length ? <div style={{ display: 'grid', gap: 6 }}>{friends.map((friend) => {
          const invited = selectedGroup.invitedUserIds?.includes(friend.id) || selectedGroup.members?.includes(friend.id);
          return <div key={friend.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 8, background: 'rgba(15,23,42,.7)' }}><img src={friend.avatar} alt="" style={{ width: 30, height: 30, borderRadius: 9, objectFit: 'cover', background: '#172337' }} /><span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, overflowWrap: 'anywhere' }}>{friend.name}</span><button disabled={!!invited} onClick={() => void inviteFriend(friend)} style={invited ? secondaryButton : primaryButton}>{invited ? <><Check size={12} />Invited</> : <><UserPlus size={12} />Invite</>}</button></div>;
        })}</div> : <div style={emptyStyle}>Add friends from your profile’s Friends tab before inviting them here.</div>}
      </section>}
      {notice && <div role="status" style={{ marginBottom: 10, color: '#7dd3fc', fontSize: 10 }}>{notice}</div>}
      {(!selectedGroup || isMember) && <form onSubmit={(event) => void createPost(event)} style={{ marginBottom: 14, padding: 12, borderRadius: 12, border: '1px solid rgba(148,163,184,.15)', background: 'rgba(15,23,42,.7)' }}><textarea ref={postTextareaRef} value={postText} onChange={(event) => setPostText(event.target.value)} maxLength={2000} placeholder={selectedGroup ? `Share with ${selectedGroup.name}…` : 'Start a community discussion…'} style={{ ...inputStyle, minHeight: 74, resize: 'none', overflowY: 'hidden' }} /><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, color: '#64748b', fontSize: 9 }}><span>{postText.length}/2000</span><button type="submit" disabled={!postText.trim()} style={primaryButton}>Post</button></div></form>}
      {selectedGroup && !isMember && <div style={emptyStyle}>Join the group to start a discussion and comment on posts.</div>}
      {feedPosts.length ? <div style={{ display: 'grid', gap: 10 }}>{feedPosts.map((post) => {
        const postComments = groupedComments[post.id] || [];
        return <article key={post.id} style={{ padding: 13, borderRadius: 12, border: '1px solid rgba(148,163,184,.15)', background: 'rgba(15,23,42,.6)' }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><img src={post.authorAvatar} alt="" style={{ width: 30, height: 30, borderRadius: 9, objectFit: 'cover', background: '#172337' }} /><div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 750 }}>{post.authorName}</div><div style={{ marginTop: 2, color: '#64748b', fontSize: 9 }}>{new Date(post.createdAt).toLocaleString()}</div></div>{post.groupId && <span style={{ color: '#7dd3fc', fontSize: 9 }}>{groups.find((group) => group.id === post.groupId)?.name}</span>}</div>
          <p style={{ margin: '12px 0 0', color: '#e2e8f0', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{post.text}</p>
          {post.sharedText && <blockquote style={{ margin: '10px 0 0', padding: 10, borderLeft: '2px solid #38bdf8', borderRadius: '0 8px 8px 0', background: 'rgba(2,6,23,.42)' }}><div style={{ color: '#7dd3fc', fontSize: 9, marginBottom: 5 }}>Originally shared by {post.sharedAuthorName}</div><div style={{ color: '#cbd5e1', fontSize: 11, whiteSpace: 'pre-wrap' }}>{post.sharedText}</div></blockquote>}
          <div style={{ display: 'flex', gap: 8, marginTop: 11, paddingTop: 9, borderTop: '1px solid rgba(148,163,184,.1)' }}>{(!selectedGroup || isMember) ? <button onClick={() => setExpandedComments((current) => { const next = new Set(current); next.has(post.id) ? next.delete(post.id) : next.add(post.id); return next; })} style={actionButton}><MessageCircle size={12} />{postComments.length} comments</button> : <span style={{ padding: '5px 7px', color: '#64748b', fontSize: 10 }}>Join to comment</span>}<button onClick={() => void sharePost(post)} style={actionButton}><Share2 size={12} />Share</button></div>
          {expandedComments.has(post.id) && <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>{postComments.map((comment) => <div key={comment.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(2,6,23,.35)' }}><strong style={{ fontSize: 10 }}>{comment.authorName}</strong><span style={{ marginLeft: 7, color: '#64748b', fontSize: 9 }}>{new Date(comment.createdAt).toLocaleString()}</span><div style={{ marginTop: 4, color: '#cbd5e1', fontSize: 11, whiteSpace: 'pre-wrap' }}>{comment.text}</div></div>)}<form onSubmit={(event) => void createComment(event, post.id)} style={{ display: 'flex', gap: 7 }}><input value={commentDrafts[post.id] || ''} maxLength={1000} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Write a comment…" style={{ ...inputStyle, flex: 1 }} /><button type="submit" aria-label="Send comment" style={primaryButton}><ChevronRight size={15} /></button></form></div>}
        </article>;
      })}</div> : <div style={emptyStyle}>No posts yet. Start the first discussion.</div>}
    </main>
  </section>;
}

const navButton = (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 38, padding: '8px 10px', borderRadius: 9, border: `1px solid ${active ? 'rgba(56,189,248,.35)' : 'rgba(148,163,184,.12)'}`, background: active ? 'rgba(2,132,199,.14)' : 'rgba(15,23,42,.55)', color: active ? '#bae6fd' : '#cbd5e1', textAlign: 'left', fontSize: 11, fontWeight: 700, cursor: 'pointer' });
const primaryButton: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 11px', borderRadius: 8, border: '1px solid #0284c7', background: '#0284c7', color: 'white', fontSize: 10, fontWeight: 750, whiteSpace: 'nowrap', cursor: 'pointer' };
const actionButton: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 7px', border: 0, background: 'transparent', color: '#94a3b8', fontSize: 10, cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { ...actionButton, padding: '8px 11px', borderRadius: 8, border: '1px solid rgba(148,163,184,.2)', background: 'rgba(15,23,42,.75)', color: '#cbd5e1', whiteSpace: 'nowrap' };
const iconButton: React.CSSProperties = { display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(148,163,184,.18)', background: 'rgba(15,23,42,.75)', color: '#cbd5e1', cursor: 'pointer' };
const emptyStyle: React.CSSProperties = { padding: 18, borderRadius: 11, border: '1px dashed rgba(148,163,184,.18)', color: '#64748b', fontSize: 11, textAlign: 'center' };
