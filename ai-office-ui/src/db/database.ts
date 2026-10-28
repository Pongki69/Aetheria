import Dexie, { type Table } from 'dexie';
import type { AgentData, CommunityCommentRecord, CommunityGroupRecord, CommunityPostRecord, FriendRequestRecord, FriendshipRecord, PlayerMessageRecord, UserBlockRecord, UserProfile, UserSession, WorldSettingsRecord } from '../types';

export interface BannedIP {
  ip: string;
  reason: string;
  bannedAt: string;
}

export interface StoredAgent extends Omit<AgentData, 'startPos'> {
  ownerId?: string;
  startPosX: number;
  startPosY: number;
  startPosZ: number;
  modelBlob?: Blob;
}

export interface StoredFurniture {
  ownerId?: string;
  id: string;
  label: string;
  category: string;
  modelUrl: string;
  scale: number;
  position: [number, number, number];
  rotationY: number;
  rotationX?: number;
  rotationZ?: number;
  collection?: string;
  modelBlob?: Blob;
}

export interface StoredMessage {
  ownerId?: string;
  id: string;
  sender: 'user' | 'agent' | 'system';
  agentId?: string;
  text: string;
  timestamp: string;
  attachmentBlob?: Blob;
  attachmentType?: string;
  attachmentName?: string;
  attachmentSize?: number;
  deletedAt?: string;
  deletedBy?: string;
}

export interface AdminMessageArchive extends StoredMessage { archivedAt: string; }

export interface StoredRule {
  ownerId?: string;
  id: string;
  text: string;
  active: boolean;
}

export interface AppStateRecord {
  key: string;
  currentSessionId?: string;
  selectedAgentId?: string | null;
  selectedFurnitureId?: string | null;
  activeTab?: 'DIRECT' | 'DECOR' | 'RULES';
}

export class AetheriaDatabase extends Dexie {
  users!: Table<UserProfile>;
  sessions!: Table<UserSession>;
  bannedIPs!: Table<BannedIP>;
  agents!: Table<StoredAgent, string>;
  furniture!: Table<StoredFurniture, string>;
  messages!: Table<StoredMessage, string>;
  adminMessageArchive!: Table<AdminMessageArchive, string>;
  rules!: Table<StoredRule, string>;
  appState!: Table<AppStateRecord, string>;
  friendRequests!: Table<FriendRequestRecord, string>;
  friendships!: Table<FriendshipRecord, string>;
  blocks!: Table<UserBlockRecord, string>;
  worldSettings!: Table<WorldSettingsRecord, string>;
  communityGroups!: Table<CommunityGroupRecord, string>;
  communityPosts!: Table<CommunityPostRecord, string>;
  communityComments!: Table<CommunityCommentRecord, string>;
  playerMessages!: Table<PlayerMessageRecord, string>;

  constructor() {
    super('AetheriaDB');
    this.version(2).stores({
      users: 'id, email, role',
      sessions: 'id, userId, status, userEmail',
      bannedIPs: 'ip'
    });
    this.version(3).stores({
      users: 'id, email, role',
      sessions: 'id, userId, status, userEmail',
      bannedIPs: 'ip',
      agents: 'id, name, role, status',
      furniture: 'id, label, category',
      messages: 'id, agentId, timestamp',
      rules: 'id, active',
      appState: 'key'
    });
    this.version(4).stores({
      users: 'id, email, role, uid',
      sessions: 'id, userId, status, userEmail',
      bannedIPs: 'ip',
      agents: 'id, name, role, status',
      furniture: 'id, label, category',
      messages: 'id, agentId, timestamp',
      rules: 'id, active',
      appState: 'key',
      friendRequests: 'id, fromUserId, toUserId, status, createdAt',
      friendships: 'id, userA, userB',
      blocks: 'id, blockerId, blockedId',
      worldSettings: 'userId'
    });
    this.version(5).stores({
      users: 'id, email, role, uid',
      sessions: 'id, userId, status, userEmail',
      bannedIPs: 'ip',
      agents: 'id, ownerId, name, role, status',
      furniture: 'id, ownerId, label, category',
      messages: 'id, ownerId, agentId, timestamp',
      rules: 'id, ownerId, active',
      appState: 'key',
      friendRequests: 'id, fromUserId, toUserId, status, createdAt',
      friendships: 'id, userA, userB',
      blocks: 'id, blockerId, blockedId',
      worldSettings: 'userId'
    });
    this.version(6).stores({
      users: 'id, email, role, uid',
      sessions: 'id, userId, status, userEmail',
      bannedIPs: 'ip',
      agents: 'id, ownerId, name, role, status',
      furniture: 'id, ownerId, label, category',
      messages: 'id, ownerId, agentId, timestamp, deletedAt',
      adminMessageArchive: 'id, ownerId, agentId, timestamp, archivedAt',
      rules: 'id, ownerId, active',
      appState: 'key',
      friendRequests: 'id, fromUserId, toUserId, status, createdAt',
      friendships: 'id, userA, userB',
      blocks: 'id, blockerId, blockedId',
      worldSettings: 'userId'
    });
    this.version(7).stores({
      users: 'id, email, role, uid',
      sessions: 'id, userId, status, userEmail',
      bannedIPs: 'ip',
      agents: 'id, ownerId, name, role, status',
      furniture: 'id, ownerId, label, category',
      messages: 'id, ownerId, agentId, timestamp, deletedAt',
      adminMessageArchive: 'id, ownerId, agentId, timestamp, archivedAt',
      rules: 'id, ownerId, active',
      appState: 'key',
      friendRequests: 'id, fromUserId, toUserId, status, createdAt',
      friendships: 'id, userA, userB',
      blocks: 'id, blockerId, blockedId',
      worldSettings: 'userId',
      communityGroups: 'id, ownerId, name, createdAt',
      communityPosts: 'id, ownerId, groupId, createdAt, sharedFromId',
      communityComments: 'id, postId, ownerId, createdAt'
    });
    this.version(8).stores({
      users: 'id, email, role, uid',
      sessions: 'id, userId, status, userEmail',
      bannedIPs: 'ip',
      agents: 'id, ownerId, name, role, status',
      furniture: 'id, ownerId, label, category',
      messages: 'id, ownerId, agentId, timestamp, deletedAt',
      adminMessageArchive: 'id, ownerId, agentId, timestamp, archivedAt',
      rules: 'id, ownerId, active',
      appState: 'key',
      friendRequests: 'id, fromUserId, toUserId, status, createdAt',
      friendships: 'id, userA, userB',
      blocks: 'id, blockerId, blockedId',
      worldSettings: 'userId',
      communityGroups: 'id, ownerId, name, createdAt',
      communityPosts: 'id, ownerId, groupId, createdAt, sharedFromId',
      communityComments: 'id, postId, ownerId, createdAt',
      playerMessages: 'id, fromUserId, toUserId, sentAt'
    });
  }
}

export const db = new AetheriaDatabase();
