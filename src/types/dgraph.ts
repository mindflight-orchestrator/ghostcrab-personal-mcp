export interface GraphNode {
  id: string;
  nodeType: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  fromId: string;
  properties: Record<string, unknown>;
  relation: string;
  toId: string;
}
