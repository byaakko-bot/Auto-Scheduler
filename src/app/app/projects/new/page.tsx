"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  BUILDING_TYPES,
  CONSTRUCTION_METHODS,
  CURRENCIES,
} from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { DEFAULT_PRODUCTIVITY } from "@/engine/constants";

const STEPS = [
  "Identity",
  "Location & Type",
  "Scale & Scope",
  "Programme",
  "Productivity",
];

interface FormState {
  name: string;
  code: string;
  clientName: string;
  currency: string;
  country: string;
  city: string;
  address: string;
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
  crewSize: number;
  permitWeeks: number;
  productivityRates: typeof DEFAULT_PRODUCTIVITY;
}

const initial: FormState = {
  name: "",
  code: "",
  clientName: "",
  currency: "USD",
  country: "",
  city: "",
  address: "",
  buildingType: "RESIDENTIAL_APARTMENT",
  constructionMethod: "REINFORCED_CONCRETE",
  totalAreaSqm: 3600,
  numberOfFloors: 6,
  numberOfUnits: 36,
  numberOfBasements: 1,
  startDate: new Date().toISOString().slice(0, 10),
  targetEndDate: "",
  workingDaysPerWeek: 6,
  workingHoursPerDay: 8,
  crewSize: 20,
  permitWeeks: 6,
  productivityRates: { ...DEFAULT_PRODUCTIVITY },
};

function codeFromName(name: string): string {
  return (
    name
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.slice(0, 3))
      .join("-") + "-001"
  );
}

