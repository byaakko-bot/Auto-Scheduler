// Fitting a schedule to a target completion date.
//
// The honest way to hit a date is to resource the work to fit it, not to
// shorten activities until the arithmetic agrees. This searches for the
// smallest crew count whose generated schedule meets the target, and when no
// crew count within the limit does, it says so and returns the best it found
// rather than pretending (§42).

import { ScheduleEngine } from "./index";
import type { GeneratedSchedule, ProjectInputs } from "./types";

export interface FitOptions {
  /** Most crews that may be assigned to any quantity-driven activity. */
  maxCrews?: number;
  /** Crews to start searching from. */
  minCrews?: number;
}

export interface FitResult {
  schedule: GeneratedSchedule;
  /** Crews the returned schedule was generated with. */
  crews: number;
  /** Whether the target completion date is met. */
  achieved: boolean;
  /** Crew counts tried, with the duration each produced. */
  attempts: { crews: number; durationWorkingDays: number; feasible: boolean }[];
  maxCrewsSearched: number;
  /**
   * Working days still short at the highest crew count tried. Zero when the
   * target is met.
   */
  residualGapDays: number;
  explanation: string;
}

/**
 * Generates the schedule that meets `targetEndDate` with the fewest crews.
 *
 * Adding crews only shortens quantity-driven activities, so beyond some point
 * the critical path is governed by lead times, approvals and curing that no
 * amount of labour compresses. The search stops there rather than reporting a
 * date the engine cannot actually produce.
 */
export function generateWithinTarget(
  inputs: ProjectInputs,
  options: FitOptions = {}
): FitResult {
  const maxCrews = Math.max(options.maxCrews ?? 8, 1);
  const minCrews = Math.max(options.minCrews ?? 1, 1);

  const attempts: FitResult["attempts"] = [];
  let best: { schedule: GeneratedSchedule; crews: number } | null = null;

  for (let crews = minCrews; crews <= maxCrews; crews++) {
    const schedule = new ScheduleEngine({ ...inputs, crews }).generate();
    const feasible = schedule.feasibility.isFeasible;

    attempts.push({
      crews,
      durationWorkingDays: schedule.projectDurationWorkingDays,
      feasible,
    });

    // Keep the shortest schedule seen, so a failed search still returns the
    // best achievable rather than the last one tried.
    if (
      !best ||
      schedule.projectDurationWorkingDays < best.schedule.projectDurationWorkingDays
    ) {
      best = { schedule, crews };
    }

    if (feasible) {
      return {
        schedule,
        crews,
        achieved: true,
        attempts,
        maxCrewsSearched: crews,
        residualGapDays: 0,
        explanation:
          `Target met with ${crews} crew(s): ${schedule.projectDurationWorkingDays} ` +
          `working days against ${schedule.feasibility.availableWorkingDays ?? "—"} available.`,
      };
    }

    // Stop only when more crews genuinely change nothing. Proving the target
    // unreachable is NOT a reason to stop: the caller still needs the shortest
    // achievable programme, and abandoning the search early reports a worse
    // best-effort than the engine can actually deliver. Each attempt is one
    // CPM solve, so searching the full range is cheap.
    if (attempts.length >= 2) {
      const prev = attempts[attempts.length - 2];
      const curr = attempts[attempts.length - 1];
      if (prev.durationWorkingDays - curr.durationWorkingDays <= 0) break;
    }
  }

  const chosen = best!;
  const gap = chosen.schedule.feasibility.gapWorkingDays;
  const lastTried = attempts[attempts.length - 1]?.crews ?? minCrews;

  return {
    schedule: chosen.schedule,
    crews: chosen.crews,
    achieved: false,
    attempts,
    maxCrewsSearched: lastTried,
    residualGapDays: gap,
    explanation:
      `Target not achievable by adding crews. The best result was ` +
      `${chosen.schedule.projectDurationWorkingDays} working days with ` +
      `${chosen.crews} crew(s), still ${gap} working day(s) over. ` +
      (lastTried < maxCrews
        ? `Extra crews stopped shortening the programme at ${lastTried}: the ` +
          `remaining critical path is governed by lead times, approvals and ` +
          `curing rather than by labour.`
        : `Searched up to ${maxCrews} crews.`),
  };
}
