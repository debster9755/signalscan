import { describe, expect, it } from 'vitest';
import {
  evaluateRule,
  isVisible,
  stripHiddenResponses,
  visibleGroups,
  visibleQuestions,
} from './branching.js';
import { northstarIntakeResponses } from './fixtures.js';
import {
  ESTIMATED_COMPLETION_MINUTES,
  QUESTIONS,
  QUESTION_IDS,
  getQuestion,
  questionsInGroup,
  resolveBrandRoute,
} from './questions.js';
import type { QuestionDefinition, ResponseMap } from './types.js';
import {
  canSubmitIntake,
  isQuestionVisible,
  validateIntake,
  validateResponse,
} from './validation.js';

const q = (id: string): QuestionDefinition => {
  const found = getQuestion(id);
  if (!found) throw new Error(`Question ${id} is missing from the set`);
  return found;
};

describe('the twenty questions (§7.2)', () => {
  it('defines exactly twenty questions', () => {
    expect(QUESTIONS).toHaveLength(20);
    expect(QUESTION_IDS).toHaveLength(20);
  });

  it('covers all five groups', () => {
    expect(questionsInGroup('business')).toHaveLength(4);
    expect(questionsInGroup('flow')).toHaveLength(6);
    expect(questionsInGroup('data')).toHaveLength(4);
    expect(questionsInGroup('brand')).toHaveLength(3);
    expect(questionsInGroup('risk')).toHaveLength(3);
  });

  it('uses the ids from the specification', () => {
    expect(QUESTION_IDS).toEqual([
      'business.priority_outcome',
      'business.focus_scope',
      'business.campaign_type',
      'business.success_measure',
      'flow.trigger',
      'flow.stages',
      'flow.roles',
      'flow.slowest_stages',
      'flow.rework',
      'flow.repeated_work',
      'data.systems',
      'data.quality',
      'data.monthly_volume',
      'data.current_cost',
      'brand.guidelines_available',
      'brand.examples',
      'brand.competitors',
      'risk.controls',
      'risk.ai_policy',
      'risk.pilot_roles',
    ]);
  });

  it('records what each answer is used by, so nothing is collected for its own sake', () => {
    for (const question of QUESTIONS) {
      expect(question.usedBy.length, question.id).toBeGreaterThan(0);
    }
  });

  it('makes only the cost question optional', () => {
    const optional = QUESTIONS.filter((question) => !question.required).map(
      (question) => question.id,
    );
    expect(optional).toEqual(['data.current_cost']);
  });

  it('permits "unknown" only where §7.2 says so', () => {
    const unknownAllowed = QUESTIONS.filter((question) => question.allowUnknown).map(
      (question) => question.id,
    );
    expect(unknownAllowed.sort()).toEqual(
      [
        'business.success_measure',
        'brand.guidelines_available',
        'data.current_cost',
        'data.monthly_volume',
        'flow.slowest_stages',
        'risk.ai_policy',
      ].sort(),
    );
  });

  it('advertises the 25-35 minute completion estimate from §7.1', () => {
    expect(ESTIMATED_COMPLETION_MINUTES).toEqual({ min: 25, max: 35 });
  });
});

describe('Q15 brand route (§9.1 / §9.2)', () => {
  it.each([
    ['yes', 'guideline_extraction'],
    ['partial', 'guideline_extraction'],
    ['no', 'campaign_inference'],
    ['unknown', 'undetermined'],
    [null, 'undetermined'],
  ])('routes "%s" to %s', (answer, route) => {
    expect(resolveBrandRoute(answer)).toBe(route);
  });
});

