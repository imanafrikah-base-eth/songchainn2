import type { AudienceProfile, Playlist } from '@/types/database';

type LocalAccount = {
  id: string;
  email: string;
  passwordHash: string;
  created_at: string;
};

type StoredPost = {
  id: string;
  user_id: string;
  content: string;
  song_id: string | null;
  playlist_id: string | null;
  image_url: string | null;
  image_path: string | null;
  post_type: 'text' | 'song_share' | 'playlist_share' | 'listening' | 'welcome' | 'song_like';
  created_at: string;
  updated_at: string;
};

type StoredComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

const KEYS = {
  accounts: 'songchainn:accounts',
  currentUserId: 'songchainn:currentUserId',
  profiles: 'songchainn:audienceProfiles',
  likedSongs: 'songchainn:likedSongs',
  likedArtists: 'songchainn:likedArtists',
  playlists: 'songchainn:playlists',
  playlistSongs: 'songchainn:playlistSongs',
  socialPosts: 'songchainn:socialPosts',
  postLikes: 'songchainn:postLikes',
  postComments: 'songchainn:postComments',
  userFollows: 'songchainn:userFollows',
  songComments: 'songchainn:songComments',
  commentLikes: 'songchainn:commentLikes',
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getCurrentUserId(): string | null {
  try {
    return localStorage.getItem(KEYS.currentUserId);
  } catch {
    return null;
  }
}

export function setCurrentUserId(userId: string | null) {
  try {
    if (!userId) {
      localStorage.removeItem(KEYS.currentUserId);
      return;
    }
    localStorage.setItem(KEYS.currentUserId, userId);
  } catch {
    return;
  }
}

export function listAccounts(): LocalAccount[] {
  return readJson<LocalAccount[]>(KEYS.accounts, []);
}

async function hashPassword(email: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`${email}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createAccount(email: string, password: string): Promise<LocalAccount> {
  const normalized = email.trim().toLowerCase();
  const accounts = listAccounts();
  if (accounts.some((a) => a.email === normalized)) {
    throw new Error('Account already exists');
  }
  const account: LocalAccount = {
    id: crypto.randomUUID(),
    email: normalized,
    passwordHash: await hashPassword(normalized, password),
    created_at: new Date().toISOString(),
  };
  accounts.push(account);
  writeJson(KEYS.accounts, accounts);
  return account;
}

export async function verifyAccount(email: string, password: string): Promise<LocalAccount | null> {
  const normalized = email.trim().toLowerCase();
  const account = listAccounts().find((a) => a.email === normalized);
  if (!account) return null;
  const hash = await hashPassword(normalized, password);
  if (account.passwordHash !== hash) return null;
  return account;
}

export function getAllProfiles(): Record<string, AudienceProfile> {
  return readJson<Record<string, AudienceProfile>>(KEYS.profiles, {});
}

export function getProfile(userId: string): AudienceProfile | null {
  const profiles = getAllProfiles();
  return profiles[userId] ?? null;
}

export function upsertProfile(next: AudienceProfile) {
  const profiles = getAllProfiles();
  profiles[next.id] = next;
  writeJson(KEYS.profiles, profiles);
}

export function ensureProfile(userId: string, seed?: Partial<AudienceProfile>) {
  const existing = getProfile(userId);
  if (existing) return existing;

  const base: AudienceProfile = {
    id: userId,
    user_id: userId,
    profile_name: seed?.profile_name ?? seed?.username ?? 'Listener',
    bio: seed?.bio ?? null,
    profile_picture_url: seed?.profile_picture_url ?? null,
    cover_photo_url: seed?.cover_photo_url ?? null,
    x_profile_link: seed?.x_profile_link ?? null,
    base_profile_link: seed?.base_profile_link ?? null,
    location: seed?.location ?? null,
    onboarding_completed: seed?.onboarding_completed ?? false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  upsertProfile(base);
  return base;
}

export function updateProfile(userId: string, patch: Partial<AudienceProfile>) {
  const existing = ensureProfile(userId);
  const next: AudienceProfile = {
    ...existing,
    ...patch,
    id: userId,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  upsertProfile(next);
  return next;
}

export function updateProfileImage(userId: string, field: 'profile_picture_url' | 'cover_photo_url', dataUrl: string) {
  return updateProfile(userId, { [field]: dataUrl } as any);
}

export function getLikedSongs(userId: string): string[] {
  const all = readJson<Record<string, string[]>>(KEYS.likedSongs, {});
  return all[userId] ?? [];
}

export function setLikedSongs(userId: string, songIds: string[]) {
  const all = readJson<Record<string, string[]>>(KEYS.likedSongs, {});
  all[userId] = Array.from(new Set(songIds));
  writeJson(KEYS.likedSongs, all);
}

export function getLikedArtists(userId: string): string[] {
  const all = readJson<Record<string, string[]>>(KEYS.likedArtists, {});
  return all[userId] ?? [];
}

export function setLikedArtists(userId: string, artistIds: string[]) {
  const all = readJson<Record<string, string[]>>(KEYS.likedArtists, {});
  all[userId] = Array.from(new Set(artistIds));
  writeJson(KEYS.likedArtists, all);
}

export function listPlaylists(userId: string): Playlist[] {
  const all = readJson<Record<string, Playlist[]>>(KEYS.playlists, {});
  return all[userId] ?? [];
}

export function savePlaylists(userId: string, playlists: Playlist[]) {
  const all = readJson<Record<string, Playlist[]>>(KEYS.playlists, {});
  all[userId] = playlists;
  writeJson(KEYS.playlists, all);
}

export function getPlaylistSongs(playlistId: string): string[] {
  const all = readJson<Record<string, string[]>>(KEYS.playlistSongs, {});
  return all[playlistId] ?? [];
}

export function setPlaylistSongs(playlistId: string, songIds: string[]) {
  const all = readJson<Record<string, string[]>>(KEYS.playlistSongs, {});
  all[playlistId] = Array.from(new Set(songIds));
  writeJson(KEYS.playlistSongs, all);
}

export function listSocialPosts(): StoredPost[] {
  return readJson<StoredPost[]>(KEYS.socialPosts, []);
}

export function saveSocialPosts(posts: StoredPost[]) {
  writeJson(KEYS.socialPosts, posts);
}

export function listPostLikes(): Record<string, string[]> {
  return readJson<Record<string, string[]>>(KEYS.postLikes, {});
}

export function savePostLikes(map: Record<string, string[]>) {
  writeJson(KEYS.postLikes, map);
}

export function listPostComments(): StoredComment[] {
  return readJson<StoredComment[]>(KEYS.postComments, []);
}

export function savePostComments(comments: StoredComment[]) {
  writeJson(KEYS.postComments, comments);
}

export function listFollows(): Record<string, string[]> {
  return readJson<Record<string, string[]>>(KEYS.userFollows, {});
}

export function saveFollows(map: Record<string, string[]>) {
  writeJson(KEYS.userFollows, map);
}

export function listSongComments(): Record<string, { id: string; user_id: string; song_id: string; content: string; created_at: string; updated_at: string }[]> {
  return readJson(KEYS.songComments, {});
}

export function saveSongComments(map: Record<string, { id: string; user_id: string; song_id: string; content: string; created_at: string; updated_at: string }[]>) {
  writeJson(KEYS.songComments, map);
}

export function listCommentLikes(): Record<string, string[]> {
  return readJson<Record<string, string[]>>(KEYS.commentLikes, {});
}

export function saveCommentLikes(map: Record<string, string[]>) {
  writeJson(KEYS.commentLikes, map);
}

export function listAllLikedSongsMap(): Record<string, string[]> {
  return readJson<Record<string, string[]>>(KEYS.likedSongs, {});
}

export function listAllLikedArtistsMap(): Record<string, string[]> {
  return readJson<Record<string, string[]>>(KEYS.likedArtists, {});
}
