import type { JSONContent } from '@tiptap/core';
import { ApiError, apiRequest, jsonBody } from './api-client';

export type CoreUser = { id: string; account: string; platformRole: 'OWNER' | 'WRITER' };
export type CoreSession = { user: CoreUser; csrf: string; expiresAt: string; renewed: boolean };
export type CoreWorkKind = 'long' | 'short' | 'essay';
export type CanonicalDocument = JSONContent & { type: 'doc'; schemaVersion?: number };
export type CoreWorkSummary = { id: string; title: string; kind: CoreWorkKind; status: string; updatedAt: string; role: 'WORK_OWNER' | 'EDITOR' | 'COMMENTER' | 'VIEWER'; totalWordCount: number };
export type CoreDirectoryChapter = { id: string; workId: string; volumeId: string; title: string; wordCount: number; revision: number; position: number };
export type CoreVolume = { id: string; workId: string; title: string; position: number; chapters: CoreDirectoryChapter[] };
export type CoreWorkDirectory = { id: string; title: string; kind: CoreWorkKind; status: string; updatedAt: string; role: CoreWorkSummary['role']; volumes: CoreVolume[] };
export type CoreChapter = { id: string; workId: string; title: string; canonicalContent: CanonicalDocument; plainText: string; revision: number };
export type CoreSaveResult = { kind: 'saved'; revision: number } | { kind: 'conflict'; currentRevision: number; conflictId: string };
export type CorePrivateNote = { id: string; chapterId: string; body: string; updatedAt: string };
export type CoreChapterVersion = { id: string; chapterId: string; label: string | null; reason: string; sourceRevision: number; wordCount: number; createdAt: string };
export type CoreProfileSettings = { theme: 'paper' | 'warm' | 'gray' | 'dark'; fontSize: number; lineHeight: number; editorWidth: 'narrow' | 'comfortable' | 'wide'; leftColumnWidth: number; rightColumnWidth: number; updatedAt: string };
export type CoreWritingStats = { date: string; addedCharacters: number; streakDays: number };
export type CoreWorkSearchResult = { chapterId: string; chapterTitle: string; volumeTitle: string; snippet: string; matchCount: number };
export type CoreTrashedChapter = { id: string; workId: string; volumeId: string; title: string; deletedAt: string; deleteReason: string | null };

function originHeader(): Record<string, string> {
  return typeof window === 'undefined' ? {} : { Origin: window.location.origin };
}

function mutationHeaders(csrf: string): Record<string, string> {
  return { ...originHeader(), 'X-CSRF-Token': csrf };
}

function canonical(value: JSONContent): CanonicalDocument {
  if (value.type !== 'doc') throw new Error('INVALID_CANONICAL_CONTENT');
  return { ...value, schemaVersion: 1 } as CanonicalDocument;
}