describe('response validation (§7.2)', () => {
  it('accepts the complete Northstar intake', () => {
    const result = validateIntake(northstarIntakeResponses());
    expect(result.issues).toEqual([]);
    expect(result.missingRequired).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.completionRatio).toBe(1);
  });

  it('reports partial completion against the §2.5 80% threshold', () => {
    const responses = northstarIntakeResponses();
    delete responses['risk.controls'];
    delete responses['risk.ai_policy'];
    delete responses['risk.pilot_roles'];

    const result = validateIntake(responses);
    expect(result.missingRequired).toHaveLength(3);
    // 16 of 19 required questions answered.
    expect(result.completionRatio).toBeCloseTo(16 / 19, 3);
    expect(result.valid).toBe(false);
  });

  describe('Q01 priority outcome — maximum two selections', () => {
    it('rejects three selections', () => {
      const issues = validateResponse(q('business.priority_outcome'), {
        selections: ['efficiency', 'awareness', 'retention'],
      });
      expect(issues.map((i) => i.message).join(' ')).toMatch(/at most 2/);
    });

    it('requires an explanation when "other" is chosen', () => {
      const issues = validateResponse(q('business.priority_outcome'), { selections: ['other'] });
      expect(issues.some((i) => i.path === 'otherText')).toBe(true);
    });

    it('accepts "other" with an explanation', () => {
      const issues = validateResponse(q('business.priority_outcome'), {
        selections: ['other'],
        otherText: 'Reduce agency dependency',
      });
      expect(issues).toEqual([]);
    });

    it('rejects an option that is not on the list', () => {
      const issues = validateResponse(q('business.priority_outcome'), {
        selections: ['world_domination'],
      });
      expect(issues[0]?.message).toMatch(/not a valid option/);
    });

    it('rejects the same option twice', () => {
      const issues = validateResponse(q('business.priority_outcome'), {
        selections: ['efficiency', 'efficiency'],
      });
      expect(issues.map((i) => i.message).join(' ')).toMatch(/more than once/);
    });
  });

  describe('Q06 workflow builder — 4 to 15 stages (§8.1)', () => {
    const stages = (count: number) => ({
      stages: Array.from({ length: count }, (_, i) => ({ name: `Stage ${i + 1}` })),
    });

    it('rejects fewer than four stages', () => {
      expect(validateResponse(q('flow.stages'), stages(3))[0]?.message).toMatch(/at least 4/);
    });

    it('rejects more than fifteen', () => {
      expect(validateResponse(q('flow.stages'), stages(16))[0]?.message).toMatch(/at most 15/);
    });

    it('accepts the boundaries', () => {
      expect(validateResponse(q('flow.stages'), stages(4))).toEqual([]);
      expect(validateResponse(q('flow.stages'), stages(15))).toEqual([]);
    });

    it('requires a usable stage name', () => {
      const issues = validateResponse(q('flow.stages'), {
        stages: [{ name: 'A' }, { name: 'Brief' }, { name: 'Build' }, { name: 'Launch' }],
      });
      expect(issues[0]?.path).toBe('stages[0].name');
    });
  });

  describe('Q12 information quality — four 1-5 ratings', () => {
    it('rejects a rating outside the scale', () => {
      const issues = validateResponse(q('data.quality'), {
        ratings: { findability: 6, completeness: 3, structure: 3, freshness: 3 },
      });
      expect(issues[0]?.message).toMatch(/between 1 and 5/);
    });

    it('rejects a fractional rating', () => {
      const issues = validateResponse(q('data.quality'), {
        ratings: { findability: 3.5, completeness: 3, structure: 3, freshness: 3 },
      });
      expect(issues[0]?.message).toMatch(/whole-number/);
    });

    it('requires all four dimensions', () => {
      const issues = validateResponse(q('data.quality'), { ratings: { findability: 3 } });
      expect(issues).toHaveLength(3);
    });
  });

  describe('Q13 monthly volume — unknown is a valid answer (§7.1)', () => {
    it('accepts nulls because the question permits unknown', () => {
      const issues = validateResponse(q('data.monthly_volume'), {
        values: {
          campaigns: null,
          briefs: null,
          channels: null,
          masterAssets: null,
          variants: null,
          markets: null,
        },
      });
      expect(issues).toEqual([]);
    });

    it('still rejects a negative volume', () => {
      const issues = validateResponse(q('data.monthly_volume'), {
        values: {
          campaigns: -1,
          briefs: null,
          channels: null,
          masterAssets: null,
          variants: null,
          markets: null,
        },
      });
      expect(issues[0]?.message).toMatch(/cannot be negative/);
    });
  });

  describe('Q14 current cost — optional, and never invented (§12.1)', () => {
    it('accepts a wholly unknown cost picture', () => {
      expect(validateResponse(q('data.current_cost'), null)).toEqual([]);
    });

    it('validates the confidence band when one is given', () => {
      const issues = validateResponse(q('data.current_cost'), {
        values: { internalHours: 100 },
        confidence: 'very-sure',
      });
      expect(issues[0]?.message).toMatch(/low, medium or high/);
    });
  });

  describe('Q17 competitors — exactly two (§9.3)', () => {
    const competitor = (name: string) => ({
      name,
      officialUrl: 'https://example.com/x',
      commercialRationale: 'Competes for the same mid-market deals.',
    });

    it('rejects one competitor', () => {
      const issues = validateResponse(q('brand.competitors'), { rows: [competitor('One')] });
      expect(issues[0]?.message).toMatch(/Exactly 2/);
    });

    it('rejects three competitors', () => {
      const issues = validateResponse(q('brand.competitors'), {
        rows: [competitor('One'), competitor('Two'), competitor('Three')],
      });
      expect(issues[0]?.message).toMatch(/Exactly 2/);
    });

    it('requires an https URL, because §6.3 forbids plain http in production', () => {
      const issues = validateResponse(q('brand.competitors'), {
        rows: [{ ...competitor('One'), officialUrl: 'http://example.com/x' }, competitor('Two')],
      });
      expect(issues.some((i) => i.message.includes('https://'))).toBe(true);
    });

    it('requires a real commercial rationale, not a placeholder', () => {
      const issues = validateResponse(q('brand.competitors'), {
        rows: [{ ...competitor('One'), commercialRationale: 'big' }, competitor('Two')],
      });
      expect(issues.some((i) => i.message.includes('at least 10'))).toBe(true);
    });
  });

  describe('Q18 risk controls — exclusive options', () => {
    it('rejects "no known restrictions" alongside a specific restriction', () => {
      const issues = validateResponse(q('risk.controls'), {
        selections: ['no_known_restrictions', 'personal_data'],
      });
      expect(issues[0]?.message).toMatch(/cannot be combined/);
    });

    it('accepts it on its own', () => {
      expect(
        validateResponse(q('risk.controls'), { selections: ['no_known_restrictions'] }),
      ).toEqual([]);
    });
  });

  describe('Q16 brand examples — at least one on-brand example', () => {
    it('rejects an empty on-brand list', () => {
      const issues = validateResponse(q('brand.examples'), { onBrand: [], offBrand: [] });
      expect(issues[0]?.message).toMatch(/on-brand example is required/);
    });

    it('accepts an absent off-brand list', () => {
      expect(validateResponse(q('brand.examples'), { onBrand: ['a1'] })).toEqual([]);
    });
  });

  describe('unknown handling', () => {
    it('refuses "unknown" on a question that does not allow it', () => {
      const issues = validateResponse(q('business.priority_outcome'), null);
      expect(issues[0]?.message).toMatch(/cannot be answered "unknown"/);
    });

    it('accepts "unknown" where §7.2 permits it', () => {
      expect(validateResponse(q('brand.guidelines_available'), null)).toEqual([]);
    });

    it('flags an unanswered required question', () => {
      expect(validateResponse(q('flow.trigger'), undefined)[0]?.message).toMatch(/required/);
    });

    it('lets an optional question go unanswered', () => {
      expect(validateResponse(q('data.current_cost'), undefined)).toEqual([]);
    });
  });
});

