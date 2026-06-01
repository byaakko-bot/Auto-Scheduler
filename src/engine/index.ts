import {
  buildCalendar,
  workingDayDate,
  type WorkingCalendar,
} from "./calendarEngine";
import { PHASE_ORDER, phaseColor } from "./constants";
import { buildScheduleNodes } from "./dependencyBuilder";
import { calculateTaskDurations } from "./durationCalculator";
import { projectDurationOf, solveCPM } from "./cpmSolver";
import { selectTemplate } from "./templateSelector";
import type {
  GeneratedSchedule,
  GeneratedTask,
  ProjectInputs,
} from "./types";

export * from "./types";
export { raciForPhase, DEFAULT_RACI } from "./raciAssigner";
export { phaseColor, PHASE_COLORS, METHOD_MODIFIERS } from "./constants";

function phaseRank(phase: string): number {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx === -1 ? 999 : idx;
}

// The ScheduleEngine is pure: it accepts inputs and returns a fully-dated,
// CPM-solved schedule. It performs no I/O and is fully unit-testable.
export class ScheduleEngine {
  private calendar: WorkingCalendar;

  constructor(private inputs: ProjectInputs) {
    this.calendar = buildCalendar(inputs.workingDaysPerWeek, inputs.holidays);
  }

  generate(): GeneratedSchedule {
    const template = selectTemplate(
      this.inputs.buildingType,
      this.inputs.constructionMethod
    );

    const withDurations = calculateTaskDurations(template, this.inputs);
    const nodes = buildScheduleNodes(withDurations);
    const solved = solveCPM(nodes);
    const solvedById = new Map(solved.map((n) => [n.taskId, n]));

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
        sortOrder: 0,
        color: phaseColor(t.phase),
        quantity: t.quantity,
        quantityUnit: t.quantityUnit,
        predecessors: t.predecessors,
      };
    });

    tasks.sort((a, b) => {
      const pr = phaseRank(a.phase) - phaseRank(b.phase);
      if (pr !== 0) return pr;
      return a.plannedStartDate.getTime() - b.plannedStartDate.getTime();
    });
    tasks.forEach((t, i) => (t.sortOrder = i));

    const durationWorkingDays = projectDurationOf(solved);
    const projectEndDate = tasks.reduce(
      (max, t) => (t.plannedEndDate > max ? t.plannedEndDate : max),
      start
    );
    const criticalPathCodes = tasks
      .filter((t) => t.isCritical)
      .map((t) => t.code);

    return {
      tasks,
      projectDurationWorkingDays: durationWorkingDays,
      projectEndDate,
      criticalPathCodes,
    };
  }
}

export function generateSchedule(inputs: ProjectInputs): GeneratedSchedule {
  return new ScheduleEngine(inputs).generate();
}
