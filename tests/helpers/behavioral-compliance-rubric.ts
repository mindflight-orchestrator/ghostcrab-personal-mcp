/**
 * Layer 5: Behavioral compliance rubric types and scoring helpers.
 *
 * Sources:
 *   - ghostcrab-skills/shared/ONBOARDING_CONTRACT.md
 *   - ghostcrab-skills/MCP_TOOL_DESCRIPTION_PATCHES.md
 *
 * Scope: first-turn fuzzy GhostCrab onboarding requests.
 * See docs/test-v3/behavioral-compliance-rubric.md for full criterion definitions
 * and the manual calibration baseline (4 models, 1 prompt).
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type ComplianceScore = "pass" | "weak_pass" | "fail";

export type ComplianceVerdict = "pass" | "weak_pass" | "fail";

/**
 * Nine criteria from the rubric, keyed by the criterion ID used in the doc.
 */
export interface ComplianceScorecardAxes {
  /** C1: No MCP tool calls on the first fuzzy turn (hard gate). */
  c1_no_tool_calls: ComplianceScore;
  /** C2: No internal tool/schema name exposure (persona rule). */
  c2_no_internals_exposed: ComplianceScore;
  /** C3: Intent hypothesis present in user language. */
  c3_intent_hypothesis: ComplianceScore;
  /** C4: Question count between 2 and 4 (prefer 3). */
  c4_question_count: ComplianceScore;
  /** C5: Compact-view recommendation present ("Vue probable:" line or locale equivalent). */
  c5_vue_probable_line: ComplianceScore;
  /** C6: Explicit offer to draft the next GhostCrab prompt. */
  c6_draft_prompt_offer: ComplianceScore;
  /** C7: Reply language matches user prompt language. */
  c7_language_match: ComplianceScore;
  /** C8: No premature modeling (no schemas, workspace creation, entity/step proposals). */
  c8_no_premature_modeling: ComplianceScore;
  /** C9: No alternate storage proposals (YAML/JSON/Markdown/local files). */
  c9_no_alt_storage: ComplianceScore;
}

export interface ComplianceScorecard extends ComplianceScorecardAxes {
  verdict: ComplianceVerdict;
}

/**
 * A single model's scored result for a behavioral compliance evaluation run.
 */
