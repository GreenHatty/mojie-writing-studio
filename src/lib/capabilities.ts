export type RuntimeCapabilities = {
  auth: boolean;
  cloudDatabase: boolean;
  objectStorage: boolean;
  scheduledRankingSync: boolean;
  officialPublishingApi: boolean;
  aiAssistant: boolean;
};

function enabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export const RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  auth: enabled(process.env.NEXT_PUBLIC_MOJIE_AUTH_ENABLED),
  cloudDatabase: enabled(process.env.NEXT_PUBLIC_MOJIE_CLOUD_DATABASE_ENABLED),
  objectStorage: enabled(process.env.NEXT_PUBLIC_MOJIE_OBJECT_STORAGE_ENABLED),
  scheduledRankingSync: enabled(process.env.NEXT_PUBLIC_MOJIE_RANKING_SYNC_ENABLED),
  officialPublishingApi: enabled(process.env.NEXT_PUBLIC_MOJIE_OFFICIAL_PUBLISHING_ENABLED),
  aiAssistant: enabled(process.env.NEXT_PUBLIC_MOJIE_AI_ENABLED)
};

export function localOnlyReasons(capabilities: RuntimeCapabilities = RUNTIME_CAPABILITIES): string[] {
  const reasons: string[] = [];
  if (!capabilities.auth) reasons.push('未配置服务端身份验证，当前仅适合单设备或受控浏览器使用。');
  if (!capabilities.cloudDatabase) reasons.push('未配置云端数据库，多设备内容不会自动同步。');
  if (!capabilities.objectStorage) reasons.push('未配置对象存储，封面、DOCX原件和大型附件不能云端保存。');
  if (!capabilities.scheduledRankingSync) reasons.push('未配置合法榜单数据源与定时同步。');
  if (!capabilities.officialPublishingApi) reasons.push('未获得平台正式写入接口授权，只提供发布前检查与复制。');
  if (!capabilities.aiAssistant) reasons.push('未配置智能服务，正文不会发送给外部模型。');
  return reasons;
}
