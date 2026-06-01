import type { DependencyType } from "./types";

export interface GanttTask {
  id: string;
  code: string;
  name: string;
  phase: string;
  start: string; // ISO date
  end: string; // ISO date
  durationDays: number;
  progressPct: number;
  isCritical: boolean;
  isMilestone: boolean;
  floatDays: number;
  color: string;
  status?: string;
}

export interface GanttLink {
  id: string;
  source: string;
  target: string;
  type: DependencyType;
  lag: number;
}

export interface GanttPayload {
  tasks: GanttTask[];
  links: GanttLink[];
  projectStart: string;
  projectEnd: string;
}

interface SerializableTask {
  id: string;
  code: string;
  name: string;
  phase: string;
  plannedStartDate: Date | string;
  plannedEndDate: Date | string;
  durationDays: number;
  progressPct?: number;
  isCritical: boolean;
  isMilestone: boolean;
  floatDays: number;
  color?: string;
  status?: string;
}

interface SerializableDependency {
  id: string;
  predecessorCode: string;
  successorCode: string;
  type: DependencyType;
  lagDays: number;
}

function iso(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString();
}

export function serializeGantt(
  tasks: SerializableTask[],
  deps: SerializableDependency[]
): GanttPayload {
  const codeToId = new Map(tasks.map((t) => [t.code, t.id]));

  const ganttTasks: GanttTask[] = tasks.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    phase: t.phase,
    start: iso(t.plannedStartDate),
    end: iso(t.plannedEndDate),
    durationDays: t.durationDays,
    progressPct: t.progressPct ?? 0,
    isCritical: t.isCritical,
    isMilestone: t.isMilestone,
    floatDays: t.floatDays,
    color: t.color ?? "#64748B",
    status: t.status,
  }));

  const links: GanttLink[] = deps
    .map((d, i) => {
      const source = codeToId.get(d.predecessorCode);
      const target = codeToId.get(d.successorCode);
      if (!source || !target) return null;
      return {
        id: d.id || `link-${i}`,
        source,
        target,
        type: d.type,
        lag: d.lagDays,
      };
    })
    .filter((l): l is GanttLink => l !== null);

  const starts = ganttTasks.map((t) => new Date(t.start).getTime());
  const ends = ganttTasks.map((t) => new Date(t.end).getTime());
  const projectStart = new Date(Math.min(...starts)).toISOString();
  const projectEnd = new Date(Math.max(...ends)).toISOString();

  return { tasks: ganttTasks, links, projectStart, projectEnd };
}
