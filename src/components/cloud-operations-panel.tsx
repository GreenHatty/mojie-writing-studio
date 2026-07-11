'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiRequest, jsonBody } from '../lib/api-client';
import type { WorkDetail } from '../lib/repository';

type CloudWorkResponse = {
  work: {
    work_id: string;
    title: string;
    revision: number;
    content_hash: string;
    updated_at: string;
    payload: WorkDetail;
  };
};

type BackupPolicy = {
  id: string;
  work_id: string | null;
  target_type: 'r2' | 'webdav' | 's3-compatible';
  enabled: number;
  interval_minutes: number;
  retention_hours: number;
  last_backup_at: string | null;
  next_backup_at: string | null;
  last_error: string | null;
};

type CloudOperationsPanelProps = {
  work: WorkDetail;
};

function downloadJson(value: unknown, fileName: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function CloudOperationsPanel({ work }: CloudOperationsPanelProps) {
  const [cloudRevision, setCloudRevision] = useState<number | null>(null);
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [policies, setPolicies] = useState<BackupPolicy[]>([]);
  const [targetType, setTargetType] = useState<'r2' | 'webdav' | 's3-compatible'>('r2');
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [retentionHours, setRetentionHours] = useState(72);
  const [webdav, setWebdav] = useState({ baseUrl: '', username: '', password: '' });
  const [s3, setS3] = useState({ endpoint: '', bucket: '', region: 'auto', accessKeyId: '', secretAccessKey: '', pathStyle: true });

  async function refreshCloudStatus() {
    try {
      const response = await apiRequest<CloudWorkResponse>(`/api/cloud/works/${encodeURIComponent(work.id)}`);
      setCloudRevision(response.work.revision);
      setCloudUpdatedAt(response.work.updated_at);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setCloudRevision(0);
        setCloudUpdatedAt('');
        return;
      }
      setStatus(error instanceof Error ? error.message : '云端状态读取失败。');
    }
  }

  async function refreshPolicies() {
    try {
      const response = await apiRequest<{ policies: BackupPolicy[] }>('/api/backups/policies');
      setPolicies(response.policies.filter((policy) => !policy.work_id || policy.work_id === work.id));
    } catch {
      setPolicies([]);
    }
  }

  useEffect(() => {
    void refreshCloudStatus();
    void refreshPolicies();
  }, [work.id]);

  async function uploadCloud() {
    setBusy(true);
    setStatus('');
    try {
      const response = await apiRequest<{ revision: number; contentHash: string }>(`/api/cloud/works/${encodeURIComponent(work.id)}`, {
        method: 'PUT',
        body: jsonBody({ title: work.title, baseRevision: cloudRevision ?? 0, payload: work })
      });
      setCloudRevision(response.revision);
      setCloudUpdatedAt(new Date().toISOString());
      setStatus(`云端同步完成，修订号 ${response.revision}。`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'revision_conflict') {
        setStatus('云端已有更新版本。请先下载云端副本并人工合并，系统不会覆盖冲突内容。');
      } else {
        setStatus(error instanceof Error ? error.message : '云端同步失败。');
      }
    } finally {
      setBusy(false);
    }
  }

  async function downloadCloud() {
    setBusy(true);
    try {
      const response = await apiRequest<CloudWorkResponse>(`/api/cloud/works/${encodeURIComponent(work.id)}`);
      downloadJson({ schemaVersion: 1, exportedAt: new Date().toISOString(), work: response.work.payload }, `${response.work.title}-云端修订${response.work.revision}.mojie.json`);
      setCloudRevision(response.work.revision);
      setCloudUpdatedAt(response.work.updated_at);
      setStatus('云端副本已下载，可通过墨界项目包导入流程预览后恢复。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '云端副本下载失败。');
    } finally {
      setBusy(false);
    }
  }

  async function savePolicy() {
    setBusy(true);
    setStatus('');
    try {
      const config = targetType === 'r2' ? {} : targetType === 'webdav' ? webdav : s3;
      await apiRequest('/api/backups/policies', {
        method: 'POST',
        body: jsonBody({
          workId: work.id,
          targetType,
          enabled: true,
          intervalMinutes,
          retentionHours,
          config
        })
      });
      await refreshPolicies();
      setStatus(`自动备份已开启：每 ${intervalMinutes} 分钟备份一次，${retentionHours} 小时后自动删除。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '备份策略保存失败。');
    } finally {
      setBusy(false);
    }
  }

  async function runBackupNow() {
    setBusy(true);
    try {
      const response = await apiRequest<{ created: number; deleted: number; failures: Array<{ message: string }> }>('/api/backups/run', { method: 'POST' });
      await refreshPolicies();
      setStatus(`本次创建 ${response.created} 个备份，删除 ${response.deleted} 个到期备份${response.failures.length ? `；失败：${response.failures.map((item) => item.message).join('；')}` : '。'}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '立即备份失败。');
    } finally {
      setBusy(false);
    }
  }

  async function disablePolicy(policyId: string) {
    setBusy(true);
    try {
      await apiRequest(`/api/backups/policies/${encodeURIComponent(policyId)}`, { method: 'DELETE' });
      await refreshPolicies();
      setStatus('自动备份策略已关闭；已生成的临时备份仍按原到期时间删除。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '关闭策略失败。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="cloud-operations-panel">
      <summary>云端权限同步与自动备份</summary>
      <section className="cloud-sync-section">
        <div>
          <strong>云端作品修订</strong>
          <span>{cloudRevision === null ? '正在读取…' : cloudRevision === 0 ? '尚未建立云端副本' : `修订 ${cloudRevision}${cloudUpdatedAt ? ` · ${new Date(cloudUpdatedAt).toLocaleString('zh-CN')}` : ''}`}</span>
        </div>
        <div className="cloud-actions">
          <button disabled={busy} onClick={() => void uploadCloud()} type="button">同步当前作品到云端</button>
          <button disabled={busy || !cloudRevision} onClick={() => void downloadCloud()} type="button">下载云端副本</button>
        </div>
      </section>

      <section className="backup-policy-section">
        <h3>自动临时备份</h3>
        <div className="backup-grid">
          <label><span>目标</span><select onChange={(event) => setTargetType(event.target.value as typeof targetType)} value={targetType}><option value="r2">站点 R2 对象存储</option><option value="webdav">WebDAV</option><option value="s3-compatible">S3 兼容对象存储</option></select></label>
          <label><span>每隔多少分钟</span><input min={5} onChange={(event) => setIntervalMinutes(Number(event.target.value))} type="number" value={intervalMinutes} /></label>
          <label><span>多少小时后删除</span><input min={1} onChange={(event) => setRetentionHours(Number(event.target.value))} type="number" value={retentionHours} /></label>
        </div>
        {targetType === 'webdav' ? (
          <div className="backup-grid">
            <label><span>WebDAV 根地址</span><input onChange={(event) => setWebdav((value) => ({ ...value, baseUrl: event.target.value }))} placeholder="https://dav.example.com/backups" value={webdav.baseUrl} /></label>
            <label><span>用户名</span><input onChange={(event) => setWebdav((value) => ({ ...value, username: event.target.value }))} value={webdav.username} /></label>
            <label><span>密码/应用专用密码</span><input onChange={(event) => setWebdav((value) => ({ ...value, password: event.target.value }))} type="password" value={webdav.password} /></label>
          </div>
        ) : null}
        {targetType === 's3-compatible' ? (
          <div className="backup-grid">
            <label><span>服务端点</span><input onChange={(event) => setS3((value) => ({ ...value, endpoint: event.target.value }))} placeholder="https://s3.example.com" value={s3.endpoint} /></label>
            <label><span>Bucket</span><input onChange={(event) => setS3((value) => ({ ...value, bucket: event.target.value }))} value={s3.bucket} /></label>
            <label><span>Region</span><input onChange={(event) => setS3((value) => ({ ...value, region: event.target.value }))} value={s3.region} /></label>
            <label><span>Access Key ID</span><input onChange={(event) => setS3((value) => ({ ...value, accessKeyId: event.target.value }))} value={s3.accessKeyId} /></label>
            <label><span>Secret Access Key</span><input onChange={(event) => setS3((value) => ({ ...value, secretAccessKey: event.target.value }))} type="password" value={s3.secretAccessKey} /></label>
            <label className="check-label"><input checked={s3.pathStyle} onChange={(event) => setS3((value) => ({ ...value, pathStyle: event.target.checked }))} type="checkbox" />使用路径式地址</label>
          </div>
        ) : null}
        <div className="cloud-actions"><button disabled={busy} onClick={() => void savePolicy()} type="button">开启或更新自动备份</button><button disabled={busy || !policies.some((policy) => policy.enabled)} onClick={() => void runBackupNow()} type="button">立即执行一次</button></div>
        {policies.length ? <ul className="backup-policy-list">{policies.map((policy) => <li key={policy.id}><div><strong>{policy.target_type}</strong><span>每 {policy.interval_minutes} 分钟 · 保留 {policy.retention_hours} 小时</span><small>{policy.last_error || (policy.next_backup_at ? `下次：${new Date(policy.next_backup_at).toLocaleString('zh-CN')}` : '已关闭')}</small></div>{policy.enabled ? <button disabled={busy} onClick={() => void disablePolicy(policy.id)} type="button">关闭</button> : null}</li>)}</ul> : null}
      </section>
      <p className="cloud-status" role="status">{status}</p>
    </details>
  );
}
