import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_COUNT, analyseFriction, waitRatio } from './analysis.js';
import {
  DEFAULT_NORMALIZED_STAGES,
  TEMPLATE_KEYS,
  WORKFLOW_TEMPLATES,
  getTemplate,
} from './templates.js';
import type { WorkflowStage } from './types.js';
import {
  MAX_STAGES,
  MIN_STAGES,
  type ValidationActor,
  canCertifyFlow,
  compareFlows,
  validateWorkflow,
} from './validation.js';

let sequence = 0;
function makeStage(overrides: Partial<WorkflowStage> = {}): WorkflowStage {
  sequence += 1;
  return {
    id: `stage-${sequence}`,
    assessmentId: 'assessment-1',
    order: sequence,
    name: `Stage ${sequence}`,
    trigger: 'Previous stage complete',
    inputAssetIds: [],
    ownerRole: 'Marketing Operations',
    contributorRoles: [],
    approverRoles: [],
    toolNames: [],
    actions: [],
    outputs: ['An output'],
    reworkReasons: [],
    riskTags: [],
    sourceCitationIds: [],
    captureMethod: 'template',
    status: 'draft',
    ...overrides,
  };
}

function validFlow(count = 5): WorkflowStage[] {
  sequence = 0;
  return Array.from({ length: count }, () => makeStage());
}

const operator: ValidationActor = { userId: 'u-operator', role: 'operator' };
const sponsor: ValidationActor = { userId: 'u-sponsor', role: 'sponsor' };

