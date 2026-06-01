import { getProjectScheduleData } from "@/lib/data";
import { serializeGantt } from "@/engine/ganttSerializer";
import { phaseColor, PHASE_COLORS } from "@/engine/constants";
import { GanttChart } from "@/components/gantt/GanttChart";
import { GenerateScheduleButton } from "@/components/app/GenerateScheduleButton";
import { titleCase } from "@/lib/utils";
import type { DependencyType } from "@/engine/types";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  params,
}: {
  params: { id: string };
}) {
  const { tasks, deps } = await getProjectScheduleData(params.id);

  if (tasks.length === 0) {
    return (
      <div className="px-8 py-16 text-center">
        <h2 className="text-lg font-semibold text-slate-900">No schedule yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Generate the work breakdown structure and Gantt for this project. The
          engine computes durations, dependencies, the critical path, and RACI
          assignments.
        </p>
        <div className="mt-6 flex justify-center">
          <GenerateScheduleButton projectId={params.id} label="Generate schedule" />
        </div>
      </div>
    );
  }

  const payload = serializeGantt(
    tasks.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      phase: t.phase,
      plannedStartDate: t.plannedStartDate,
      plannedEndDate: t.plannedEndDate,
      durationDays: t.durationDays,
      progressPct: t.progressPct,
      isCritical: t.isCritical,
      isMilestone: t.isMilestone,
      floatDays: t.floatDays,
      color: phaseColor(t.phase),
      status: t.status,
    })),
    deps.map((d) => ({
      id: d.id,
      predecessorCode: d.predecessor.code,
      successorCode: d.successor.code,
      type: d.type as DependencyType,
      lagDays: d.lagDays,
    }))
  );

  const usedPhases = Array.from(new Set(tasks.map((t) => t.phase)));

  return (
    <div>
      <div className="flex items-center justify-between px-8 pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {usedPhases.map((p) => (
            <span key={p} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: PHASE_COLORS[p] ?? "#64748b" }}
              />
              {titleCase(p)}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Critical
          </span>
        </div>
        <GenerateScheduleButton projectId={params.id} />
      </div>
      <GanttChart projectId={params.id} payload={payload} />
    </div>
  );
}
