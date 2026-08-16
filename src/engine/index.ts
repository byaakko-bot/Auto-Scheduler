import {
  buildCalendar,
  offsetOfDate,
  workingDayDate,
  type WorkingCalendar,
} from "./calendarEngine";
import { PHASE_ORDER, phaseColor } from "./constants";
import { buildScheduleNodes } from "./dependencyBuilder";
import { calculateTaskDurations } from "./durationCalculator";
import { solve } from "./cpmSolver";
import { selectTemplate } from "./templateSelector";
import type {
  FeasibilityReport,
  GeneratedSchedule,
  GeneratedTask,
  ProjectInputs,
} from "./types";

export * from "./types";
export { raciForPhase, DEFAULT_RACI } from "./raciAssigner";
export { phaseColor, PHASE_COLORS, METHOD_MODIFIERS } from "./constants";
export { CircularDependencyError, solve, solveCPM } from "./cpmSolver";

function phaseRank(phase: string): number {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx === -1 ? 999 : idx;
}

// The ScheduleEngine is pure: it accepts inputs and returns a fully-dated,
// CPM-solved schedule. It performs no I/O and is fully unit-testable.
export class ScheduleEngine {
  private calendar: WorkingCalendar;

  constructor(private inputs: ProjectInputs) {
    this.calendar = buildCalendar(inputs.workingDaysPerWeek, inputs.holidays, {
      workingWeek: inputs.workingWeek,
      hoursPerDay: inputs.workingHoursPerDay,
    });
  }

  generate(): GeneratedSchedule {
    const template = selectTemplate(
      this.inputs.buildingType,
      this.inputs.constructionMethod
    );

    const withDurations = calculateTaskDurations(template, this.inputs);
    const nodes = buildScheduleNodes(withDurations);

    // A target end date becomes a real CPM deadline, so activities that cannot
    // fit report negative float instead of a misleading zero.
    const deadline =
      this.inputs.targetEndDate !== undefined
        ? offsetOfDate(
            this.inputs.startDate,
            this.inputs.targetEndDate,
            this.calendar
          ) + 1
        : undefined;

    const result = solve(nodes, {
      deadline,
      nearCriticalThreshold: this.inputs.nearCriticalThreshold,
      watchThreshold: this.inputs.watchThreshold,
    });
    const solvedById = new Map(result.nodes.map((n) => [n.taskId, n]));

    const start = this.inputs.startDate;

    const tasks: GeneratedTask[] = withDurations.map((t) => {
      const node = solvedById.get(t.code)!;
      const plannedStartDate = workingDayDate(start, node.es, this.calendar);
      // Milestones are zero-duration: start == end.
      const endOffset = t.isMilestone ? node.es : Math.max(node.ef - 1, node.es);
      const plannedEndDate = workingDayDate(start, endOffset, this.calendar);

      return {
        code: t.code,
        name: t.name,
        phase: t.phase,
        durationDays: t.durationDays,
        plannedStartDate,
        plannedEndDate,
        isCritical: node.isCritical,
        isMilestone: Boolean(t.isMilestone),
        floatDays: node.float,
        freeFloatDays: node.freeFloat,
        band: node.band,
        earlyStartOffset: node.es,
        earlyFinishOffset: node.ef,
        lateStartOffset: node.ls,
        lateFinishOffset: node.lf,
        sortOrder: 0,
        color: phaseColor(t.phase),
        quantity: t.quantity,
        quantityUnit: t.quantityUnit,
        durationBasis: t.durationBasis,
        quantityDerivation: t.quantityDerivation,
        productivityCode: t.productivityCode,
        predecessors: t.predecessors,
      };
    });

    tasks.sort((a, b) => {
      const pr = phaseRank(a.phase) - phaseRank(b.phase);
      if (pr !== 0) return pr;
      return a.plannedStartDate.getTime() - b.plannedStartDate.getTime();
    });
    tasks.forEach((t, i) => (t.sortOrder = i));

    const projectEndDate = tasks.reduce(
      (max, t) => (t.plannedEndDate > max ? t.plannedEndDate : max),
      start
    );

    const feasibility: FeasibilityReport = {
      targetEndDate: this.inputs.targetEndDate,
      requiredWorkingDays: result.projectDuration,
      availableWorkingDays: deadline,
      gapWorkingDays:
        deadline === undefined
          ? 0
          : Math.max(0, result.projectDuration - deadline),
      isFeasible: result.isFeasible,
    };

    return {
      tasks,
      projectDurationWorkingDays: result.projectDuration,
      projectEndDate,
      criticalPathCodes: tasks.filter((t) => t.isCritical).map((t) => t.code),
      criticalPaths: result.criticalPaths,
      feasibility,
    };
  }
}

export function generateSchedule(inputs: ProjectInputs): GeneratedSchedule {
  return new ScheduleEngine(inputs).generate();
}