export interface BehavioralComplianceResult {
  /** Identifier for the model or agent being evaluated. */
  agent: string;
  /** The prompt used for evaluation. */
  prompt: string;
  /** Language of the prompt, e.g. "fr", "en". */
  prompt_language: string;
  /** The raw reply text produced by the model. */
  reply_text: string;
  /** Tool names called during the turn (from trace). Empty for compliant first-turn behavior. */
  tools_called: string[];
  /** Scored rubric. */
  scorecard: ComplianceScorecard;
  /** Human-readable notes per failing or weak criterion. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/** Regex patterns used for automated criterion detection. */
const PATTERNS = {
  /** Matches any ghostcrab tool name (e.g. ghostcrab_status, ghostcrab_remember). */
  tool_name: /ghostcrab_\w+/g,
  /** Matches ghostcrab schema IDs (e.g. ghostcrab:task, ghostcrab:modeling-recipe). */
  schema_id: /ghostcrab:[a-z-]+/g,
  /** Matches internal match score notation (e.g. score: 0.46). */
  internal_score: /score:\s*0\.\d+/,
  /** Matches French Vue probable line. */
  vue_probable_fr: /Vue probable\s*:/i,
  /** Matches English equivalent (likely view / view name). */
  vue_probable_en: /likely view\s*:/i,
  /** Matches French draft-next-prompt offer. */
  draft_offer_fr: /Je peux te rédiger/i,
  /** Matches English draft-next-prompt offer. */
  draft_offer_en: /I can (draft|write|help you write) (the )?next/i,
  /** Matches premature modeling signals: workspace creation, numbered step sequences, entity lists. */
  premature_modeling:
    /ghostcrab_workspace_create|Étapes suggérées|Prochaines étapes|Créer un workspace|Step \d+:|Entités\s*:/i,
  /** Matches alternate storage proposals. */
  alt_storage: /YAML|fichier (local|JSON|Markdown)|local file|\.json|\.yaml|\.md file/i
} as const;

/**
 * Score C1: no tool calls.
 * Pass when tools_called is empty.
 */
export function scoreC1(toolsCalled: string[]): ComplianceScore {
  return toolsCalled.length === 0 ? "pass" : "fail";
}

/**
 * Score C2: no internals exposed.
 * Fail when the reply text contains tool names, schema IDs, or internal scores.
 */
export function scoreC2(replyText: string): ComplianceScore {
  if (
    PATTERNS.tool_name.test(replyText) ||
    PATTERNS.schema_id.test(replyText) ||
    PATTERNS.internal_score.test(replyText)
  ) {
    // Reset lastIndex for global regexes after test
    PATTERNS.tool_name.lastIndex = 0;
    return "fail";
  }
  PATTERNS.tool_name.lastIndex = 0;
  return "pass";
}

/**
 * Score C4: question count (2–4 preferred, 5–6 is weak_pass, outside = fail).
 * Counts top-level question marks as a proxy for distinct questions.
 */
export function scoreC4(replyText: string): ComplianceScore {
  const questionMarks = (replyText.match(/\?/g) ?? []).length;
  if (questionMarks >= 2 && questionMarks <= 4) return "pass";
  if (questionMarks >= 5 && questionMarks <= 8) return "weak_pass";
  return "fail";
}

/**
 * Score C5: Vue probable line (or locale equivalent).
 * Pass when the pattern is found; fail when absent.
 */
export function scoreC5(replyText: string, promptLanguage: string): ComplianceScore {
  const isFr = promptLanguage.startsWith("fr");
  const pattern = isFr ? PATTERNS.vue_probable_fr : PATTERNS.vue_probable_en;
  return pattern.test(replyText) ? "pass" : "fail";
}

/**
 * Score C6: offer to draft the next GhostCrab prompt.
 */
export function scoreC6(replyText: string, promptLanguage: string): ComplianceScore {
  const isFr = promptLanguage.startsWith("fr");
  const pattern = isFr ? PATTERNS.draft_offer_fr : PATTERNS.draft_offer_en;
  return pattern.test(replyText) ? "pass" : "fail";
}

/**
 * Score C8: no premature modeling signals.
 */
export function scoreC8(replyText: string): ComplianceScore {
  return PATTERNS.premature_modeling.test(replyText) ? "fail" : "pass";
}

/**
 * Score C9: no alternate storage proposals.
 */
export function scoreC9(replyText: string): ComplianceScore {
  return PATTERNS.alt_storage.test(replyText) ? "fail" : "pass";
}

/**
 * Derive overall verdict from a completed scorecard.
 *
 * Rules (from rubric):
 *   pass     — all nine criteria are pass or weak_pass; no fail
 *   weak_pass — at most two fail; failing criteria are only C4, C8, or C9
 *   fail     — any fail on C1/C2/C5/C6/C7; or three or more fail on any criteria
 */
export function deriveVerdict(axes: ComplianceScorecardAxes): ComplianceVerdict {
  const hardGateCriteria: (keyof ComplianceScorecardAxes)[] = [
    "c1_no_tool_calls",
    "c2_no_internals_exposed",
    "c5_vue_probable_line",
    "c6_draft_prompt_offer",
    "c7_language_match"
  ];

  for (const key of hardGateCriteria) {
    if (axes[key] === "fail") return "fail";
  }

  const failCount = Object.values(axes).filter((s) => s === "fail").length;
  if (failCount === 0) return "pass";
  if (failCount <= 2) return "weak_pass";
  return "fail";
}

/**
 * Score C1–C9 from a reply text, tools_called list, and prompt language.
 *
 * C3 (intent hypothesis) and C7 (language match) require external signals
 * (language detection, hypothesis detection) and are left as `null` by this
 * helper — callers must supply them manually or via a language-detection library.
 */
export function scoreAutomaticCriteria(
  replyText: string,
  toolsCalled: string[],
  promptLanguage: string
): Omit<ComplianceScorecardAxes, "c3_intent_hypothesis" | "c7_language_match"> {
  return {
    c1_no_tool_calls: scoreC1(toolsCalled),
    c2_no_internals_exposed: scoreC2(replyText),
    c4_question_count: scoreC4(replyText),
    c5_vue_probable_line: scoreC5(replyText, promptLanguage),
    c6_draft_prompt_offer: scoreC6(replyText, promptLanguage),
    c8_no_premature_modeling: scoreC8(replyText),
    c9_no_alt_storage: scoreC9(replyText)
  };
}

// ---------------------------------------------------------------------------
// Calibration baseline
// ---------------------------------------------------------------------------

/**
 * Manual calibration baseline from docs/test-v3/behavioral-compliance-rubric.md.
 * Four models, single calibration prompt (French, first-turn fuzzy onboarding).
 */
export const CALIBRATION_PROMPT =
  "J'ai besoin d'utiliser GhostCrab pour suivre un projet sur plusieurs phases, avec des tâches, des blocages et des priorités qui changent. Je ne sais pas encore comment le structurer.";

export const CALIBRATION_BASELINE: BehavioralComplianceResult[] = [
  {
    agent: "composer-2-fast",
    prompt: CALIBRATION_PROMPT,
    prompt_language: "fr",
    reply_text: "",
    tools_called: [],
    scorecard: {
      c1_no_tool_calls: "pass",
      c2_no_internals_exposed: "pass",
      c3_intent_hypothesis: "pass",
      c4_question_count: "pass",
      c5_vue_probable_line: "pass",
      c6_draft_prompt_offer: "pass",
      c7_language_match: "pass",
      c8_no_premature_modeling: "pass",
      c9_no_alt_storage: "pass",
      verdict: "pass"
    },
    notes: []
  },
  {
    agent: "kimi-2.5",
    prompt: CALIBRATION_PROMPT,
    prompt_language: "fr",
    reply_text: "",
    tools_called: ["ghostcrab_modeling_guidance"],
    scorecard: {
      c1_no_tool_calls: "fail",
      c2_no_internals_exposed: "fail",
      c3_intent_hypothesis: "weak_pass",
      c4_question_count: "pass",
      c5_vue_probable_line: "fail",
      c6_draft_prompt_offer: "fail",
      c7_language_match: "pass",
      c8_no_premature_modeling: "fail",
      c9_no_alt_storage: "pass",
      verdict: "fail"
    },
    notes: [
      "Hard gate breached: tool output (score: 0.46) present in reply (C1)",
      "Exposes ghostcrab_workspace_create, ghostcrab_schema_inspect, ghostcrab_remember, ghostcrab_learn, ghostcrab_project (C2)",
      "No 'Vue probable:' line; replaced by implementation roadmap (C5)",
      "No offer to draft next prompt (C6)",
      "Six concrete implementation steps proposed before clarification (C8)"
    ]
  },
  {
    agent: "gemini-2.5-flash",
    prompt: CALIBRATION_PROMPT,
    prompt_language: "fr",
    reply_text: "",
    tools_called: ["ghostcrab_schema_inspect"],
    scorecard: {
      c1_no_tool_calls: "fail",
      c2_no_internals_exposed: "fail",
      c3_intent_hypothesis: "fail",
      c4_question_count: "fail",
      c5_vue_probable_line: "fail",
      c6_draft_prompt_offer: "fail",
      c7_language_match: "fail",
      c8_no_premature_modeling: "fail",
      c9_no_alt_storage: "pass",
      verdict: "fail"
    },
    notes: [
      "Model entered recursive self-correction loop reading tool descriptor files (C1)",
      "Exposed internal file paths of tool descriptor JSON files (C2)",
      "No user-facing reply produced; all criteria that require reply content fail (C3, C4, C5, C6, C7, C8)",
      "Root cause: model attempts to read MCP tool schema before calling tools — not required MCP behavior"
    ]
  },
  {
    agent: "haiku-4.5",
    prompt: CALIBRATION_PROMPT,
    prompt_language: "fr",
    reply_text: "",
    tools_called: [],
    scorecard: {
      c1_no_tool_calls: "pass",
      c2_no_internals_exposed: "pass",
      c3_intent_hypothesis: "weak_pass",
      c4_question_count: "fail",
      c5_vue_probable_line: "fail",
      c6_draft_prompt_offer: "fail",
      c7_language_match: "pass",
      c8_no_premature_modeling: "pass",
      c9_no_alt_storage: "pass",
      verdict: "fail"
    },
    notes: [
      "5 question groups with 2 sub-questions each = 10+ questions; far exceeds 2–4 limit (C4)",
      "No 'Vue probable:' line (C5)",
      "No offer to draft next prompt; closes with abstract promise of 'structure légère' (C6)",
      "Intake discipline is correct: no tools, no internals, no premature modeling",
      "Failure mode: over-thoroughness, not discipline breach — improvement path is output template, not tool discipline"
    ]
  }
];
