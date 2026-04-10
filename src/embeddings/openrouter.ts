import { EmbeddingProviderError } from "./errors.js";
import type { EmbeddingProvider, EmbeddingRuntimeStatus } from "./types.js";

interface OpenRouterEmbeddingProviderOptions {
  apiKey: string;
  baseUrl?: string;
  dimensions: number;
  model: string;
  timeoutMs: number;
}

interface OpenRouterEmbeddingsResponse {
  data?: Array<{
    embedding?: unknown;
    index?: number;
  }>;
  error?: {
    message?: string;
  };
}

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly dimensions: number;
  private readonly model: string;
  private readonly timeoutMs: number;
  private lastFailure?: EmbeddingRuntimeStatus["failure"];

  constructor(options: OpenRouterEmbeddingProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL).replace(
      /\/$/,
      ""
    );
    this.dimensions = options.dimensions;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          encoding_format: "float"
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw this.rememberFailure(
          new EmbeddingProviderError(
            "timeout",
            `OpenRouter embeddings request timed out after ${this.timeoutMs}ms.`,
            {
              cause: error
            }
          )
        );
      }

      if (error instanceof Error) {
        throw this.rememberFailure(
          new EmbeddingProviderError(
            "network_error",
            `OpenRouter embeddings request failed: ${error.message}`,
            {
              cause: error
            }
          )
        );
      }

      throw this.rememberFailure(
        new EmbeddingProviderError(
          "unknown_error",
          "OpenRouter embeddings request failed: Unknown network error",
          { cause: error }
        )
      );
    }

    let payload: OpenRouterEmbeddingsResponse | undefined;

    try {
      payload = (await response.json()) as OpenRouterEmbeddingsResponse;
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      throw this.rememberFailure(
        new EmbeddingProviderError(
          classifyResponseStatus(response.status, payload?.error?.message),
          `OpenRouter embeddings request failed: ${payload?.error?.message ?? `${response.status} ${response.statusText}`}`,
          {
            recoverable: response.status !== 401 && response.status !== 403
          }
        )
      );
    }

    if (!Array.isArray(payload?.data)) {
      throw this.rememberFailure(
        new EmbeddingProviderError(
          "invalid_response",
          "OpenRouter embeddings response did not include data[]."
        )
      );
    }

    const vectors = payload.data
      .slice()
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => {
        if (!Array.isArray(item.embedding)) {
          throw this.rememberFailure(
            new EmbeddingProviderError(
              "invalid_response",
              "OpenRouter embeddings response contained a non-vector payload."
            )
          );
        }

        const vector = item.embedding.map((value) => {
          if (typeof value !== "number" || Number.isNaN(value)) {
            throw this.rememberFailure(
              new EmbeddingProviderError(
                "invalid_response",
                "OpenRouter embeddings response contained a non-numeric vector value."
              )
            );
          }

          return value;
        });

        if (vector.length !== this.dimensions) {
          throw this.rememberFailure(
            new EmbeddingProviderError(
              "dimension_mismatch",
              `OpenRouter embeddings dimension mismatch: expected ${this.dimensions}, received ${vector.length} from ${this.model}.`,
              {
                recoverable: false
              }
            )
          );
        }

        return vector;
      });

    if (vectors.length !== texts.length) {
      throw this.rememberFailure(
        new EmbeddingProviderError(
          "invalid_response",
          `OpenRouter embeddings response count mismatch: expected ${texts.length}, received ${vectors.length}.`
        )
      );
    }

    this.lastFailure = undefined;
    return vectors;
  }

  getStatus(): EmbeddingRuntimeStatus {
    const runtimeReady = this.lastFailure?.recoverable !== false;

    return {
      available: runtimeReady,
      dimensions: this.dimensions,
      failure: this.lastFailure,
      model: this.model,
      mode: "openrouter",
      note: this.lastFailure
        ? `OpenRouter embeddings are configured with ${this.model}, but the last request failed (${this.lastFailure.code}).`
        : `OpenRouter embeddings are enabled with ${this.model}.`,
      vectorSearchReady: runtimeReady,
      writeEmbeddingsEnabled: runtimeReady
    };
  }

  private rememberFailure(
    error: EmbeddingProviderError
  ): EmbeddingProviderError {
    this.lastFailure = {
      code: error.code,
      message: error.message,
      occurred_at: new Date().toISOString(),
      recoverable: error.recoverable
    };

    return error;
  }
}

function classifyResponseStatus(
  status: number,
  message: string | undefined
): EmbeddingProviderError["code"] {
  if (status === 401 || status === 403) {
    return "auth_error";
  }

  if (status === 429) {
    return "rate_limited";
  }

  if (status === 408 || status === 504) {
    return "timeout";
  }

  if (
    status === 400 &&
    message?.toLowerCase().includes("does not support embeddings")
  ) {
    return "unsupported_model";
  }

  return "network_error";
}
