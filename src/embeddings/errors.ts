import type {
  EmbeddingProviderErrorCode,
  EmbeddingRuntimeFailure
} from "./types.js";

export class EmbeddingProviderError extends Error {
  readonly code: EmbeddingProviderErrorCode;
  readonly recoverable: boolean;

  constructor(
    code: EmbeddingProviderErrorCode,
    message: string,
    options?: {
      cause?: unknown;
      recoverable?: boolean;
    }
  ) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : {}
    );
    this.code = code;
    this.name = "EmbeddingProviderError";
    this.recoverable = options?.recoverable ?? code !== "auth_error";
  }
}

export function toEmbeddingRuntimeFailure(
  error: unknown
): EmbeddingRuntimeFailure {
  if (error instanceof EmbeddingProviderError) {
    return {
      code: error.code,
      message: error.message,
      occurred_at: new Date().toISOString(),
      recoverable: error.recoverable
    };
  }

  if (error instanceof Error) {
    return {
      code: "unknown_error",
      message: error.message,
      occurred_at: new Date().toISOString(),
      recoverable: true
    };
  }

  return {
    code: "unknown_error",
    message: "Unknown embeddings runtime failure.",
    occurred_at: new Date().toISOString(),
    recoverable: true
  };
}
