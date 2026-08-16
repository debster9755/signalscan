import { QUESTIONS } from './questions.js';
import type { QuestionDefinition, ResponseMap, VisibilityRule } from './types.js';

/**
 * Question visibility — PRD §7.1, §7.3.
 *
 * Two rules matter here and they are easy to get wrong:
 *
 *   - A hidden question is not "answered with nothing". It is out of scope, so
 *     it must not count against completion and must not block submission.
 *   - §7.1: "Do not send hidden branch responses to the API." Draft answers to
 *     a branch the client later navigated away from are stale, and letting them
 *     reach scoring means an assessment can be shaped by an answer nobody can
 *     see on screen.
 */

export function evaluateRule(rule: VisibilityRule, responses: ResponseMap): boolean {
  const actual = responses[rule.questionId];

  switch (rule.operator) {
    case 'equals':
      return actual === rule.value;
    case 'not_equals':
      return actual !== rule.value;
    case 'includes':
      if (Array.isArray(actual)) return actual.includes(rule.value);
      if (typeof actual === 'string' && typeof rule.value === 'string') {
        return actual.includes(rule.value);
      }
      return false;
  }
}

/**
 * A question with no rule is always visible. A question whose controlling
 * question is itself hidden is hidden too — otherwise a nested branch can
 * resurrect through a stale parent answer.
 */
export function isVisible(
  question: QuestionDefinition,
  responses: ResponseMap,
  allQuestions: readonly QuestionDefinition[] = QUESTIONS,
): boolean {
  if (!question.visibleWhen) return true;

  const controller = allQuestions.find((q) => q.id === question.visibleWhen!.questionId);
  if (controller && controller.visibleWhen) {
    if (!isVisible(controller, responses, allQuestions)) return false;
  }

  return evaluateRule(question.visibleWhen, responses);
}

export function visibleQuestions(
  responses: ResponseMap,
  allQuestions: readonly QuestionDefinition[] = QUESTIONS,
): QuestionDefinition[] {
  return allQuestions
    .filter((q) => isVisible(q, responses, allQuestions))
    .sort((a, b) => a.order - b.order);
}

/**
 * §7.1: strips answers to questions that are not currently visible, so a stale
 * draft from an abandoned branch never reaches the API or the scoring model.
 */
export function stripHiddenResponses(
  responses: ResponseMap,
  allQuestions: readonly QuestionDefinition[] = QUESTIONS,
): ResponseMap {
  const visibleIds = new Set(visibleQuestions(responses, allQuestions).map((q) => q.id));
  const cleaned: ResponseMap = {};
  for (const [questionId, value] of Object.entries(responses)) {
    if (visibleIds.has(questionId)) {
      cleaned[questionId] = value;
    }
  }
  return cleaned;
}

/** Groups visible questions for the one-group-at-a-time UI in §7.1. */
export function visibleGroups(
  responses: ResponseMap,
  allQuestions: readonly QuestionDefinition[] = QUESTIONS,
): { group: QuestionDefinition['group']; questions: QuestionDefinition[] }[] {
  const visible = visibleQuestions(responses, allQuestions);
  const order: QuestionDefinition['group'][] = ['business', 'flow', 'data', 'brand', 'risk'];
  return order
    .map((group) => ({ group, questions: visible.filter((q) => q.group === group) }))
    .filter((entry) => entry.questions.length > 0);
}
