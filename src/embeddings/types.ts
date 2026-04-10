export type EmbeddingsMode =
  | "disabled"
  | "fake"
  | "fixture"
  | "null"
  | "openrouter";

export type EmbeddingProviderErrorCode =
  | "auth_error"
  | "dimension_mismatch"
  | "invalid_response"
  | "network_error"
  | "rate_limited"
  | "timeout"
  | "unsupported_model"
  | "unknown_error";

export interface EmbeddingRuntimeFailure {
  code: EmbeddingProviderErrorCode;
  message: string;
  occurred_at: string;
  recoverable: boolean;
}

export interface EmbeddingRuntimeStatus {
  available: boolean;
  dimensions: number;
  model?: string;
  mode: EmbeddingsMode;
  note: string;
  failure?: EmbeddingRuntimeFailure;
  vectorSearchReady: boolean;
  writeEmbeddingsEnabled: boolean;
}

export interface EmbeddingProvider {
  embedMany(texts: string[]): Promise<number[][]>;
  getStatus(): EmbeddingRuntimeStatus;
}
