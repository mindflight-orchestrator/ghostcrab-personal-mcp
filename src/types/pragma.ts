export type MemoryProjectionKind = "FACT" | "GOAL" | "STEP" | "CONSTRAINT";

export interface MemoryProjection {
  content: string;
  kind: MemoryProjectionKind;
  weight?: number;
}
