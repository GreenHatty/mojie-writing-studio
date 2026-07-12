import { countWritingCharacters } from './writing';

export type PublicationPlatform = 'qidian' | 'fanqie';

export type PublicationIssue = {
  code:
    | 'missing-title'
    | 'missing-body'
    | 'below-advisory-length'
    | 'private-note-marker'
    | 'unusual-character'
    | 'excessive-blank-lines';
  message: string;
};

export type PublicationPreparation = {
  platform: PublicationPlatform;
  title: string;
  body: string;
  characterCount: number;
  blockingIssues: PublicationIssue[];
  warnings: PublicationIssue[];
  requiresAuthorConfirmation: true;
};

export type PreparePublicationInput = {
  platform: PublicationPlatform;
  title: string;
  body: string;
  advisoryMinimumCharacters?: number;
};

const PRIVATE_NOTE_MARKERS = [/【作者备注】/u, /【本章备注】/u, /\[作者备注\]/iu, /TODO/iu];

export function prepareChapterForPublication(input: PreparePublicationInput): PublicationPreparation {
  const title = input.title.trim();
  const originalBody = input.body.replace(/\r\n?/gu, '\n').trim();
  const hadExcessiveBlankLines = /\n{3,}/u.test(originalBody);
  const body = originalBody.replace(/\n{3,}/gu, '\n\n');
  const characterCount = countWritingCharacters(body);
  const blockingIssues: PublicationIssue[] = [];
  const warnings: PublicationIssue[] = [];

  if (!title) blockingIssues.push({ code: 'missing-title', message: '章节标题不能为空。' });
  if (!body) blockingIssues.push({ code: 'missing-body', message: '章节正文不能为空。' });

  const advisoryMinimum = input.advisoryMinimumCharacters ?? 0;
  if (advisoryMinimum > 0 && characterCount < advisoryMinimum) {
    warnings.push({
      code: 'below-advisory-length',
      message: `正文少于本地设置的${advisoryMinimum}字提醒值；该提醒不代表平台正式规则。`
    });
  }

  if (PRIVATE_NOTE_MARKERS.some((pattern) => pattern.test(body))) {
    warnings.push({ code: 'private-note-marker', message: '正文中疑似包含作者私人备注，请人工确认。' });
  }
  if (hadExcessiveBlankLines) {
    warnings.push({ code: 'excessive-blank-lines', message: '已在发布副本中合并连续空行，原稿未被修改。' });
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(body)) {
    warnings.push({ code: 'unusual-character', message: '正文包含不可见控制字符，请人工检查。' });
  }

  return {
    platform: input.platform,
    title,
    body,
    characterCount,
    blockingIssues,
    warnings,
    requiresAuthorConfirmation: true
  };
}
