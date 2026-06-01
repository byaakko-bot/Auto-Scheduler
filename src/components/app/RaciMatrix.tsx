"use client";

import { useMemo, useState } from "react";
import { RACI_COLORS, RACI_SHORT } from "@/lib/constants";
import { titleCase } from "@/lib/utils";

interface Party {
  id: string;
  name: string;
  type: string;
}
interface RaciCell {
  partyId: string | null;
  raciRole: string;
}
interface Task {
  id: string;
  code: string;
  name: string;
  phase: string;
  isMilestone: boolean;
  raci: RaciCell[];
}

const CYCLE = ["", "RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"];

export function RaciMatrix({
  projectId,
  parties,
  tasks: initialTasks,
}: {
  projectId: string;
  parties: Party[];
  tasks: Task[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [phaseFilter, setPhaseFilter] = useState<string>("ALL");

  const phases = useMemo(
    () => Array.from(new Set(initialTasks.map((t) => t.phase))),
    [initialTasks]
  );

  const visible = tasks.filter(
    (t) => !t.isMilestone && (phaseFilter === "ALL" || t.phase === phaseFilter)
  );

  function roleFor(task: Task, partyId: string): string {
    return task.raci.find((r) => r.partyId === partyId)?.raciRole ?? "";
  }

  async function cycle(task: Task, partyId: string) {
    const current = roleFor(task, partyId);
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== task.id) return t;
        const raci = t.raci.filter((r) => r.partyId !== partyId);
        if (next) raci.push({ partyId, raciRole: next });
        return { ...t, raci };
      })
    );

    await fetch(`/api/projects/${projectId}/raci`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [{ taskId: task.id, partyId, raciRole: next || null }],
      }),
    });
  }

  return (
    <div className="px-8 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Phase</span>
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="ALL">All phases</option>
            {phases.map((p) => (
              <option key={p} value={p}>
                {titleCase(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {Object.entries(RACI_SHORT).map(([role, short]) => (
            <span key={role} className="flex items-center gap-1">
              <span className={`flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${RACI_COLORS[role]}`}>
                {short}
              </span>
              {titleCase(role)}
            </span>
          ))}
          <span className="text-slate-400">· click a cell to cycle</span>
        </div>
      </div>

      <div className="thin-scroll overflow-auto rounded-xl border border-border bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="sticky left-0 z-10 min-w-[260px] bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Task
              </th>
              {parties.map((p) => (
                <th
                  key={p.id}
                  className="px-2 py-2 text-center text-[10px] font-semibold uppercase text-slate-500"
                  title={p.name}
                >
                  <div className="mx-auto w-16 truncate">{titleCase(p.type)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((t) => (
              <tr key={t.id} className="hover:bg-muted/40">
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                  <span className="text-xs font-medium text-slate-400">{t.code}</span>{" "}
                  <span className="text-slate-800">{t.name}</span>
                </td>
                {parties.map((p) => {
                  const role = roleFor(t, p.id);
                  return (
                    <td key={p.id} className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => cycle(t, p.id)}
                        className={`mx-auto flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold transition ${
                          role
                            ? RACI_COLORS[role]
                            : "bg-slate-50 text-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        {role ? RACI_SHORT[role] : "·"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-400">
          No tasks to show. Generate the schedule first.
        </p>
      )}
    </div>
  );
}
