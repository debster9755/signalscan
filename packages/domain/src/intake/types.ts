/**
 * Guided intake contracts — PRD §7.3.
 *
 * Question definitions are versioned data, not code branches. §17.1 stores them
 * in `question_definitions` keyed by (id, version) and every response records
 * the version it was answered against — so changing a question later cannot
 * retroactively invalidate an assessment that was already completed.
 */

export type QuestionGroup = 'business' | 'flow' | 'data' | 'brand' | 'risk';

export type AnswerType =
  | 'single_select'
  | 'multi_select'
  | 'ranked_select'
  | 'short_text'
  | 'structured_object'
  | 'structured_list'
  | 'rating_matrix'
  | 'numeric_range'
  | 'asset_selector'
  | 'workflow_builder';

export interface QuestionOption {
  value: string;
  label: string;
  /** When true, selecting this option requires free-text explanation. */
  requiresExplanation?: boolean;
}

export type VisibilityOperator = 'equals' | 'includes' | 'not_equals';

export interface VisibilityRule {
  questionId: string;
  operator: VisibilityOperator;
  value: unknown;
}

export interface QuestionDefinition {
  id: string;
  version: number;
  group: QuestionGroup;
  order: number;
  label: string;
  helpText?: string;
  answerType: AnswerType;
  required: boolean;
  /** §7.1: permit `unknown` where the specification says so, and only there. */
  allowUnknown: boolean;
  options?: QuestionOption[];
  minSelections?: number;
  maxSelections?: number;
  /** Serialisable constraint description, persisted in `definition_json`. */
  validationSchema: Record<string, unknown>;
  visibleWhen?: VisibilityRule;
  /** Which downstream calculation consumes this answer — from §7.2 "Used by". */
  usedBy: string[];
}

export type ResponseStatus = 'draft' | 'submitted' | 'confirmed';

export interface QuestionResponse {
  questionId: string;
  questionVersion: number;
  /** `null` means explicitly unknown, which is different from unanswered. */
  value: unknown;
  status: ResponseStatus;
  responseVersion: number;
  answeredBy: string | null;
  answeredAt: string | null;
}

export type ResponseMap = Record<string, unknown>;

export interface ValidationIssue {
  questionId: string;
  path: string;
  message: string;
}

export interface IntakeValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** Required, visible questions with no answer yet. */
  missingRequired: string[];
  /** §2.5 secondary metric: at least 80% of required inputs complete. */
  completionRatio: number;
}
