import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('authentic authoring tools UI boundaries', () => {
  it('keeps drawers inside dynamic mobile viewports with a reachable single main scroll area', () => {
    const css = read('app/globals.css');
    expect(css).toContain('height: 100dvh');
    expect(css).toContain('.worldbuilding-drawer .authoring-drawer-body { overflow-x: hidden; overflow-y: auto; }');
    expect(css).toContain('.worldbuilding-workspace > main { display: grid; align-content: start; gap: 13px; min-width: 0; overflow: visible;');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });

  it('ships visual timeline, multi-layout relationship graph and continuous terrain brushes', () => {
    const source = read('src/components/story-visual-canvases.tsx');
    expect(source).toContain("export type TimelineView = 'gantt' | 'linear'");
    expect(source).toContain("export type RelationshipView = 'network' | 'tree' | 'sankey'");
    expect(source).toContain("'mountain' | 'river' | 'volcano' | 'ruin' | 'treasure' | 'city' | 'town' | 'forest' | 'route'");
    expect(source).toContain('setPointerCapture');
    expect(source).toContain('drawTerrain');
  });

  it('offers real platform/category catalogs without asking authors to type source URLs', () => {
    const source = read('src/components/core-operations-drawer.tsx');
    expect(source).toContain('实时平台榜单');
    expect(source).toContain("fanqie('都市高武'");
    expect(source).toContain("qidian('诸天无限'");
    expect(source).not.toContain('授权依据说明');
  });
});
