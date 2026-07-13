import { describe, expect, it } from 'vitest';
import { canonicalFromPlainText, canonicalPlainText, legacyHtmlToCanonical, normalizeCanonicalContent } from './canonical';

describe('canonical Tiptap content', () => {
  it('normalizes persisted content with a schema version and derived text', () => {
    const canonical = normalizeCanonicalContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一段' }] }] });
    expect(canonical.schemaVersion).toBe(1);
    expect(canonicalPlainText(canonical)).toBe('第一段');
  });

  it('keeps legacy HTML only as a migration backup', () => {
    const converted = legacyHtmlToCanonical('<p>第一段<br>第二行</p><script>ignored()</script>');
    expect(converted.plainText).toBe('第一段\n第二行');
    expect(converted.legacyHtml).toContain('<script>');
    expect(converted.needsReview).toBe(true);
    expect(canonicalPlainText(converted.canonicalContent)).toContain('第二行');
  });

  it('creates editable content from plain text', () => {
    expect(canonicalPlainText(canonicalFromPlainText('甲\n乙'))).toBe('甲\n乙');
  });
});
