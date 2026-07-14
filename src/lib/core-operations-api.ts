import { apiRequest, jsonBody } from './api-client';

export type CoreRankingItem = { rank: number; title: string; author: string; blurb: string; tags: string[]; url: string; rankChange: number | null };
export type CoreRankingSnapshot = { id: string; rankingDate: string; items: CoreRankingItem[]; analysis: { sampleSize: number; common: Array<{ element: string; count: number; share: number }>; disclaimer: string } };
export type CoreRankingSource = { id: string; platform: 'qidian' | 'fanqie'; listName: string; category: string; sourceUrl: string; enabled: boolean; authorizationNote: string; lastSuccessAt: string | null; lastErrorCode: string | null; latestSnapshot: CoreRankingSnapshot | null };
export type CoreRankingTask = { id: string; status: 'queued' | 'fetching' | 'parsing' | 'validating' | 'completed' | 'partial' | 'failed' | 'cancelled'; progress: number; error_code: string | null };
export type CorePublicationRecord = { id: string; work_id: string; chapter_id: string; platform: 'qidian' | 'fanqie'; platform_chapter_id: string | null; title: string; source_revision: number; published_at: string; created_at: string };
export type CoreBackupTarget = { id: string; work_id: string; label: string; target_type: 'webdav' | 's3-compatible'; enabled: number; interval_minutes: number; retention_hours: number; last_backup_at: string | null; next_backup_at: string | null; last_error_code: string | null };
export type CoreBackupRun = { id: string; target_id: string; status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'; attempt_count: number; error_code: string | null; created_at: string; finished_at: string | null };
export type CoreBackupObject = { id: string; target_id: string; run_id: string; work_id: string; object_key: string; content_hash: string; size_bytes: number; created_at: string; expires_at: string; delete_error_code: string | null };

function mutationHeaders(csrf: string) { return { Origin: window.location.origin, 'X-CSRF-Token': csrf }; }

export async function listCoreRankingSources(signal?: AbortSignal): Promise<CoreRankingSource[]> {
  return (await apiRequest<{ sources: CoreRankingSource[] }>('/api/core/rankings/sources', { signal })).sources;
}
export async function createCoreRankingSource(input: { platform: 'qidian' | 'fanqie'; listName: string; category: string; sourceUrl: string; authorizationNote: string }, csrf: string, signal?: AbortSignal): Promise<string> {
  return (await apiRequest<{ sourceId: string }>('/api/core/rankings/sources', { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody(input), signal })).sourceId;
}
export async function importCoreRanking(input: { sourceId: string; format: 'csv' | 'json'; content: string; rankingDate: string }, csrf: string, signal?: AbortSignal): Promise<{ snapshotId: string; itemCount: number }> {
  return apiRequest('/api/core/rankings/import', { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody(input), timeoutMs: 15_000, signal });
}
export async function createCoreRankingTask(sourceId: string | null, csrf: string, signal?: AbortSignal): Promise<{ taskId: string; status: 'queued' }> {
  return apiRequest('/api/core/rankings/tasks', { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody({ sourceId }), signal });
}
export async function getCoreRankingTask(taskId: string, signal?: AbortSignal): Promise<CoreRankingTask> {
  return (await apiRequest<{ task: CoreRankingTask }>(`/api/core/rankings/tasks/${encodeURIComponent(taskId)}`, { signal })).task;
}
export async function cancelCoreRankingTask(taskId: string, csrf: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(`/api/core/rankings/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE', headers: mutationHeaders(csrf), signal });
}
export async function listCorePublicationRecords(workId: string, signal?: AbortSignal): Promise<CorePublicationRecord[]> {
  return (await apiRequest<{ records: CorePublicationRecord[] }>(`/api/core/publications?workId=${encodeURIComponent(workId)}`, { signal })).records;
}
export async function recordCorePublication(input: { workId: string; chapterId: string; platform: 'qidian' | 'fanqie'; platformChapterId?: string; publishedAt?: string }, csrf: string, signal?: AbortSignal): Promise<string> {
  return (await apiRequest<{ recordId: string }>('/api/core/publications', { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody(input), signal })).recordId;
}
export async function listCoreBackups(signal?: AbortSignal): Promise<{ targets: CoreBackupTarget[]; runs: CoreBackupRun[]; objects: CoreBackupObject[]; configured: boolean }> {
  return apiRequest('/api/core/backups/targets', { signal });
}
export async function createCoreBackupTarget(input: { workId: string; label: string; targetType: 'webdav' | 's3-compatible'; intervalMinutes: number; retentionHours: number; config: Record<string, unknown> }, csrf: string, signal?: AbortSignal): Promise<string> {
  return (await apiRequest<{ targetId: string }>('/api/core/backups/targets', { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody(input), signal })).targetId;
}
export async function disableCoreBackupTarget(targetId: string, csrf: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(`/api/core/backups/targets/${encodeURIComponent(targetId)}`, { method: 'DELETE', headers: mutationHeaders(csrf), signal });
}
export async function runCoreBackup(targetId: string, csrf: string, signal?: AbortSignal): Promise<{ runId: string; status: 'queued' }> {
  return apiRequest('/api/core/backups/runs', { method: 'POST', headers: mutationHeaders(csrf), body: jsonBody({ targetId }), signal });
}
export async function deleteCoreBackupObject(objectId: string, csrf: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(`/api/core/backups/objects/${encodeURIComponent(objectId)}`, { method: 'DELETE', headers: mutationHeaders(csrf), signal });
}
export async function downloadCoreBackupObject(objectId: string, signal?: AbortSignal): Promise<Blob> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), 12_000);
  try {
    const response = await fetch(`/api/core/backups/objects/${encodeURIComponent(objectId)}`, { credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) throw new Error(`BACKUP_DOWNLOAD_${response.status}`);
    return response.blob();
  } finally { window.clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
