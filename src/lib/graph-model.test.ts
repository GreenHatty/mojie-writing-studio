import { describe, expect, it } from 'vitest';
import { buildMapSvg, layoutRelationshipGraph, type GraphEdge, type GraphNode } from './graph-model';

describe('layoutRelationshipGraph', () => {
  it('places nodes deterministically within the requested viewport', () => {
    const nodes: GraphNode[] = [
      { id: 'a', label: '沈砚', kind: 'character' },
      { id: 'b', label: '谢昭', kind: 'character' },
      { id: 'c', label: '青云宗', kind: 'faction' }
    ];
    const first = layoutRelationshipGraph(nodes, 600, 400);
    const second = layoutRelationshipGraph(nodes, 600, 400);

    expect(first).toEqual(second);
    expect(first.every((node) => node.x >= 0 && node.x <= 600 && node.y >= 0 && node.y <= 400)).toBe(true);
  });
});

describe('buildMapSvg', () => {
  it('escapes labels and renders routes only between known nodes', () => {
    const nodes: GraphNode[] = [
      { id: 'a', label: '<王城>', kind: 'location', x: 100, y: 100 },
      { id: 'b', label: '边关', kind: 'location', x: 300, y: 220 }
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', fromId: 'a', toId: 'b', label: '官道' },
      { id: 'e2', fromId: 'a', toId: 'missing', label: '无效' }
    ];
    const svg = buildMapSvg(nodes, edges, { width: 500, height: 300, title: '地图' });

    expect(svg).toContain('&lt;王城&gt;');
    expect(svg).toContain('官道');
    expect(svg).not.toContain('无效');
    expect(svg).not.toContain('<王城>');
  });

  it('renders bounded region layers as labelled dashed areas', () => {
    const svg = buildMapSvg([{ id: 'region', label: '北境', kind: 'location', variant: 'region', width: 180, height: 90, x: 220, y: 140 }], [], { width: 500, height: 300, title: '区域图' });
    expect(svg).toContain('width="180"');
    expect(svg).toContain('height="90"');
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(svg).toContain('北境');
  });
});
