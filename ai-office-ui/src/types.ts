import * as THREE from 'three';
import type { AnimationRetargeting } from './services/animationRetargeting';

export type AgentStatus = 'ACTIVE' | 'PROCESSING' | 'STANDBY' | 'DEGRADED' | 'OFFLINE' | 'SCHEDULED';
export type AnimState = 'idle' | 'idleAction' | 'walking' | 'dragged' | 'working' | 'sleeping';

export interface AgentData {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  statusText: string;
  instructions: string;
  modelName: string;
  aiProvider?: 'openrouter' | 'gemini' | 'groq' | 'lmstudio';
  aiModelId?: string;
  localModelProfile?: 'high' | 'medium' | 'low' | 'lowest';
  modelContext: string;
  modelUrl: string;
  idleAnimation?: string;
  walkingAnimation?: string;
  animationRetargeting?: AnimationRetargeting;
  terminatedAt?: string;
  startPos: THREE.Vector3;
  scale?: number;
  liveThoughts?: boolean;
  savedThoughts?: string[];
  modelHiddenParts?: string[];
  modelUseVertexColors?: boolean;
  modelRotation?: [number, number, number];
}

export type UserRole = 'USER' | 'ADMIN' | 'SUPERADMIN';

export interface UserProfile {
  id: string;
  uid?: string;
  hideUid?: boolean;
  coverImage?: string;
  avatarAlbum?: string[];
  coverAlbum?: string[];
  avatarAlbumDates?: Array<string | null>;
  coverAlbumDates?: Array<string | null>;
  showUidOnPlane?: boolean;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  ip: string;
  joinedDate: string;
  signature?: string;
}

export interface FriendRequestRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'PENDING';
  createdAt: string;
}

export interface FriendshipRecord {
  id: string;
  userA: string;
  userB: string;
  createdAt: string;
}

export interface UserBlockRecord {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

export interface CommunityGroupRecord {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  description: string;
  members: string[];
  invitedUserIds?: string[];
  createdAt: string;
}

export interface CommunityPostRecord {
  id: string;
  ownerId: string;
  authorName: string;
  authorAvatar: string;
  groupId?: string;
  text: string;
  createdAt: string;
  sharedFromId?: string;
  sharedAuthorName?: string;
  sharedText?: string;
}

export interface CommunityCommentRecord {
  id: string;
  postId: string;
  ownerId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface PlayerMessageRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  fromAvatar: string;
  text: string;
  sentAt: string;
}

export interface WorldSettingsRecord {
  userId: string;
  planeX: number;
  planeZ: number;
  renderDistance: number;
  interiorOnly: boolean;
  showInteriorBox: boolean;
  interiorX: number;
  interiorZ: number;
  interiorWidth: number;
  interiorDepth: number;
  interiorHeight: number;
}

export interface UserSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  avatarUrl: string;
  role: UserRole;
  ipAddress: string;
  location: string;
  browser: string;
  loginMethod: 'GOOGLE' | 'CREDENTIALS';
  lastActive: string;
  status: 'ACTIVE' | 'TERMINATED';
}