export async function getCoreSession(signal?: AbortSignal): Promise<CoreSession | null> {
  try {
    return await apiRequest<CoreSession>('/api/core/auth/session', { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function initializeCoreOwner(input: { key: string; account: string; password: string }, signal?: AbortSignal): Promise<void> {
  await apiRequest('/api/core/auth/initialize', { method: 'POST', headers: originHeader(), body: jsonBody(input), signal });
}

export async function loginCore(input: { account: string; password: string }, signal?: AbortSignal): Promise<{ user: CoreUser; csrf: string }> {
  return apiRequest('/api/core/auth/login', { method: 'POST', headers: originHeader(), body: jsonBody(input), signal });
}

export async function logoutCore(csrf: string, signal?: AbortSignal): Promise<void> {
  await apiRequest('/api/core/auth/logout', { method: 'POST', headers: mutationHeaders(csrf), signal });
}

export async function getLocalDraftDek(signal?: AbortSignal): Promise<Uint8Array> {
  const value = await apiRequest<{ dek: string; version: number }>('/api/core/auth/draft-key', { signal });
  if (value.version !== 1 || !value.dek) throw new Error('LOCAL_DRAFT_KEY_UNAVAILABLE');
  const normalized = value.dek.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.dek.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  if (bytes.byteLength !== 32) throw new Error('LOCAL_DRAFT_KEY_UNAVAILABLE');
  return bytes;
}

export async function listCoreWorks(signal?: AbortSignal): Promise<CoreWorkSummary[]> {
  return (await apiRequest<{ works: CoreWorkSummary[] }>('/api/core/works', { signal })).works;
}

export async function createCoreWork(input: { title: string; kind: CoreWorkKind }, csrf: string, signal?: AbortSignal): Promise<{ work: { id: string }; volume: { id: string }; chapter: { id: string } }> {
  return apiRequest('/api/core/works', { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody(input), signal });
}

export async function getCoreWork(workId: string, signal?: AbortSignal): Promise<CoreWorkDirectory> {
  return (await apiRequest<{ work: CoreWorkDirectory }>(`/api/core/works/${encodeURIComponent(workId)}`, { signal })).work;
}

export async function createCoreChapter(workId: string, input: { volumeId?: string; title?: string }, csrf: string, signal?: AbortSignal): Promise<CoreDirectoryChapter> {
  return (await apiRequest<{ chapter: CoreDirectoryChapter }>(`/api/core/works/${encodeURIComponent(workId)}/chapters`, { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody(input), signal })).chapter;
}

export async function createCoreVolume(workId: string, title: string, csrf: string, signal?: AbortSignal): Promise<CoreVolume> {
  return (await apiRequest<{ volume: CoreVolume }>(`/api/core/works/${encodeURIComponent(workId)}/volumes`, { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody({ title }), signal })).volume;
}

export async function renameCoreVolume(workId: string, volumeId: string, title: string, csrf: string, signal?: AbortSignal): Promise<CoreVolume> {
  return (await apiRequest<{ volume: CoreVolume }>(`/api/core/works/${encodeURIComponent(workId)}/volumes/${encodeURIComponent(volumeId)}`, { method: 'PATCH', headers: mutationHeaders(csrf), body: jsonBody({ title }), signal })).volume;
}

export async function reorderCoreChapters(workId: string, volumeId: string, chapterIds: string[], csrf: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(`/api/core/works/${encodeURIComponent(workId)}/volumes/${encodeURIComponent(volumeId)}/chapters/order`, { method: 'PUT', headers: mutationHeaders(csrf), body: jsonBody({ chapterIds }), signal });
}

export async function searchCoreWork(workId: string, query: string, signal?: AbortSignal): Promise<CoreWorkSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  return (await apiRequest<{ results: CoreWorkSearchResult[] }>(`/api/core/works/${encodeURIComponent(workId)}/search?${params}`, { signal })).results;
}

export async function listCoreTrashedChapters(workId: string, signal?: AbortSignal): Promise<CoreTrashedChapter[]> {
  return (await apiRequest<{ chapters: CoreTrashedChapter[] }>(`/api/core/works/${encodeURIComponent(workId)}/trash`, { signal })).chapters;
}

export async function deleteCoreChapter(chapterId: string, csrf: string, reason?: string, signal?: AbortSignal): Promise<{ workId: string }> {
  return apiRequest(`/api/core/chapters/${encodeURIComponent(chapterId)}`, { method: 'DELETE', headers: mutationHeaders(csrf), body: jsonBody({ reason }), signal });
}

export async function restoreCoreTrashedChapter(workId: string, chapterId: string, csrf: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(`/api/core/works/${encodeURIComponent(workId)}/trash/${encodeURIComponent(chapterId)}/restore`, { method: 'POST', headers: mutationHeaders(csrf), signal });
}

export async function getCoreChapter(chapterId: string, signal?: AbortSignal): Promise<CoreChapter> {
  return (await apiRequest<{ chapter: CoreChapter }>(`/api/core/chapters/${encodeURIComponent(chapterId)}`, { signal })).chapter;
}

export async function renameCoreChapter(chapterId: string, title: string, csrf: string, signal?: AbortSignal): Promise<CoreChapter> {
  return (await apiRequest<{ chapter: CoreChapter }>(`/api/core/chapters/${encodeURIComponent(chapterId)}`, { method: 'PATCH', headers: mutationHeaders(csrf), body: jsonBody({ title }), signal })).chapter;
}

export async function saveCoreChapter(input: { chapterId: string; baseRevision: number; canonicalContent: JSONContent; clientOperationId: string }, csrf: string, signal?: AbortSignal): Promise<CoreSaveResult> {
  return apiRequest(`/api/core/chapters/${encodeURIComponent(input.chapterId)}`, {
    method: 'PUT',
    headers: mutationHeaders(csrf),
    body: jsonBody({ baseRevision: input.baseRevision, canonicalContent: canonical(input.canonicalContent), clientOperationId: input.clientOperationId }),
    signal
  });
}

export async function getCorePrivateNote(chapterId: string, signal?: AbortSignal): Promise<CorePrivateNote | null> {
  return (await apiRequest<{ note: CorePrivateNote | null }>(`/api/core/chapters/${encodeURIComponent(chapterId)}/note`, { signal })).note;
}

export async function saveCorePrivateNote(chapterId: string, body: string, csrf: string, signal?: AbortSignal): Promise<CorePrivateNote> {
  return (await apiRequest<{ note: CorePrivateNote }>(`/api/core/chapters/${encodeURIComponent(chapterId)}/note`, { method: 'PUT', headers: mutationHeaders(csrf), body: jsonBody({ body }), signal })).note;
}

export async function listCoreChapterVersions(chapterId: string, signal?: AbortSignal): Promise<CoreChapterVersion[]> {
  return (await apiRequest<{ versions: CoreChapterVersion[] }>(`/api/core/chapters/${encodeURIComponent(chapterId)}/versions`, { signal })).versions;
}

export async function createCoreChapterVersion(chapterId: string, label: string, csrf: string, signal?: AbortSignal): Promise<CoreChapterVersion> {
  return (await apiRequest<{ version: CoreChapterVersion }>(`/api/core/chapters/${encodeURIComponent(chapterId)}/versions`, { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody({ label }), signal })).version;
}

export async function restoreCoreChapterVersion(chapterId: string, versionId: string, baseRevision: number, csrf: string, signal?: AbortSignal): Promise<CoreChapter> {
  return (await apiRequest<{ chapter: CoreChapter }>(`/api/core/chapters/${encodeURIComponent(chapterId)}/versions/${encodeURIComponent(versionId)}/restore`, { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody({ baseRevision }), signal })).chapter;
}

export async function getCoreProfileSettings(signal?: AbortSignal): Promise<CoreProfileSettings> {
  return (await apiRequest<{ settings: CoreProfileSettings }>('/api/core/profile-settings', { signal })).settings;
}

export async function saveCoreProfileSettings(settings: Omit<CoreProfileSettings, 'updatedAt'>, csrf: string, signal?: AbortSignal): Promise<CoreProfileSettings> {
  return (await apiRequest<{ settings: CoreProfileSettings }>('/api/core/profile-settings', { method: 'PUT', headers: mutationHeaders(csrf), body: jsonBody(settings), signal })).settings;
}

export async function getCoreWritingStats(signal?: AbortSignal): Promise<CoreWritingStats> {
  return (await apiRequest<{ stats: CoreWritingStats }>('/api/core/writing-stats', { signal })).stats;
}