describe('capture path A — templates (§8.1)', () => {
  it('offers the five templates named in the specification', () => {
    expect(TEMPLATE_KEYS).toEqual([
      'general_campaign',
      'b2b_product_launch',
      'demand_generation',
      'always_on_content',
      'event_campaign',
    ]);
  });

  it('keeps every template inside the 4-15 stage bounds', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      expect(template.stages.length, template.key).toBeGreaterThanOrEqual(MIN_STAGES);
      expect(template.stages.length, template.key).toBeLessThanOrEqual(MAX_STAGES);
    }
  });

  it('gives every template stage an output, so a template alone validates', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      for (const stage of template.stages) {
        expect(stage.suggestedOutputs.length, `${template.key}/${stage.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('tags brand and legal stages so the approver rule can bite', () => {
    const general = getTemplate('general_campaign');
    const brandReview = general?.stages.find((s) => s.name.startsWith('Brand'));
    const legal = general?.stages.find((s) => s.name.startsWith('Legal'));
    expect(brandReview?.riskTags).toContain('brand');
    expect(legal?.riskTags).toContain('legal');
    expect(legal?.riskTags).toContain('regulated_claim');
  });

  it('lists the ten default normalised stages from §8.2', () => {
    expect(DEFAULT_NORMALIZED_STAGES).toHaveLength(10);
    expect(DEFAULT_NORMALIZED_STAGES[0]).toBe('Intake');
    expect(DEFAULT_NORMALIZED_STAGES[9]).toBe('Measurement and learning');
  });

  it('returns undefined for an unknown template key', () => {
    expect(getTemplate('nope')).toBeUndefined();
  });
});

describe('workflow validation (§8.4)', () => {
  it('accepts a well-formed flow', () => {
    expect(validateWorkflow(validFlow()).valid).toBe(true);
  });

  it('rejects fewer than four stages', () => {
    const result = validateWorkflow(validFlow(3));
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('too_few_stages');
  });

  it('rejects more than fifteen stages', () => {
    const result = validateWorkflow(validFlow(16));
    expect(result.issues[0]?.code).toBe('too_many_stages');
  });

  it('requires an owner on every stage', () => {
    sequence = 0;
    const stages = [makeStage({ ownerRole: '  ' }), ...validFlow(4)];
    const result = validateWorkflow(stages);
    expect(result.issues.some((i) => i.code === 'missing_owner')).toBe(true);
  });

  it('requires an output on every stage', () => {
    sequence = 0;
    const stages = [makeStage({ outputs: [] }), makeStage(), makeStage(), makeStage()];
    expect(validateWorkflow(stages).issues.some((i) => i.code === 'missing_output')).toBe(true);
  });

  it('treats a blank output as no output', () => {
    sequence = 0;
    const stages = [makeStage({ outputs: ['   '] }), makeStage(), makeStage(), makeStage()];
    expect(validateWorkflow(stages).issues.some((i) => i.code === 'missing_output')).toBe(true);
  });

  it.each(['brand', 'legal', 'privacy', 'regulated_claim'])(
    'requires an approver on a stage tagged %s',
    (tag) => {
      sequence = 0;
      const stages = [
        makeStage({ riskTags: [tag], approverRoles: [] }),
        makeStage(),
        makeStage(),
        makeStage(),
      ];
      const result = validateWorkflow(stages);
      expect(result.issues.some((i) => i.code === 'missing_approver_for_risk_tag')).toBe(true);
    },
  );

  it('accepts a controlled stage once an approver is named', () => {
    sequence = 0;
    const stages = [
      makeStage({ riskTags: ['legal'], approverRoles: ['Legal Counsel'] }),
      makeStage(),
      makeStage(),
      makeStage(),
    ];
    expect(validateWorkflow(stages).valid).toBe(true);
  });

  it('ignores an uncontrolled tag for the approver rule', () => {
    sequence = 0;
    const stages = [
      makeStage({ riskTags: ['nice_to_have'] }),
      makeStage(),
      makeStage(),
      makeStage(),
    ];
    expect(validateWorkflow(stages).valid).toBe(true);
  });

  it('rejects work time greater than elapsed time', () => {
    sequence = 0;
    const stages = [
      makeStage({ workTimeMinutes: 200, elapsedTimeMinutes: 100 }),
      makeStage(),
      makeStage(),
      makeStage(),
    ];
    const result = validateWorkflow(stages);
    expect(result.issues.some((i) => i.code === 'work_exceeds_elapsed')).toBe(true);
  });

  it('allows work time equal to elapsed time', () => {
    sequence = 0;
    const stages = [
      makeStage({ workTimeMinutes: 100, elapsedTimeMinutes: 100 }),
      makeStage(),
      makeStage(),
      makeStage(),
    ];
    expect(validateWorkflow(stages).valid).toBe(true);
  });

  it('rejects duplicate stage ordering', () => {
    sequence = 0;
    const stages = [makeStage({ order: 1 }), makeStage({ order: 1 }), makeStage(), makeStage()];
    expect(validateWorkflow(stages).issues.some((i) => i.code === 'duplicate_order')).toBe(true);
  });

  describe('unknown durations (§8.4)', () => {
    it('are valid but reduce evidence confidence', () => {
      sequence = 0;
      const stages = [
        makeStage({ elapsedTimeMinutes: 100 }),
        makeStage({ elapsedTimeMinutes: 100 }),
        makeStage(),
        makeStage(),
      ];
      const result = validateWorkflow(stages);
      expect(result.valid).toBe(true);
      expect(result.unknownDurationStageIds).toHaveLength(2);
      expect(result.durationCoverage).toBe(0.5);
    });

    it('reports full coverage when every stage is timed', () => {
      sequence = 0;
      const stages = Array.from({ length: 4 }, () => makeStage({ elapsedTimeMinutes: 60 }));
      expect(validateWorkflow(stages).durationCoverage).toBe(1);
    });

    it('reports zero coverage for an empty flow without dividing by zero', () => {
      expect(validateWorkflow([]).durationCoverage).toBe(0);
    });
  });
});

describe('certification (§8.4)', () => {
  it('refuses to certify a flow that still has issues', () => {
    const result = canCertifyFlow([operator], validateWorkflow(validFlow(2)));
    expect(result.certified).toBe(false);
    expect(result.reason).toMatch(/unresolved issue/);
  });

  it('refuses to certify a flow nobody has validated', () => {
    const result = canCertifyFlow([], validateWorkflow(validFlow()));
    expect(result.certified).toBe(false);
    expect(result.reason).toMatch(/Nobody has validated/);
  });

  it('refuses to let a sponsor certify the flow alone', () => {
    // A sponsor describes the process they believe exists. Only someone who
    // does the work knows what actually happens.
    const result = canCertifyFlow([sponsor], validateWorkflow(validFlow()));
    expect(result.certified).toBe(false);
    expect(result.reason).toMatch(/hands-on operator must confirm/);
    expect(result.reason).toMatch(/sponsor/);
  });

  it('certifies once a hands-on operator has validated it', () => {
    const result = canCertifyFlow([sponsor, operator], validateWorkflow(validFlow()));
    expect(result.certified).toBe(true);
  });

  it('reports operator validation on the validation result too', () => {
    expect(validateWorkflow(validFlow(), [operator]).operatorValidated).toBe(true);
    expect(validateWorkflow(validFlow(), [sponsor]).operatorValidated).toBe(false);
  });
});

describe('documented versus observed flow (§8.4)', () => {
  it('reports no difference for identical flows', () => {
    sequence = 0;
    const documented = [makeStage({ name: 'Brief' }), makeStage({ name: 'Launch' })];
    sequence = 0;
    const observed = [makeStage({ name: 'Brief' }), makeStage({ name: 'Launch' })];
    expect(compareFlows(documented, observed).differ).toBe(false);
  });

  it('flags a stage that only exists on paper', () => {
    sequence = 0;
    const documented = [makeStage({ name: 'Brief' }), makeStage({ name: 'Legal review' })];
    sequence = 0;
    const observed = [makeStage({ name: 'Brief' })];
    const result = compareFlows(documented, observed);
    expect(result.differ).toBe(true);
    expect(result.differences[0]).toMatchObject({
      stageName: 'Legal review',
      presentIn: 'documented_only',
    });
  });

  it('flags a stage that only happens in practice', () => {
    sequence = 0;
    const documented = [makeStage({ name: 'Brief' })];
    sequence = 0;
    const observed = [makeStage({ name: 'Brief' }), makeStage({ name: 'Informal CMO review' })];
    const result = compareFlows(documented, observed);
    expect(result.differences[0]).toMatchObject({
      stageName: 'Informal CMO review',
      presentIn: 'observed_only',
    });
  });

  it('flags a stage that runs in a different position in practice', () => {
    const documented = [makeStage({ name: 'Legal review', order: 8 })];
    const observed = [makeStage({ name: 'Legal review', order: 3 })];
    const result = compareFlows(documented, observed);
    expect(result.differences[0]?.detail).toMatch(/position 3 in practice but 8 on paper/);
  });

  it('matches stage names case- and whitespace-insensitively', () => {
    const documented = [makeStage({ name: 'Legal Review', order: 1 })];
    const observed = [makeStage({ name: '  legal review ', order: 1 })];
    expect(compareFlows(documented, observed).differ).toBe(false);
  });
});

describe('friction analysis (§8.4)', () => {
  const stages: WorkflowStage[] = [
    makeStage({
      order: 1,
      name: 'Intake',
      waitTimeMinutes: 30,
      workTimeMinutes: 60,
      reworkFrequency: 'never',
    }),
    makeStage({
      order: 2,
      name: 'Brief',
      waitTimeMinutes: 2880,
      workTimeMinutes: 240,
      reworkFrequency: 'often',
    }),
    makeStage({
      order: 3,
      name: 'Brand review',
      waitTimeMinutes: 5760,
      workTimeMinutes: 120,
      reworkFrequency: 'almost_always',
    }),
    makeStage({
      order: 4,
      name: 'Legal review',
      waitTimeMinutes: 11520,
      workTimeMinutes: 90,
      reworkFrequency: 'sometimes',
    }),
    makeStage({
      order: 5,
      name: 'Launch',
      waitTimeMinutes: 60,
      workTimeMinutes: 480,
      reworkFrequency: 'unknown',
    }),
  ];

  it('highlights exactly the three largest wait points', () => {
    const { largestWaits } = analyseFriction(stages);
    expect(largestWaits).toHaveLength(HIGHLIGHT_COUNT);
    expect(largestWaits.map((p) => p.stageName)).toEqual(['Legal review', 'Brand review', 'Brief']);
  });

  it('highlights the three largest workloads', () => {
    const { largestWorkloads } = analyseFriction(stages);
    expect(largestWorkloads.map((p) => p.stageName)).toEqual(['Launch', 'Brief', 'Brand review']);
  });

  it('ranks rework by frequency and excludes unknowns as non-evidence', () => {
    const { mostReworked } = analyseFriction(stages);
    expect(mostReworked.map((p) => p.stageName)).toEqual(['Brand review', 'Brief', 'Legal review']);
    expect(mostReworked.map((p) => p.stageName)).not.toContain('Launch');
  });

  it('formats durations for the report', () => {
    const { largestWaits } = analyseFriction(stages);
    expect(largestWaits[0]?.label).toBe('8 days');
  });

  it('breaks ties on stage order so the report is stable across runs', () => {
    const tied = [
      makeStage({ order: 5, name: 'Later', waitTimeMinutes: 100 }),
      makeStage({ order: 2, name: 'Earlier', waitTimeMinutes: 100 }),
    ];
    expect(analyseFriction(tied).largestWaits.map((p) => p.stageName)).toEqual([
      'Earlier',
      'Later',
    ]);
  });

  it('totals only the stages that have known values', () => {
    const partial = [makeStage({ elapsedTimeMinutes: 100, waitTimeMinutes: 80 }), makeStage({})];
    const analysis = analyseFriction(partial);
    expect(analysis.totalElapsedMinutes).toBe(100);
    expect(analysis.totalWorkMinutes).toBeNull();
  });

  it('computes the wait ratio — usually the most persuasive number in the report', () => {
    const timed = [
      makeStage({ elapsedTimeMinutes: 1000, waitTimeMinutes: 850 }),
      makeStage({ elapsedTimeMinutes: 1000, waitTimeMinutes: 850 }),
    ];
    expect(waitRatio(analyseFriction(timed))).toBe(0.85);
  });

  it('returns null rather than a fake ratio when nothing is timed', () => {
    expect(waitRatio(analyseFriction([makeStage({})]))).toBeNull();
  });

  it('returns null when elapsed time totals zero', () => {
    const zero = [makeStage({ elapsedTimeMinutes: 0, waitTimeMinutes: 0 })];
    expect(waitRatio(analyseFriction(zero))).toBeNull();
  });

  it('handles an empty flow', () => {
    const analysis = analyseFriction([]);
    expect(analysis.largestWaits).toEqual([]);
    expect(analysis.totalElapsedMinutes).toBeNull();
  });
});
