import type {
  BusinessCapability,
  BusinessIntent,
  LearningProposal,
  StructuredFacets
} from "../business-query-router/types.js";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function confidenceTier(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.52) return "medium";
  return "low";
}

function buildSignature(intent: BusinessIntent): string {
  const signatureParts = [
    intent.id,
    Object.keys(intent.structured_facets ?? {}).sort().join("|"),
    (intent.slots.object as string | undefined) ?? "",
    (intent.slots.status as string | undefined) ?? "",
    (intent.slots.demo_week as string | undefined) ?? ""
  ];
  return signatureParts.filter(Boolean).join("::");
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  }

function isMeaningfulProposal(capability: BusinessCapability): boolean {
  return (
    ((capability.required_schemas?.length ?? 0) > 0 &&
      (capability.required_schemas ?? []).some((schema) => schema.length > 0)) ||
    (capability.required_facets?.length ?? 0) > 0 ||
    normalizeLabel(capability.label ?? "").length > 0 ||
    normalizeLabel(capability.business_question ?? "").length > 12
  );
}

export function createLearningProposal(params: {
  workspaceId: string;
  question: string;
  intent: BusinessIntent;
  duplicateScore: number;
}): LearningProposal | undefined {
  const { workspaceId, question, intent, duplicateScore } = params;
  const isCreationOrComposite =
    intent.id === "creation_request" || intent.id === "composite_request";
  const intentSignature = buildSignature(intent);

  if (intentSignature.length < 4 && !isCreationOrComposite) {
    return undefined;
  }

  if (!isCreationOrComposite) {
    if (duplicateScore < 0.22) return undefined;
    if (intent.confidence < 0.35) return undefined;
    if (
      !intent.id.startsWith("generic") &&
      intent.id !== "work_items_by_week" &&
      intent.id !== "list_completed_work_items_by_week"
    ) {
      return undefined;
    }
    if (
      Object.keys(intent.slots).length === 0 &&
      Object.keys(intent.structured_facets ?? {}).length === 0
    ) {
      return undefined;
    }
  }

  const structuredFacets = intent.structured_facets ?? {};
  const normalizedFacets = Object.fromEntries(
    Object.entries(structuredFacets).filter(
      ([key, value]) =>
        typeof key === "string" &&
        key.length > 0 &&
        (typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean" ||
          Array.isArray(value) ||
          value === null)
    )
  ) as StructuredFacets;

  const proposalKind: LearningProposal["proposal_kind"] = isCreationOrComposite
    ? "composite_projection_candidate"
    : "single_capability";

  const confidence =
    isCreationOrComposite
      ? intent.confidence
      : Math.min(1, Math.max(intent.confidence, duplicateScore));

  const normalizedLabel = normalizeLabel(intent.label);
  const signature = intentSignature;
  const proposalId = `proposal__${slugify(intent.id)}__${Date.now()}`;
  const capabilityId = proposalId.replace(/^proposal__/, "capability__");
  const rawCapabilities = [
    ...Object.keys(intent.slots),
    ...Object.keys(normalizedFacets)
  ];
  const capability: BusinessCapability = {
    capability_id: capabilityId,
    workspace_id: workspaceId,
    label: normalizedLabel,
    business_question: question,
    example_queries: [question],
    required_schemas: [],
    required_facets: [...new Set(rawCapabilities)].filter(
      (facet) => !facet.startsWith("intent_")
    ),
    required_edges: [],
    scope: null,
    agent_id: "ghostcrab_business_query_router",
    artifact_kind: "gap_report",
    availability: "gap_report",
    fallback_mode: "gap_report",
    source: "learning_proposal",
    status: "proposed",
    version: 1,
    proposal_fingerprint: signature
  };

  if (!isMeaningfulProposal(capability)) {
    return undefined;
  }

  return {
    proposal_id: proposalId,
    proposal_kind: proposalKind,
    capability,
    intent_signature: signature,
    proposed_facets: normalizedFacets,
    evidence_count:
      Object.keys(intent.slots).length + Object.keys(normalizedFacets).length,
    confidence_tier: confidenceTier(confidence),
    reason: isCreationOrComposite
      ? "The request describes a new composite or reusable view that does not exist in the current catalog."
      : "The query is generic enough to become a reusable capability, but no close runtime capability matched.",
    status: "proposed"
  };
}
