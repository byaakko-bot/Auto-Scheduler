"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { GanttPayload, GanttTask } from "@/engine/ganttSerializer";
import { formatDate, formatDateShort } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type Zoom = "day" | "week" | "month";
const PX_PER_DAY: Record<Zoom, number> = { day: 26, week: 9, month: 3.2 };
const ROW_H = 34;
const HEADER_H = 52;
const LEFT_W = 380;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dayDiff(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

export function GanttChart({
  projectId,
  payload,
}: {
  projectId: string;
  payload: GanttPayload;
}) {
  const [zoom, setZoom] = useState<Zoom>("week");
  const [data, setData] = useState<GanttPayload>(payload);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [selected, setSelected] = useState<GanttTask | null>(null);
  const [newEnd, setNewEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pxPerDay = PX_PER_DAY[zoom];

  const { minDate, totalDays } = useMemo(() => {
    if (data.tasks.length === 0)
      return { minDate: new Date(), totalDays: 30 };
    const starts = data.tasks.map((t) => new Date(t.start).getTime());
    const ends = data.tasks.map((t) => new Date(t.end).getTime());
    const min = startOfDay(new Date(Math.min(...starts)));
    const max = startOfDay(new Date(Math.max(...ends)));
    return { minDate: min, totalDays: Math.max(dayDiff(min, max) + 7, 30) };
  }, [data]);

  const visibleTasks = showCriticalOnly
    ? data.tasks.filter((t) => t.isCritical)
    : data.tasks;

  const taskRowIndex = useMemo(() => {
    const m = new Map<string, number>();
    visibleTasks.forEach((t, i) => m.set(t.id, i));
    return m;
  }, [visibleTasks]);

  const timelineWidth = totalDays * pxPerDay;
  const chartHeight = visibleTasks.length * ROW_H;

  // Month label segments
  const monthSegments = useMemo(() => {
    const segs: { label: string; left: number; width: number }[] = [];
    let cursor = new Date(minDate);
    while (dayDiff(minDate, cursor) < totalDays) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const segStart = Math.max(0, dayDiff(minDate, monthStart));
      const segEnd = Math.min(totalDays, dayDiff(minDate, monthEnd));
      segs.push({
        label: cursor.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
        left: segStart * pxPerDay,
        width: (segEnd - segStart) * pxPerDay,
      });
      cursor = monthEnd;
    }
    return segs;
  }, [minDate, totalDays, pxPerDay]);

  const todayOffset = dayDiff(minDate, new Date());
  const todayLeft = todayOffset >= 0 && todayOffset <= totalDays ? todayOffset * pxPerDay : -1;

  // Dependency connectors (FS-style elbow lines)
  const links = useMemo(() => {
    return data.links
      .map((l) => {
        const srcTask = data.tasks.find((t) => t.id === l.source);
        const tgtTask = data.tasks.find((t) => t.id === l.target);
        if (!srcTask || !tgtTask) return null;
        const srcRow = taskRowIndex.get(l.source);
        const tgtRow = taskRowIndex.get(l.target);
        if (srcRow === undefined || tgtRow === undefined) return null;
        const x1 = (dayDiff(minDate, new Date(srcTask.end)) + 1) * pxPerDay;
        const y1 = srcRow * ROW_H + ROW_H / 2;
        const x2 = dayDiff(minDate, new Date(tgtTask.start)) * pxPerDay;
        const y2 = tgtRow * ROW_H + ROW_H / 2;
        return { x1, y1, x2, y2, critical: srcTask.isCritical && tgtTask.isCritical };
      })
      .filter(Boolean) as {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      critical: boolean;
    }[];
  }, [data, taskRowIndex, minDate, pxPerDay]);

  async function refetch() {
    const res = await fetch(`/api/projects/${projectId}/schedule`);
    if (res.ok) setData(await res.json());
  }

  async function applyDelay() {
    if (!selected || !newEnd) return;
    setBusy(true);
    try {
      await fetch(`/api/projects/${projectId}/tasks/${selected.id}/delay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate: new Date(newEnd).toISOString() }),
      });
      await refetch();
      setSelected(null);
      setNewEnd("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-8 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Zoom</span>
          {(["day", "week", "month"] as Zoom[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                zoom === z ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {z}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={showCriticalOnly}
            onChange={(e) => setShowCriticalOnly(e.target.checked)}
          />
          Critical path only
        </label>
      </div>

      {/* Chart */}
      <div
        ref={scrollRef}
        className="thin-scroll overflow-auto border-t border-border"
        style={{ maxHeight: "calc(100vh - 230px)" }}
      >
        <div style={{ width: LEFT_W + timelineWidth, position: "relative" }}>
          {/* Header */}
          <div
            className="sticky top-0 z-20 flex bg-white"
            style={{ height: HEADER_H }}
          >
            <div
              className="sticky left-0 z-30 flex shrink-0 items-end border-b border-r border-border bg-white px-3 pb-2"
              style={{ width: LEFT_W }}
            >
              <div className="grid w-full grid-cols-[1fr_56px_70px_70px] gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Task</span>
                <span className="text-right">Days</span>
                <span className="text-right">Start</span>
                <span className="text-right">Finish</span>
              </div>
            </div>
            <div className="relative border-b border-border" style={{ width: timelineWidth }}>
              {monthSegments.map((s, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-full items-center justify-center border-r border-border text-[11px] font-medium text-slate-500"
                  style={{ left: s.left, width: s.width }}
                >
                  {s.width > 40 ? s.label : ""}
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="relative flex">
            {/* Left WBS panel */}
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-border bg-white"
              style={{ width: LEFT_W }}
            >
              {visibleTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelected(t);
                    setNewEnd(new Date(t.end).toISOString().slice(0, 10));
                  }}
                  className="grid cursor-pointer grid-cols-[1fr_56px_70px_70px] items-center gap-1 border-b border-border px-3 text-xs hover:bg-muted"
                  style={{ height: ROW_H }}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: t.color }}
                    />
                    <span className="truncate font-medium text-slate-800">{t.name}</span>
                  </span>
                  <span className="text-right text-slate-500">
                    {t.isMilestone ? "◆" : t.durationDays}
                  </span>
                  <span className="text-right text-slate-500">{formatDateShort(t.start)}</span>
                  <span className="text-right text-slate-500">{formatDateShort(t.end)}</span>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div className="relative" style={{ width: timelineWidth, height: chartHeight }}>
              {/* Row backgrounds + weekly gridlines */}
              {visibleTasks.map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 w-full border-b border-border"
                  style={{ top: i * ROW_H, height: ROW_H }}
                />
              ))}
              {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, i) => (
                <div
                  key={`g${i}`}
                  className="absolute top-0 border-r border-slate-100"
                  style={{ left: i * 7 * pxPerDay, height: chartHeight }}
                />
              ))}

              {/* Dependency connectors */}
              <svg
                className="pointer-events-none absolute left-0 top-0"
                width={timelineWidth}
                height={chartHeight}
              >
                {links.map((l, i) => {
                  const midX = Math.max(l.x1 + 6, l.x2 - 6);
                  return (
                    <polyline
                      key={i}
                      points={`${l.x1},${l.y1} ${midX},${l.y1} ${midX},${l.y2} ${l.x2},${l.y2}`}
                      fill="none"
                      stroke={l.critical ? "#ef4444" : "#cbd5e1"}
                      strokeWidth={1}
                    />
                  );
                })}
              </svg>

              {/* Today line */}
              {todayLeft >= 0 && (
                <div
                  className="absolute top-0 z-10 border-l-2 border-dashed border-red-500"
                  style={{ left: todayLeft, height: chartHeight }}
                >
                  <span className="absolute -top-0 left-1 text-[10px] font-semibold text-red-500">
                    Today
                  </span>
                </div>
              )}

              {/* Bars */}
              {visibleTasks.map((t, i) => {
                const startOff = dayDiff(minDate, new Date(t.start));
                const left = startOff * pxPerDay;
                const widthDays = Math.max(dayDiff(new Date(t.start), new Date(t.end)) + 1, 1);
                const width = widthDays * pxPerDay;
                const top = i * ROW_H + 7;

                if (t.isMilestone) {
                  return (
                    <div
                      key={t.id}
                      title={`${t.name} — ${formatDate(t.start)}`}
                      onClick={() => setSelected(t)}
                      className="absolute z-10 cursor-pointer"
                      style={{ left: left - 7, top: top - 1 }}
                    >
                      <div className="h-3.5 w-3.5 rotate-45 bg-slate-800" />
                    </div>
                  );
                }

                return (
                  <div
                    key={t.id}
                    title={`${t.name}\n${formatDate(t.start)} → ${formatDate(t.end)}\n${t.durationDays} days · float ${t.floatDays}d`}
                    onClick={() => {
                      setSelected(t);
                      setNewEnd(new Date(t.end).toISOString().slice(0, 10));
                    }}
                    className="group absolute z-10 cursor-pointer overflow-hidden rounded"
                    style={{
                      left,
                      top,
                      width,
                      height: ROW_H - 14,
                      background: t.isCritical ? "#ef4444" : t.color,
                      opacity: 0.92,
                    }}
                  >
                    <div
                      className="h-full bg-black/20"
                      style={{ width: `${t.progressPct}%` }}
                    />
                    {width > 60 && (
                      <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-medium text-white">
                        {t.code}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Task / delay panel */}
      {selected && (
        <div className="absolute right-6 top-16 z-40 w-72 rounded-xl border border-border bg-white p-4 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">{selected.name}</p>
              <p className="text-xs text-slate-500">{selected.code} · {selected.phase}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
          <dl className="mt-3 space-y-1 text-xs text-slate-600">
            <div className="flex justify-between"><dt>Start</dt><dd>{formatDate(selected.start)}</dd></div>
            <div className="flex justify-between"><dt>Finish</dt><dd>{formatDate(selected.end)}</dd></div>
            <div className="flex justify-between"><dt>Duration</dt><dd>{selected.durationDays} days</dd></div>
            <div className="flex justify-between"><dt>Float</dt><dd>{selected.floatDays} days</dd></div>
            <div className="flex justify-between"><dt>Critical</dt><dd>{selected.isCritical ? "Yes" : "No"}</dd></div>
          </dl>
          {!selected.isMilestone && (
            <div className="mt-4 border-t border-border pt-3">
              <label className="text-xs font-medium text-slate-700">
                Simulate delay — new finish date
              </label>
              <input
                type="date"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <Button onClick={applyDelay} disabled={busy} className="mt-2 w-full" size="sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply & cascade"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
