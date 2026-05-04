import { describe, expect, it } from "vitest";

import { callNativeOrFallback } from "../../src/db/dispatch.js";

describe("callNativeOrFallback", () => {
  it("returns sql backend when useNative is false", async () => {
    const result = await callNativeOrFallback({
      useNative: false,
      native: async () => "n",
      fallback: async () => "f"
    });
    expect(result).toEqual({ value: "f", backend: "sql" });
  });

  it("returns native backend when native succeeds", async () => {
    const result = await callNativeOrFallback({
      useNative: true,
      native: async () => "n",
      fallback: async () => "f"
    });
    expect(result).toEqual({ value: "n", backend: "native" });
  });

  it("falls back to sql on native error by default", async () => {
    const result = await callNativeOrFallback({
      useNative: true,
      native: async () => {
        throw new Error("boom");
      },
      fallback: async () => "f"
    });
    expect(result).toEqual({ value: "f", backend: "sql" });
  });

  it("throws when fallbackOnNativeError is false and native fails", async () => {
    await expect(
      callNativeOrFallback({
        useNative: true,
        native: async () => {
          throw new Error("boom");
        },
        fallback: async () => "f",
        fallbackOnNativeError: false
      })
    ).rejects.toThrow("Native path failed");
  });
});
