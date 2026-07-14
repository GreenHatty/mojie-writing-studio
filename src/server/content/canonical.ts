import type { CanonicalContent } from '../contracts';

export const CURRENT_TIPTAP_SCHEMA_VERSION = 1;

type TiptapNode = { type?: unknown; text?: unknown; content?: unknown[] };

export function emptyCanonicalContent(): CanonicalContent {
  return { type: 'doc', schemaVersion: CURRENT_TIPTAP_SCHEMA_VERSION, content: [{ type: 'paragraph' }] };
}

function normalizeNode(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const node = value as TiptapNode;
  if (typeof node.type !== 'string') return null;
  const normalized: Record<string, unknown> = { type: node.type };
  if (typeof node.text === 'string') normalized.text = node.text;
  if (Array.isArray(node.content)) {
    const content = node.content.map(normalizeNode).filter((child): child is Record<string, unknown> => child !== null);
    if (content.length) normalized.content = content;
  }
  return normalized;
}

export function normalizeCanonicalContent(value: CanonicalContent): CanonicalContent {
  if (!value || value.type !== 'doc') throw new Error('INVALID_CANONICAL_CONTENT');
  const content = Array.isArray(value.content)
    ? value.content.map(normalizeNode).filter((child): child is Record<string, unknown> => child !== null)
    : [];
  return { type: 'doc', schemaVersion: CURRENT_TIPTAP_SCHEMA_VERSION, content: content.length ? content : [{ type: 'paragraph' }] };
}

function textFromNode(value: unknown, includeBlockBreaks = false): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as TiptapNode;
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  const separator = includeBlockBreaks && (node.type === 'doc' || node.type === 'paragraph' || node.type === 'heading' || node.type === 'listItem') ? '\n' : '';
  return node.content.map((child) => textFromNode(child, true)).filter(Boolean).join(separator);
}

export function canonicalPlainText(content: CanonicalContent): string {
  return textFromNode(normalizeCanonicalContent(content), true).replace(/\n{3,}/gu, '\n\n').trim();
}

export function canonicalFromPlainText(plainText: string): CanonicalContent {
  const lines = plainText.replace(/\r\n?/gu, '\n').split('\n');
  return {
    type: 'doc',
    schemaVersion: CURRENT_TIPTAP_SCHEMA_VERSION,
    content: lines.map((line) => line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })
  };
}

function decodeEntities(value: string): string {
  return value.replace(/&nbsp;/giu, ' ').replace(/&amp;/giu, '&').replace(/&lt;/giu, '<').replace(/&gt;/giu, '>').replace(/&quot;/giu, '"').replace(/&#39;/giu, "'");
}

export function legacyHtmlToCanonical(html: string): { canonicalContent: CanonicalContent; plainText: string; legacyHtml: string; needsReview: boolean } {
  const unsafe = /<(script|style|iframe|object|embed|svg|math)\b/iu.test(html);
  const unknown = /<(?!\/?(?:p|br|div|span|strong|b|em|i|u|s|del|blockquote|h[1-6]|ul|ol|li|hr)\b)[^>]+>/iu.test(html);
  const text = decodeEntities(
    html
      .replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1>/giu, '')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<\/(?:p|div|blockquote|h[1-6]|li)>/giu, '\n')
      .replace(/<[^>]+>/gu, '')
      .replace(/\r\n?/gu, '\n')
      .replace(/[\t \f\v]+/gu, ' ')
      .replace(/\n{3,}/gu, '\n\n')
      .trim()
  );
  return { canonicalContent: canonicalFromPlainText(text), plainText: text, legacyHtml: html, needsReview: unsafe || unknown };
}