describe('submission gate (§7.1)', () => {
  it('allows submission of a complete intake', () => {
    expect(canSubmitIntake(northstarIntakeResponses())).toEqual({ canSubmit: true, blockers: [] });
  });

  it('blocks submission and explains why', () => {
    const responses = northstarIntakeResponses();
    delete responses['flow.trigger'];
    responses['data.quality'] = {
      ratings: { findability: 9, completeness: 3, structure: 3, freshness: 3 },
    };

    const result = canSubmitIntake(responses);
    expect(result.canSubmit).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/required question/);
    expect(result.blockers.join(' ')).toMatch(/validation errors/);
  });
});

describe('branching engine (§7.1, §7.3)', () => {
  const controller: QuestionDefinition = {
    ...q('brand.guidelines_available'),
    id: 'test.controller',
  };
  const dependent: QuestionDefinition = {
    ...q('brand.examples'),
    id: 'test.dependent',
    visibleWhen: { questionId: 'test.controller', operator: 'equals', value: 'no' },
  };
  const nested: QuestionDefinition = {
    ...q('brand.examples'),
    id: 'test.nested',
    visibleWhen: { questionId: 'test.dependent', operator: 'not_equals', value: undefined },
  };
  const set = [controller, dependent, nested];

  it('shows a question with no rule', () => {
    expect(isVisible(controller, {}, set)).toBe(true);
  });

  it.each([
    ['equals', 'no', 'no', true],
    ['equals', 'no', 'yes', false],
    ['not_equals', 'no', 'yes', true],
    ['not_equals', 'no', 'no', false],
  ])('evaluates %s (%s vs %s) → %s', (operator, ruleValue, actual, expected) => {
    expect(
      evaluateRule(
        { questionId: 'c', operator: operator as 'equals' | 'not_equals', value: ruleValue },
        { c: actual },
      ),
    ).toBe(expected);
  });

  it('evaluates "includes" against an array answer', () => {
    expect(
      evaluateRule({ questionId: 'c', operator: 'includes', value: 'brand' }, { c: ['brand'] }),
    ).toBe(true);
    expect(
      evaluateRule({ questionId: 'c', operator: 'includes', value: 'legal' }, { c: ['brand'] }),
    ).toBe(false);
  });

  it('evaluates "includes" against a string answer', () => {
    expect(
      evaluateRule({ questionId: 'c', operator: 'includes', value: 'bra' }, { c: 'brand' }),
    ).toBe(true);
  });

  it('returns false for "includes" against a value that is neither', () => {
    expect(evaluateRule({ questionId: 'c', operator: 'includes', value: 'x' }, { c: 42 })).toBe(
      false,
    );
  });

  it('hides a question whose controlling question is itself hidden', () => {
    // Otherwise a nested branch can resurrect through a stale parent answer.
    const responses: ResponseMap = {
      'test.controller': 'yes',
      'test.dependent': { onBrand: ['a'] },
    };
    expect(isVisible(dependent, responses, set)).toBe(false);
    expect(isVisible(nested, responses, set)).toBe(false);
  });

  it('strips answers to hidden questions so they never reach the API (§7.1)', () => {
    const responses: ResponseMap = {
      'test.controller': 'yes',
      'test.dependent': { onBrand: ['stale'] },
    };
    expect(stripHiddenResponses(responses, set)).toEqual({ 'test.controller': 'yes' });
  });

  it('keeps answers once the branch is visible again', () => {
    const responses: ResponseMap = {
      'test.controller': 'no',
      'test.dependent': { onBrand: ['a1'] },
    };
    expect(Object.keys(stripHiddenResponses(responses, set)).sort()).toEqual([
      'test.controller',
      'test.dependent',
      // nested becomes visible too, but has no stored answer to keep
    ]);
  });

  it('treats every v1 question as unconditionally visible', () => {
    // The v1 set has no hidden questions; the engine exists because §7.3 makes
    // visibleWhen part of the stored definition and future versions will use it.
    expect(visibleQuestions({})).toHaveLength(20);
  });

  it('groups visible questions for the one-group-at-a-time UI', () => {
    const groups = visibleGroups({});
    expect(groups.map((g) => g.group)).toEqual(['business', 'flow', 'data', 'brand', 'risk']);
    expect(groups.reduce((sum, g) => sum + g.questions.length, 0)).toBe(20);
  });

  it('answers visibility by id', () => {
    expect(isQuestionVisible('flow.trigger', {})).toBe(true);
    expect(isQuestionVisible('does.not.exist', {})).toBe(false);
  });
});
