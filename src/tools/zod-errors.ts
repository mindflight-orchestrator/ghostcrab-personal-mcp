import type { ZodError } from "zod";

export interface StructuredValidationError {
  code: "validation_error";
  message_plain: string;
  required_fields: string[];
  invalid_fields: Array<{ field: string; message: string }>;
  hint_call: string;
}

/**
 * Convert a ZodError into a structured, agent-readable error payload.
 * Replaces raw Zod JSON dumps with a clear { code, message_plain, required_fields[], hint_call }.
 */
export function formatZodValidationError(
  error: ZodError,
  toolName: string
): StructuredValidationError {
  const requiredFields: string[] = [];
  const invalidFields: Array<{ field: string; message: string }> = [];

  for (const issue of error.issues) {
    const fieldPath =
      issue.path.length > 0 ? issue.path.join(".") : "(root)";

    const isMissingRequired =
      issue.code === "invalid_type" &&
      "received" in issue &&
      (issue as { received?: string }).received === "undefined";

    if (isMissingRequired) {
      if (!requiredFields.includes(fieldPath)) {
        requiredFields.push(fieldPath);
      }
    } else {
      invalidFields.push({ field: fieldPath, message: issue.message });
    }
  }

  const parts: string[] = [];
  if (requiredFields.length > 0) {
    parts.push(`Missing required fields: ${requiredFields.join(", ")}.`);
  }
  if (invalidFields.length > 0) {
    parts.push(
      invalidFields.map((f) => `'${f.field}': ${f.message}`).join("; ")
    );
  }

  const messagePlain =
    parts.length > 0
      ? parts.join(" ")
      : "Invalid arguments for tool. Check the tool schema.";

  return {
    code: "validation_error",
    message_plain: messagePlain,
    required_fields: requiredFields,
    invalid_fields: invalidFields,
    hint_call: toolName === "ghostcrab_status" ? "check tool schema" : "ghostcrab_status"
  };
}