export default function NewProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initial);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canNext = () => {
    if (step === 1) return form.name.length >= 2 && form.code.length >= 2;
    if (step === 2) return form.country.length >= 2 && form.city.length >= 1;
    if (step === 3) return form.totalAreaSqm > 0 && form.numberOfFloors > 0;
    if (step === 4) return Boolean(form.startDate);
    return true;
  };

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      setStatusMsg("Creating project…");
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          clientName: form.clientName || null,
          currency: form.currency,
          country: form.country,
          city: form.city,
          address: form.address || null,
          buildingType: form.buildingType,
          constructionMethod: form.constructionMethod,
          totalAreaSqm: Number(form.totalAreaSqm),
          numberOfFloors: Number(form.numberOfFloors),
          numberOfUnits: Number(form.numberOfUnits) || null,
          numberOfBasements: Number(form.numberOfBasements) || 0,
          startDate: form.startDate,
          targetEndDate: form.targetEndDate || null,
          workingDaysPerWeek: Number(form.workingDaysPerWeek),
          workingHoursPerDay: Number(form.workingHoursPerDay),
          crewSize: Number(form.crewSize),
          permitWeeks: Number(form.permitWeeks) || null,
          productivityRates: form.productivityRates,
        }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error || "Failed to create project");

      setStatusMsg("Running the scheduling engine…");
      const gen = await fetch(
        `/api/projects/${created.id}/generate-schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            crewSize: Number(form.crewSize),
            permitWeeks: Number(form.permitWeeks) || undefined,
            productivityRates: form.productivityRates,
          }),
        }
      );
      const genResult = await gen.json();
      if (!gen.ok)
        throw new Error(genResult.error || "Failed to generate schedule");

      setStatusMsg("Schedule ready — redirecting…");
      router.push(`/app/projects/${created.id}/schedule`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-2xl font-bold tracking-tight">New project</h1>
      <p className="text-sm text-slate-500">
        The scheduling engine will generate a full WBS and Gantt on submit.
      </p>

      {/* Stepper */}
      <div className="mt-6 flex items-center justify-between">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <div key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold",
                    done && "border-blue-600 bg-blue-600 text-white",
                    active && "border-blue-600 text-blue-600",
                    !done && !active && "border-slate-300 text-slate-400"
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : n}
                </div>
                <span
                  className={cn(
                    "mt-1 hidden text-xs sm:block",
                    active ? "font-medium text-slate-900" : "text-slate-400"
                  )}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-0.5 flex-1",
                    n < step ? "bg-blue-600" : "bg-slate-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-white p-6 shadow-sm">
        {step === 1 && (
          <div className="space-y-4">
            <Field label="Project name">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => {
                  set("name", e.target.value);
                  if (!form.code || form.code === codeFromName(form.name))
                    set("code", codeFromName(e.target.value));
                }}
                placeholder="Meridian Heights"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Project code">
                <input
                  className={inputCls}
                  value={form.code}
                  onChange={(e) => set("code", e.target.value)}
                  placeholder="MDH-001"
                />
              </Field>
              <Field label="Currency">
                <select
                  className={inputCls}
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Client name (optional)">
              <input
                className={inputCls}
                value={form.clientName}
                onChange={(e) => set("clientName", e.target.value)}
                placeholder="Meridian Development Group"
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Country">
                <input className={inputCls} value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="UAE" />
              </Field>
              <Field label="City">
                <input className={inputCls} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Dubai" />
              </Field>
            </div>
            <Field label="Address (optional)">
              <input className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Building type</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BUILDING_TYPES.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => set("buildingType", b.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition",
                      form.buildingType === b.value
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <Building2 className="mb-1 h-4 w-4" />
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Construction method</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CONSTRUCTION_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => set("constructionMethod", m.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition",
                      form.constructionMethod === m.value
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <span className="block text-sm font-medium text-slate-900">{m.label}</span>
                    <span className="text-xs text-slate-500">{m.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Total GFA (sqm)">
              <input type="number" className={inputCls} value={form.totalAreaSqm} onChange={(e) => set("totalAreaSqm", Number(e.target.value))} />
            </Field>
            <Field label="Floors above ground">
              <input type="number" className={inputCls} value={form.numberOfFloors} onChange={(e) => set("numberOfFloors", Number(e.target.value))} />
            </Field>
            <Field label="Basement levels">
              <input type="number" className={inputCls} value={form.numberOfBasements} onChange={(e) => set("numberOfBasements", Number(e.target.value))} />
            </Field>
            <Field label="Number of units">
              <input type="number" className={inputCls} value={form.numberOfUnits} onChange={(e) => set("numberOfUnits", Number(e.target.value))} />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date">
              <input type="date" className={inputCls} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <Field label="Target completion (optional)">
              <input type="date" className={inputCls} value={form.targetEndDate} onChange={(e) => set("targetEndDate", e.target.value)} />
            </Field>
            <Field label="Working days / week">
              <select className={inputCls} value={form.workingDaysPerWeek} onChange={(e) => set("workingDaysPerWeek", Number(e.target.value))}>
                <option value={5}>5 (Mon–Fri)</option>
                <option value={6}>6 (Mon–Sat)</option>
                <option value={7}>7</option>
              </select>
            </Field>
            <Field label="Working hours / day">
              <input type="number" className={inputCls} value={form.workingHoursPerDay} onChange={(e) => set("workingHoursPerDay", Number(e.target.value))} />
            </Field>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Crew size (main discipline)">
                <input type="number" className={inputCls} value={form.crewSize} onChange={(e) => set("crewSize", Number(e.target.value))} />
              </Field>
              <Field label="Permitting (weeks)">
                <input type="number" className={inputCls} value={form.permitWeeks} onChange={(e) => set("permitWeeks", Number(e.target.value))} />
              </Field>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="text-sm font-medium text-blue-600"
            >
              {showAdvanced ? "Hide" : "Show"} advanced productivity rates
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                {(
                  [
                    ["foundationM3PerDay", "Foundation m³/day"],
                    ["structureFloorDays", "Structure days/floor"],
                    ["masonryM2PerDay", "Masonry m²/day"],
                    ["plasteringM2PerDay", "Plastering m²/day"],
                    ["flooringM2PerDay", "Flooring m²/day"],
                    ["mepRoughInDaysPerFloor", "MEP rough-in days/floor"],
                    ["paintingM2PerDay", "Painting m²/day"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      type="number"
                      className={inputCls}
                      value={form.productivityRates[key]}
                      onChange={(e) =>
                        set("productivityRates", {
                          ...form.productivityRates,
                          [key]: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            )}

            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
              On submit, Buildora generates the full work breakdown
              structure, computes the critical path, and assigns default RACI
              roles to every phase.
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || submitting}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < 5 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {statusMsg}
                </>
              ) : (
                "Generate schedule"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
