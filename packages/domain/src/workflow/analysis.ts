import type { ReworkFrequency, WorkflowStage } from './types.js';

/**
 * Friction analysis — PRD §8.4: "The final report highlights the three largest
 * wait, work and rework points."
 *
 * These three lists are what turn a flow map into an argument. They are also
 * the inputs to the cycle-time and repeatability scoring factors (§11.2), so
 * the ordering has to be deterministic — ties break on stage order, never on
 * whatever sequence the database happened to return.
 */

export const HIGHLIGHT_COUNT = 3;

/** Ordinal weights for §8.3 `reworkFrequency`. `unknown` sorts as no evidence. */
const REWORK_WEIGHT: Record<ReworkFrequency, number> = {
  never: 0,
  rare: 1,
  sometimes: 2,
  often: 3,
  almost_always: 4,
  unknown: -1,
};

export interface FrictionPoint {
  stageId: string;
  stageName: string;
  order: number;
  /** Minutes for wait/work; the ordinal weight for rework. */
  value: number;
  label: string;
}

export interface FrictionAnalysis {
  largestWaits: FrictionPoint[];
  largestWorkloads: FrictionPoint[];
  mostReworked: FrictionPoint[];
  /** Sum of elapsed time across stages with a known duration, in minutes. */
  totalElapsedMinutes: number | null;
  totalWorkMinutes: number | null;
  totalWaitMinutes: number | null;
}

function topBy(
  stages: WorkflowStage[],
  read: (stage: WorkflowStage) => number | undefined,
  format: (value: number) => string,
): FrictionPoint[] {
  return stages
    .map((stage) => ({ stage, value: read(stage) }))
    .filter((entry): entry is { stage: WorkflowStage; value: number } => entry.value !== undefined)
    .sort((a, b) => (b.value !== a.value ? b.value - a.value : a.stage.order - b.stage.order))
    .slice(0, HIGHLIGHT_COUNT)
    .map(({ stage, value }) => ({
      stageId: stage.id,
      stageName: stage.name,
      order: stage.order,
      value,
      label: format(value),
    }));
}

function sumDefined(
  stages: WorkflowStage[],
  read: (s: WorkflowStage) => number | undefined,
): number | null {
  const values = stages.map(read).filter((v): v is number => v !== undefined);
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0);
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

const REWORK_LABEL: Record<number, string> = {
  0: 'never',
  1: 'rarely',
  2: 'sometimes',
  3: 'often',
  4: 'almost always',
};

export function analyseFriction(stages: WorkflowStage[]): FrictionAnalysis {
  return {
    largestWaits: topBy(stages, (s) => s.waitTimeMinutes, formatMinutes),
    largestWorkloads: topBy(stages, (s) => s.workTimeMinutes, formatMinutes),
    mostReworked: topBy(
      stages,
      (s) => {
        if (s.reworkFrequency === undefined) return undefined;
        const weight = REWORK_WEIGHT[s.reworkFrequency];
        // `unknown` is not evidence of rework; exclude it rather than ranking it.
        return weight < 0 ? undefined : weight;
      },
      (value) => `Sent back ${REWORK_LABEL[value] ?? 'unknown'}`,
    ),
    totalElapsedMinutes: sumDefined(stages, (s) => s.elapsedTimeMinutes),
    totalWorkMinutes: sumDefined(stages, (s) => s.workTimeMinutes),
    totalWaitMinutes: sumDefined(stages, (s) => s.waitTimeMinutes),
  };
}

/**
 * Share of elapsed time that is waiting rather than working. This is usually
 * the most persuasive number in the whole report — a flow that is 85% waiting
 * has an obvious agentic opportunity that no amount of faster production fixes.
 */
export function waitRatio(analysis: FrictionAnalysis): number | null {
  if (analysis.totalElapsedMinutes === null || analysis.totalElapsedMinutes === 0) return null;
  if (analysis.totalWaitMinutes === null) return null;
  return Math.round((analysis.totalWaitMinutes / analysis.totalElapsedMinutes) * 1000) / 1000;
}
