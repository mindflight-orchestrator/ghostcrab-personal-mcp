/**
 * Dual-mode helper: call native extension SQL when enabled, else portable fallback.
 * On native failure, optionally falls back to SQL (default) so tools stay resilient.
 */

export type ToolBackend = "sql" | "native";

export interface NativeDispatchResult<T> {
  value: T;
  backend: ToolBackend;
}

export interface CallNativeOrFallbackOptions<T> {
  useNative: boolean;
  native: () => Promise<T>;
  fallback: () => Promise<T>;
  /** When true (default), run fallback if native throws. */
  fallbackOnNativeError?: boolean;
}

export async function callNativeOrFallback<T>(
  options: CallNativeOrFallbackOptions<T>
): Promise<NativeDispatchResult<T>> {
  if (!options.useNative) {
    const value = await options.fallback();
    return { value, backend: "sql" };
  }

  try {
    const value = await options.native();
    return { value, backend: "native" };
  } catch {
    if (options.fallbackOnNativeError === false) {
      throw new Error("Native path failed and fallback is disabled");
    }

    const value = await options.fallback();
    return { value, backend: "sql" };
  }
}
