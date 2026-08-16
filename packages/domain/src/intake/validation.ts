import { isVisible, visibleQuestions } from './branching';
import { QUESTIONS } from './questions';
import type {
  IntakeValidationResult,
  QuestionDefinition,
  ResponseMap,
  ValidationIssue,
} from './types';

/**
 * Response validation — PRD §7.1, §7.2, §26.1.
 *
 * Validation is driven by each question's own `validationSchema`, so adding a
 * question is a data change rather than a new branch in this file. The rules
 * that repeat across questions — selection counts, option membership, "other
 * requires an explanation", exclusive options — live here once.
 */

const issue = (questionId: string, path: string, message: string): ValidationIssue => ({
  questionId,
  path,
  message,
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function constraint(question: QuestionDefinition, key: string): Record<string, unknown> | null {
  return asRecord(question.validationSchema[key]);
}

function optionValues(question: QuestionDefinition): Set<string> {
  return new Set((question.options ?? []).map((o) => o.value));
}

function optionsRequiringExplanation(question: QuestionDefinition): Set<string> {
  return new Set((question.options ?? []).filter((o) => o.requiresExplanation).map((o) => o.value));
}

function validateTextField(
  questionId: string,
  path: string,
  value: unknown,
  rules: Record<string, unknown>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const required = rules.required === true;

  if (value === undefined || value === null || value === '') {
    if (required) issues.push(issue(questionId, path, 'This field is required.'));
    return issues;
  }

  if (typeof value !== 'string') {
    issues.push(issue(questionId, path, 'Expected text.'));
    return issues;
  }

  const trimmed = value.trim();
  const min = typeof rules.min === 'number' ? rules.min : undefined;
  const max = typeof rules.max === 'number' ? rules.max : undefined;

  if (required && trimmed.length === 0) {
    issues.push(issue(questionId, path, 'This field is required.'));
    return issues;
  }
  if (min !== undefined && trimmed.length > 0 && trimmed.length < min) {
    issues.push(issue(questionId, path, `Must be at least ${min} characters.`));
  }
  if (max !== undefined && trimmed.length > max) {
    issues.push(issue(questionId, path, `Must be at most ${max} characters.`));
  }
  if (rules.format === 'https-url' && trimmed.length > 0 && !/^https:\/\/\S+$/i.test(trimmed)) {
    // §6.3: HTTPS only in production.
    issues.push(issue(questionId, path, 'Must be an https:// URL.'));
  }
  return issues;
}

function validateSelections(question: QuestionDefinition, value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const record = asRecord(value);
  const selections = record?.selections;

  if (!Array.isArray(selections)) {
    return [issue(question.id, 'selections', 'Expected a list of selected options.')];
  }

  const allowed = optionValues(question);
  for (const selection of selections) {
    if (typeof selection !== 'string' || !allowed.has(selection)) {
      issues.push(
        issue(question.id, 'selections', `"${String(selection)}" is not a valid option.`),
      );
    }
  }

  if (new Set(selections).size !== selections.length) {
    issues.push(issue(question.id, 'selections', 'The same option was selected more than once.'));
  }

  const { minSelections, maxSelections } = question;
  if (minSelections !== undefined && selections.length < minSelections) {
    issues.push(issue(question.id, 'selections', `Select at least ${minSelections} option(s).`));
  }
  if (maxSelections !== undefined && selections.length > maxSelections) {
    issues.push(issue(question.id, 'selections', `Select at most ${maxSelections} option(s).`));
  }

  // "No known restrictions" cannot coexist with a specific restriction.
  const exclusive = question.validationSchema.exclusive;
  if (Array.isArray(exclusive)) {
    for (const value of exclusive) {
      if (selections.includes(value) && selections.length > 1) {
        issues.push(
          issue(
            question.id,
            'selections',
            `"${String(value)}" cannot be combined with other options.`,
          ),
        );
      }
    }
  }

  const needsExplanation = optionsRequiringExplanation(question);
  const chosenNeedingExplanation = selections.filter(
    (s): s is string => typeof s === 'string' && needsExplanation.has(s),
  );
  if (chosenNeedingExplanation.length > 0) {
    const otherRules = constraint(question, 'otherText') ?? { min: 3, max: 200 };
    issues.push(
      ...validateTextField(question.id, 'otherText', record?.otherText, {
        ...otherRules,
        required: true,
      }),
    );
  }

  return issues;
}

function validateRanked(question: QuestionDefinition, value: unknown): ValidationIssue[] {
  const record = asRecord(value);
  const ranked = record?.ranked;
  if (!Array.isArray(ranked)) {
    return [issue(question.id, 'ranked', 'Expected an ordered list of choices.')];
  }

  const issues: ValidationIssue[] = [];
  const allowed = optionValues(question);
  for (const entry of ranked) {
    if (typeof entry !== 'string' || !allowed.has(entry)) {
      issues.push(issue(question.id, 'ranked', `"${String(entry)}" is not a valid option.`));
    }
  }
  if (new Set(ranked).size !== ranked.length) {
    issues.push(issue(question.id, 'ranked', 'Each choice may only be ranked once.'));
  }
  if (question.minSelections !== undefined && ranked.length < question.minSelections) {
    issues.push(issue(question.id, 'ranked', `Rank at least ${question.minSelections} option(s).`));
  }
  if (question.maxSelections !== undefined && ranked.length > question.maxSelections) {
    issues.push(issue(question.id, 'ranked', `Rank at most ${question.maxSelections} option(s).`));
  }

  const needsExplanation = optionsRequiringExplanation(question);
  if (ranked.some((r) => typeof r === 'string' && needsExplanation.has(r))) {
    issues.push(
      ...validateTextField(question.id, 'otherText', record?.otherText, {
        required: true,
        min: 3,
        max: 200,
      }),
    );
  }
  return issues;
}

function validateSingleSelect(question: QuestionDefinition, value: unknown): ValidationIssue[] {
  const record = asRecord(value);
  const selected = record ? record.value : value;

  if (typeof selected !== 'string' || !optionValues(question).has(selected)) {
    return [issue(question.id, 'value', `"${String(selected)}" is not a valid option.`)];
  }

  const issues: ValidationIssue[] = [];
  if (optionsRequiringExplanation(question).has(selected)) {
    issues.push(
      ...validateTextField(question.id, 'otherText', record?.otherText, {
        required: true,
        min: 3,
        max: 200,
      }),
    );
  }
  return issues;
}

function validateStructuredObject(question: QuestionDefinition, value: unknown): ValidationIssue[] {
  const fields = constraint(question, 'fields');
  const record = asRecord(value);
  if (!record) return [issue(question.id, '', 'Expected a structured answer.')];
  if (!fields) return [];

  const issues: ValidationIssue[] = [];
  for (const [fieldName, rawRules] of Object.entries(fields)) {
    const rules = asRecord(rawRules);
    if (!rules) continue;
    // Only text-shaped fields go through the text validator; a declared
    // non-text type (boolean, array, number) is validated by its own consumer.
    if (typeof rules.type === 'string' && rules.type !== 'string') continue;
    issues.push(...validateTextField(question.id, fieldName, record[fieldName], rules));
  }
  return issues;
}

function validateStructuredList(question: QuestionDefinition, value: unknown): ValidationIssue[] {
  const record = asRecord(value);
  const rows = record?.rows;
  if (!Array.isArray(rows)) {
    return [issue(question.id, 'rows', 'Expected a list of rows.')];
  }

  const issues: ValidationIssue[] = [];
  const schema = question.validationSchema;
  const exactly = typeof schema.exactly === 'number' ? schema.exactly : undefined;
  const minRows = typeof schema.minRows === 'number' ? schema.minRows : question.minSelections;
  const maxRows = typeof schema.maxRows === 'number' ? schema.maxRows : question.maxSelections;

  if (exactly !== undefined && rows.length !== exactly) {
    issues.push(issue(question.id, 'rows', `Exactly ${exactly} entries are required.`));
  } else {
    if (minRows !== undefined && rows.length < minRows) {
      issues.push(issue(question.id, 'rows', `At least ${minRows} entr(y/ies) required.`));
    }
    if (maxRows !== undefined && rows.length > maxRows) {
      issues.push(issue(question.id, 'rows', `At most ${maxRows} entr(y/ies) allowed.`));
    }
  }

  const rowRules = constraint(question, 'rows');
  const allowed = optionValues(question);

  rows.forEach((rawRow, index) => {
    const row = asRecord(rawRow);
    if (!row) {
      issues.push(issue(question.id, `rows[${index}]`, 'Expected a structured row.'));
      return;
    }
    if (!rowRules) return;

    for (const [fieldName, rawFieldRules] of Object.entries(rowRules)) {
      const rules = asRecord(rawFieldRules);
      if (!rules) continue;
      const path = `rows[${index}].${fieldName}`;
      const fieldValue = row[fieldName];

      if (rules.type === 'array') {
        if (!Array.isArray(fieldValue)) {
          if (rules.required === true) {
            issues.push(issue(question.id, path, 'Expected a list.'));
          }
          continue;
        }
        const minItems = typeof rules.minItems === 'number' ? rules.minItems : 0;
        if (fieldValue.length < minItems) {
          issues.push(issue(question.id, path, `Select at least ${minItems} option(s).`));
        }
        if (rules.enum === true) {
          for (const item of fieldValue) {
            if (typeof item !== 'string' || !allowed.has(item)) {
              issues.push(issue(question.id, path, `"${String(item)}" is not a valid option.`));
            }
          }
        }
        continue;
      }

      if (rules.enum === true) {
        if (typeof fieldValue !== 'string' || !allowed.has(fieldValue)) {
          issues.push(issue(question.id, path, `"${String(fieldValue)}" is not a valid option.`));
        }
        continue;
      }

      issues.push(...validateTextField(question.id, path, fieldValue, rules));
    }
  });

  const distinctBy = schema.distinctBy;
  if (typeof distinctBy === 'string') {
    const keys = rows
      .map((r) => asRecord(r)?.[distinctBy])
      .filter((k): k is string => typeof k === 'string');
    if (new Set(keys).size !== keys.length) {
      issues.push(issue(question.id, 'rows', `Each ${distinctBy} may only appear once.`));
    }
  }

  return issues;
}

function validateRatingMatrix(question: QuestionDefinition, value: unknown): ValidationIssue[] {
  const ratingRules = constraint(question, 'ratings');
  const record = asRecord(value);
  const ratings = asRecord(record?.ratings);
  if (!ratings) return [issue(question.id, 'ratings', 'Expected a set of ratings.')];
  if (!ratingRules) return [];

  const issues: ValidationIssue[] = [];
  for (const [name, rawRules] of Object.entries(ratingRules)) {
    const rules = asRecord(rawRules) ?? {};
    const min = typeof rules.min === 'number' ? rules.min : 1;
    const max = typeof rules.max === 'number' ? rules.max : 5;
    const rating = ratings[name];
    if (typeof rating !== 'number' || !Number.isInteger(rating)) {
      issues.push(issue(question.id, `ratings.${name}`, 'Expected a whole-number rating.'));
      continue;
    }
    if (rating < min || rating > max) {
      issues.push(
        issue(question.id, `ratings.${name}`, `Rating must be between ${min} and ${max}.`),
      );
    }
  }
  return issues;
}

function validateNumericRange(question: QuestionDefinition, value: unknown): ValidationIssue[] {
  const record = asRecord(value);
  const values = asRecord(record?.values);
  if (!values) return [issue(question.id, 'values', 'Expected a set of numeric values.')];

  const issues: ValidationIssue[] = [];
  const fields = question.validationSchema.fields;
  const names = Array.isArray(fields) ? fields : Object.keys(values);

  for (const name of names) {
    if (typeof name !== 'string') continue;
    const entry = values[name];
    // §7.1: unknown is a valid answer where the specification permits it.
    if (entry === null || entry === undefined) {
      if (!question.allowUnknown) {
        issues.push(issue(question.id, `values.${name}`, 'A value is required.'));
      }
      continue;
    }
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      issues.push(issue(question.id, `values.${name}`, 'Expected a number or unknown.'));
      continue;
    }
    if (entry < 0) {
      issues.push(issue(question.id, `values.${name}`, 'Value cannot be negative.'));
    }
  }

  const confidenceRules = constraint(question, 'confidence');
  if (confidenceRules && record?.confidence !== undefined && record.confidence !== null) {
    const allowed = Array.isArray(confidenceRules.enum) ? confidenceRules.enum : [];
    if (!allowed.includes(record.confidence)) {
      issues.push(issue(question.id, 'confidence', 'Confidence must be low, medium or high.'));
    }
  }

  return issues;
}

function validateWorkflowBuilder(question: QuestionDefinition, value: unknown): ValidationIssue[] {
  const record = asRecord(value);
  const stages = record?.stages;
  if (!Array.isArray(stages)) {
    return [issue(question.id, 'stages', 'Expected a list of workflow stages.')];
  }

  const rules = constraint(question, 'stages') ?? {};
  const min = typeof rules.min === 'number' ? rules.min : 4;
  const max = typeof rules.max === 'number' ? rules.max : 15;
  const issues: ValidationIssue[] = [];

  if (stages.length < min) {
    issues.push(issue(question.id, 'stages', `A campaign flow needs at least ${min} stages.`));
  }
  if (stages.length > max) {
    issues.push(issue(question.id, 'stages', `A campaign flow may have at most ${max} stages.`));
  }

  stages.forEach((rawStage, index) => {
    const stage = asRecord(rawStage);
    const name = stage?.name;
    issues.push(
      ...validateTextField(question.id, `stages[${index}].name`, name, {
        required: true,
        min: typeof rules.nameMin === 'number' ? rules.nameMin : 2,
        max: typeof rules.nameMax === 'number' ? rules.nameMax : 120,
      }),
    );
  });

  return issues;
}

function validateAssetSelector(question: QuestionDefinition, value: unknown): ValidationIssue[] {
  const record = asRecord(value);
  if (!record) return [issue(question.id, '', 'Expected an asset selection.')];

  const issues: ValidationIssue[] = [];
  const onBrandRules = constraint(question, 'onBrand') ?? { minItems: 1 };
  const onBrand = record.onBrand;
  const minItems = typeof onBrandRules.minItems === 'number' ? onBrandRules.minItems : 1;

  if (!Array.isArray(onBrand) || onBrand.length < minItems) {
    issues.push(
      issue(
        question.id,
        'onBrand',
        `At least ${minItems} on-brand example is required — inferred brand rules need positive evidence (§9.2).`,
      ),
    );
  }

  if (
    record.offBrand !== undefined &&
    record.offBrand !== null &&
    !Array.isArray(record.offBrand)
  ) {
    issues.push(issue(question.id, 'offBrand', 'Expected a list of off-brand examples.'));
  }

  return issues;
}

/** Validates one answer against its definition. Returns [] when the answer is fine. */
export function validateResponse(question: QuestionDefinition, value: unknown): ValidationIssue[] {
  // §7.1: `unknown` is a first-class answer, but only where the question allows it.
  if (value === null) {
    return question.allowUnknown
      ? []
      : [issue(question.id, '', 'This question cannot be answered "unknown".')];
  }
  if (value === undefined) {
    return question.required ? [issue(question.id, '', 'This question is required.')] : [];
  }

  switch (question.answerType) {
    case 'single_select':
      return validateSingleSelect(question, value);
    case 'multi_select':
      return validateSelections(question, value);
    case 'ranked_select':
      return validateRanked(question, value);
    case 'structured_object':
      return validateStructuredObject(question, value);
    case 'structured_list':
      return validateStructuredList(question, value);
    case 'rating_matrix':
      return validateRatingMatrix(question, value);
    case 'numeric_range':
      return validateNumericRange(question, value);
    case 'workflow_builder':
      return validateWorkflowBuilder(question, value);
    case 'asset_selector':
      return validateAssetSelector(question, value);
    case 'short_text':
      return validateTextField(question.id, 'text', asRecord(value)?.text ?? value, {
        required: question.required,
        ...(constraint(question, 'text') ?? {}),
      });
  }
}

/**
 * Validates the whole intake.
 *
 * Only visible questions count. §2.5 tracks "at least 80% of required inputs
 * complete before analysis", and a hidden branch dragging that ratio down would
 * make the metric meaningless.
 */
export function validateIntake(
  responses: ResponseMap,
  allQuestions: readonly QuestionDefinition[] = QUESTIONS,
): IntakeValidationResult {
  const visible = visibleQuestions(responses, allQuestions);
  const issues: ValidationIssue[] = [];
  const missingRequired: string[] = [];

  for (const question of visible) {
    const value = responses[question.id];
    const unanswered = value === undefined;

    if (unanswered) {
      if (question.required) missingRequired.push(question.id);
      continue;
    }
    issues.push(...validateResponse(question, value));
  }

  const requiredVisible = visible.filter((q) => q.required);
  const answeredRequired = requiredVisible.length - missingRequired.length;
  const completionRatio =
    requiredVisible.length === 0 ? 1 : answeredRequired / requiredVisible.length;

  return {
    valid: issues.length === 0 && missingRequired.length === 0,
    issues,
    missingRequired,
    completionRatio: Math.round(completionRatio * 1000) / 1000,
  };
}

/**
 * §7.1: the intake cannot be marked complete until a sponsor or strategist
 * confirms it, and §7.2 Q20 makes sponsor / workflow owner / daily user
 * mandatory before finalisation.
 */
export function canSubmitIntake(responses: ResponseMap): {
  canSubmit: boolean;
  blockers: string[];
} {
  const result = validateIntake(responses);
  const blockers: string[] = [];

  if (result.missingRequired.length > 0) {
    blockers.push(`${result.missingRequired.length} required question(s) are unanswered.`);
  }
  if (result.issues.length > 0) {
    blockers.push(`${result.issues.length} answer(s) have validation errors.`);
  }

  return { canSubmit: blockers.length === 0, blockers };
}

export function isQuestionVisible(questionId: string, responses: ResponseMap): boolean {
  const question = QUESTIONS.find((q) => q.id === questionId);
  return question ? isVisible(question, responses) : false;
}
