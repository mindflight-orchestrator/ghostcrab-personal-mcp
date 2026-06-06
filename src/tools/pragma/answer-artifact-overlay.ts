/** Answer-artifact compatibility fields (MindBrain backend contract). */

export const ANALYSIS_PLAN_KIND = "analysis_plan" as const;
export const ANSWER_SNAPSHOT_KIND = "answer_snapshot" as const;
export const LEGACY_PROJECTION_TYPE_A = "projection_type_a" as const;
export const LEGACY_PROJECTION_TYPE_B = "projection_type_b" as const;

export interface AnalysisPlanOverlay {
  artifact_kind: typeof ANALYSIS_PLAN_KIND;
  legacy_kind: typeof LEGACY_PROJECTION_TYPE_A;
  public_label: string;
}

export interface AnswerSnapshotOverlay {
  artifact_kind: typeof ANSWER_SNAPSHOT_KIND;
  legacy_kind: typeof LEGACY_PROJECTION_TYPE_B;
  lifecycle: "frozen";
  is_terminal_answer: true;
}

export function analysisPlanOverlay(content: string): AnalysisPlanOverlay {
  return {
    artifact_kind: ANALYSIS_PLAN_KIND,
    legacy_kind: LEGACY_PROJECTION_TYPE_A,
    public_label: content
  };
}

export function answerSnapshotOverlay(): AnswerSnapshotOverlay {
  return {
    artifact_kind: ANSWER_SNAPSHOT_KIND,
    legacy_kind: LEGACY_PROJECTION_TYPE_B,
    lifecycle: "frozen",
    is_terminal_answer: true
  };
}

export function withAnalysisPlanOverlay<T extends { content: string }>(
  row: T
): T & AnalysisPlanOverlay {
  return { ...row, ...analysisPlanOverlay(row.content) };
}
