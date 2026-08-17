"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  BUILDING_TYPE_VALUES,
  CONSTRUCTION_METHOD_VALUES,
} from "@/lib/validation";
import { titleCase } from "@/lib/utils";

export interface ProjectSettings {
  name: string;
  clientName: string;
  country: string;
  city: string;
  buildingType: string;
  constructionMethod: string;
  totalAreaSqm: number;
  numberOfFloors: number;
  numberOfUnits: number;
  numberOfBasements: number;
  startDate: string;
  targetEndDate: string;
  workingDaysPerWeek: number;
  workingHoursPerDay: number;
  currency: string;
  designComplete: boolean;
  permitsObtained: boolean;
  procurementPlaced: boolean;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

interface FitInfo {
  achieved: boolean;
  crewsRequired: number;
  residualGapDays: number;
  explanation: string;
}

export function ProjectSettingsForm({
  projectId,
  initial,
  taskCount,
}: {
  projectId: string;
  initial: ProjectSettings;
  taskCount: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProjectSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState<string[]>([]);
  const [fit, setFit] = useState<FitInfo | null>(null);

  const set = <K extends keyof ProjectSettings>(
    key: K,
    value: ProjectSettings[K]
  ) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const dateInvalid =
    Boolean(form.targetEndDate) && form.targetEndDate <= form.startDate;

  async function save() {
    setSaving(true);
    setError(null);
    setFit(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          clientName: form.clientName || null,
          country: form.country,
          city: form.city,
          buildingType: form.buildingType,
          constructionMethod: form.constructionMethod,
          totalAreaSqm: Number(form.totalAreaSqm),
          numberOfFloors: Number(form.numberOfFloors),
          numberOfUnits: Number(form.numberOfUnits),
          numberOfBasements: Number(form.numberOfBasements),
          startDate: form.startDate,
          targetEndDate: form.targetEndDate || null,
          workingDaysPerWeek: Number(form.workingDaysPerWeek),
          workingHoursPerDay: Number(form.workingHoursPerDay),
          currency: form.currency,
          designComplete: form.designComplete,
          permitsObtained: form.permitsObtained,
          procurementPlaced: form.procurementPlaced,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save");

      setSaved(true);
      setStale(json.scheduleStale ? json.staleBecause ?? [] : []);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true, fitToTarget: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to regenerate");

      setStale([]);
      if (json.fit?.requested) setFit(json.fit);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Project name</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Client</label>
            <input
              className={inputCls}
              value={form.clientName}
              onChange={(e) => set("clientName", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Country</label>
            <input
              className={inputCls}
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input
              className={inputCls}
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Building &amp; method</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Building type</label>
            <select
              className={inputCls}
              value={form.buildingType}
              onChange={(e) => set("buildingType", e.target.value)}
            >
              {BUILDING_TYPE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {titleCase(v)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Construction method</label>
            <select
              className={inputCls}
              value={form.constructionMethod}
              onChange={(e) => set("constructionMethod", e.target.value)}
            >
              {CONSTRUCTION_METHOD_VALUES.map((v) => (
                <option key={v} value={v}>
                  {titleCase(v)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Gross floor area (m²)</label>
            <input
              type="number"
              className={inputCls}
              value={form.totalAreaSqm}
              onChange={(e) => set("totalAreaSqm", Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelCls}>Floors</label>
            <input
              type="number"
              className={inputCls}
              value={form.numberOfFloors}
              onChange={(e) => set("numberOfFloors", Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelCls}>Units</label>
            <input
              type="number"
              className={inputCls}
              value={form.numberOfUnits}
              onChange={(e) => set("numberOfUnits", Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelCls}>Basements</label>
            <input
              type="number"
              className={inputCls}
              value={form.numberOfBasements}
              onChange={(e) => set("numberOfBasements", Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Programme</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Start date</label>
            <input
              type="date"
              className={inputCls}
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Target completion</label>
            <input
              type="date"
              className={inputCls}
              value={form.targetEndDate}
              onChange={(e) => set("targetEndDate", e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              The schedule is resourced to fit this date. Durations are never
              shortened to meet it — if it cannot be met, you will be told by
              how much.
            </p>
          </div>
          <div>
            <label className={labelCls}>Working days per week</label>
            <input
              type="number"
              min={1}
              max={7}
              className={inputCls}
              value={form.workingDaysPerWeek}
              onChange={(e) =>
                set("workingDaysPerWeek", Number(e.target.value))
              }
            />
          </div>
          <div>
            <label className={labelCls}>Working hours per day</label>
            <input
              type="number"
              min={1}
              max={24}
              className={inputCls}
              value={form.workingHoursPerDay}
              onChange={(e) =>
                set("workingHoursPerDay", Number(e.target.value))
              }
            />
          </div>
          {dateInvalid && (
            <p className="sm:col-span-2 text-sm text-red-600">
              Target completion must be after the start date.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Already complete before start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500">
            Tick anything finished before the programme begins. Those activities
            stay in the WBS for the record but consume no time, so the schedule
            starts with the first work that has not already happened.
          </p>
          {(
            [
              ["designComplete", "Design complete", "Concept, structural, MEP and interior design signed off."],
              ["permitsObtained", "Permits obtained", "Planning consent and building permit already granted."],
              ["procurementPlaced", "Procurement placed", "Long-lead orders already committed with suppliers."],
            ] as const
          ).map(([key, label, hint]) => (
            <label key={key} className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                checked={form[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  {label}
                </span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {stale.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Schedule out of date</p>
              <p className="mt-1">
                You changed {stale.join(", ")}. The {taskCount} stored
                activities were built from the previous values.
              </p>
              <Button
                className="mt-3"
                onClick={regenerate}
                disabled={regenerating}
              >
                {regenerating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Regenerate schedule
              </Button>
            </div>
          </div>
        </div>
      )}

      {fit && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            fit.achieved
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <p className="font-medium">
            {fit.achieved
              ? `Target met with ${fit.crewsRequired} crew(s)`
              : `Target missed by ${fit.residualGapDays} working days`}
          </p>
          <p className="mt-1">{fit.explanation}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || dateInvalid}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
        {saved && stale.length === 0 && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
