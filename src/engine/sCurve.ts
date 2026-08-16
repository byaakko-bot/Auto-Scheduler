// Progress curves (§27).
//
// Curves are weighted by activity duration, so a 60-day structural activity
// contributes thirty times what a 2-day inspection does. Weighting every
// activity equally produces a curve that looks plausible and means nothing.
//
// Three series, with different meanings:
//   planned  — the baseline, defined for the whole project
//   actual   — reported progress, defined only up to the data date
//   forecast — the re-solved schedule, defined from the data date onwards

import { workingDayDate, type WorkingCalendar } from "./calendarEngine";
import type { ScheduleNode } from "./types";

export interface CurvePoint {
  date: Date;
  workingDayOffset: number;
  plannedPct: number;
  actualPct: number | null;
  forecastPct: number | null;
}

export interface SCurveInput {
  /** Baseline-solved network. */
  planned: ScheduleNode[];
  /** Re-solved network including progress. Omit for a plan-only curve. */
  forecast?: ScheduleNode[];
  /** Reported percent complete per activity code, 0–100. */
  actualProgress?: Map<string, number>;
  projectStart: Date;
  calendar: WorkingCalendar;
  dataDateOffset?: number;
  /** Number of points across the project. */
  intervals?: number;
}

/** Cumulative weighted completion of a network at a given offset. */
function cumulativeAt(nodes: ScheduleNode[], offset: number): number {
  let earned = 0;
  let total = 0;
  for (const n of nodes) {
    const weight = Math.max(n.durationDays, 0);
    total += weight;
    if (weight === 0) continue;
    if (offset >= n.ef) earned += weight;
    else if (offset > n.es) earned += ((offset - n.es) / n.durationDays) * weight;
  }
  return total > 0 ? (earned / total) * 100 : 0;
}

/** Cumulative weighted completion from reported progress. */
function reportedCumulative(
  nodes: ScheduleNode[],
  progress: Map<string, number>,
  offset: number
): number {
  let earned = 0;
  let total = 0;
  for (const n of nodes) {
    const weight = Math.max(n.durationDays, 0);
    total += weight;
    if (weight === 0) continue;

    const pct = progress.get(n.taskId);
    if (pct === undefined) {
      // Not reported: credit it only if the plan says it finished before the
      // point being plotted, so unreported work is never credited early.
      if (offset >= n.ef) earned += weight;
      continue;
    }
    // Reported progress is a status at the data date, so it applies from the
    // activity's start onwards rather than being interpolated.
    if (offset >= n.es) earned += (Math.min(Math.max(pct, 0), 100) / 100) * weight;
  }
  return total > 0 ? (earned / total) * 100 : 0;
}

export function buildSCurve(input: SCurveInput): CurvePoint[] {
  const intervals = Math.max(input.intervals ?? 24, 2);
  const plannedEnd = input.planned.reduce((m, n) => Math.max(m, n.ef), 0);
  const forecastEnd = input.forecast
    ? input.forecast.reduce((m, n) => Math.max(m, n.ef), 0)
    : plannedEnd;
  const horizon = Math.max(plannedEnd, forecastEnd);
  if (horizon <= 0) return [];

  const step = horizon / intervals;
  const points: CurvePoint[] = [];

  for (let i = 0; i <= intervals; i++) {
    const offset = Math.round(i * step);

    const plannedPct = cumulativeAt(input.planned, offset);

    let actualPct: number | null = null;
    if (
      input.actualProgress &&
      input.dataDateOffset !== undefined &&
      offset <= input.dataDateOffset
    ) {
      actualPct = reportedCumulative(input.planned, input.actualProgress, offset);
    }

    let forecastPct: number | null = null;
    if (input.forecast) {
      // The forecast series is only meaningful from the data date onwards;
      // before that, actuals are the record.
      if (input.dataDateOffset === undefined || offset >= input.dataDateOffset) {
        forecastPct = cumulativeAt(input.forecast, offset);
      }
    }

    points.push({
      date: workingDayDate(input.projectStart, offset, input.calendar),
      workingDayOffset: offset,
      plannedPct,
      actualPct,
      forecastPct,
    });
  }

  return points;
}

export interface ProgressVariance {
  dataDate: Date;
  plannedPct: number;
  actualPct: number;
  variancePct: number;
  /** Working days the project is ahead (negative) or behind (positive). */
  scheduleVarianceDays: number;
}

/**
 * Schedule variance at the data date. The day figure is derived by asking how
 * far back along the planned curve the actual percentage was due — the usual
 * "how many days behind are we" question.
 */
export function progressVarianceAt(
  planned: ScheduleNode[],
  actualPct: number,
  dataDateOffset: number,
  projectStart: Date,
  calendar: WorkingCalendar
): ProgressVariance {
  const plannedPct = cumulativeAt(planned, dataDateOffset);
  const horizon = planned.reduce((m, n) => Math.max(m, n.ef), 0);

  // Walk the planned curve to find where the achieved percentage was due.
  let equivalentOffset = dataDateOffset;
  for (let o = 0; o <= horizon; o++) {
    if (cumulativeAt(planned, o) >= actualPct) {
      equivalentOffset = o;
      break;
    }
  }

  return {
    dataDate: workingDayDate(projectStart, dataDateOffset, calendar),
    plannedPct,
    actualPct,
    variancePct: actualPct - plannedPct,
    scheduleVarianceDays: dataDateOffset - equivalentOffset,
  };
}
