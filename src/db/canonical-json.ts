import { createHash } from "node:crypto";

export const MINDBRAIN_CANONICAL_JSON_FORMAT = "mindbrain-canonical-json-v1";

function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function canonicalNumber(value: number): string {
  if (!Number.isFinite(value))
    throw new TypeError("canonical JSON numbers must be finite");
  if (Object.is(value, -0) || value === 0) return "0";
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  // JSON.parse may use exponent notation where PostgreSQL numeric emits a
  // decimal. Expand it without introducing binary floating-point digits.
  const [coefficient, exponentText] = text.toLowerCase().split("e");
  const exponent = Number(exponentText);
  const negative = coefficient.startsWith("-");
  const digits = coefficient.replace("-", "").replace(".", "");
  const decimalIndex = coefficient.replace("-", "").indexOf(".");
  const initialScale =
    decimalIndex < 0
      ? 0
      : coefficient.replace("-", "").length - decimalIndex - 1;
  const scale = initialScale - exponent;
  const unsigned =
    scale <= 0
      ? digits + "0".repeat(-scale)
      : scale >= digits.length
        ? `0.${"0".repeat(scale - digits.length)}${digits}`
        : `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  return `${negative ? "-" : ""}${unsigned}`;
}

export function canonicalJsonText(value: unknown): string {
  if (value === null) return "n;";
  if (typeof value === "boolean") return value ? "b1;" : "b0;";
  if (typeof value === "string") return `s${utf8Length(value)}:${value}`;
  if (typeof value === "number") {
    const scalar = canonicalNumber(value);
    return `d${scalar.length}:${scalar}`;
  }
  if (Array.isArray(value)) {
    return `a${value.length}[${value.map(canonicalJsonText).join("")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) =>
        Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
    );
    return `o${entries.length}{${entries
      .map(
        ([key, item]) => `k${utf8Length(key)}:${key}${canonicalJsonText(item)}`
      )
      .join("")}}`;
  }
  throw new TypeError(`unsupported canonical JSON value: ${typeof value}`);
}

export function canonicalJsonHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJsonText(value), "utf8")
    .digest("hex");
}
