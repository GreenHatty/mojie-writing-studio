export type GraphNodeKind = 'character' | 'faction' | 'location';

export type GraphNode = {
  id: string;
  label: string;
  kind: GraphNodeKind;
  x?: number;
  y?: number;
  variant?: 'node' | 'region';
  width?: number;
  height?: number;
  layer?: string;
};

export type PositionedGraphNode = GraphNode & {
  x: number;
  y: number;
};

export type GraphEdge = {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  strength?: number;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

export function layoutRelationshipGraph(nodes: GraphNode[], width: number, height: number): PositionedGraphNode[] {
  const safeWidth = Math.max(200, width);
  const safeHeight = Math.max(160, height);
  const centerX = safeWidth / 2;
  const centerY = safeHeight / 2;
  const radiusX = Math.max(50, safeWidth * 0.36);
  const radiusY = Math.max(45, safeHeight * 0.34);
  const ordered = [...nodes].sort((left, right) => left.id.localeCompare(right.id));

  return ordered.map((node, index) => {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
      return {
        ...node,
        x: Math.min(safeWidth, Math.max(0, node.x!)),
        y: Math.min(safeHeight, Math.max(0, node.y!))
      };
    }
    const angle = ordered.length <= 1 ? 0 : (Math.PI * 2 * index) / ordered.length - Math.PI / 2;
    return {
      ...node,
      x: Number((centerX + Math.cos(angle) * radiusX).toFixed(2)),
      y: Number((centerY + Math.sin(angle) * radiusY).toFixed(2))
    };
  });
}

export function buildMapSvg(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: { width: number; height: number; title: string }
): string {
  const width = Math.max(200, Math.round(options.width));
  const height = Math.max(160, Math.round(options.height));
  const positioned = layoutRelationshipGraph(nodes, width, height);
  const byId = new Map(positioned.map((node) => [node.id, node]));
  const routeMarkup = edges.flatMap((edge) => {
    const from = byId.get(edge.fromId);
    const to = byId.get(edge.toId);
    if (!from || !to) return [];
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    return [
      `<g data-edge-id="${escapeXml(edge.id)}"><line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="currentColor" stroke-width="2" opacity="0.55"/><text x="${midX}" y="${midY - 6}" text-anchor="middle" font-size="12">${escapeXml(edge.label)}</text></g>`
    ];
  });
  const nodeMarkup = positioned.map((node) => {
    const shape = node.kind === 'location' ? 'rect' : 'circle';
    const regionWidth = Math.max(84, Math.min(360, Number(node.width) || 84));
    const regionHeight = Math.max(40, Math.min(240, Number(node.height) || 40));
    const nodeWidth = node.variant === 'region' ? regionWidth : 84;
    const nodeHeight = node.variant === 'region' ? regionHeight : 40;
    const graphic = shape === 'rect'
      ? `<rect x="${node.x - nodeWidth / 2}" y="${node.y - nodeHeight / 2}" width="${nodeWidth}" height="${nodeHeight}" rx="${node.variant === 'region' ? 18 : 10}" fill="${node.variant === 'region' ? '#e8f1ec' : 'white'}" fill-opacity="${node.variant === 'region' ? '.7' : '1'}" stroke="currentColor" stroke-dasharray="${node.variant === 'region' ? '6 4' : 'none'}"/>`
      : `<circle cx="${node.x}" cy="${node.y}" r="27" fill="white" stroke="currentColor"/>`;
    return `<g data-node-id="${escapeXml(node.id)}">${graphic}<text x="${node.x}" y="${node.y + 4}" text-anchor="middle" font-size="12">${escapeXml(node.label)}</text></g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(options.title)}"><title>${escapeXml(options.title)}</title><rect width="100%" height="100%" fill="#faf9f4"/>${routeMarkup.join('')}${nodeMarkup.join('')}</svg>`;
}
