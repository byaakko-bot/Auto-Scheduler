import { fail, handleError, ok } from "@/lib/api";
import { loadNetwork } from "@/lib/schedule";
import { offsetOfDate } from "@/engine/calendarEngine";
import { bindingFor } from "@/engine/activityRates";
import { buildRateLookup } from "@/engine/productivity";
import { cycleFloorDays } from "@/engine/constants";
import { generateRecoveryPlan, type ScalableActivity } from "@/engine/recovery";
import type { ConstructionMethod } from "@/engine/types";

export const dynamic = "force-dynamic";

/**
 * §22/§41 — recovery options for a project running late.
 *
 * Every option is measured by re-solving the real network, so an option that
 * shortens a critical activity but merely hands criticality to another chain
 * reports the recovery it actually delivers, not the duration it removes.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const loaded = await loadNetwork(params.id);
    if (!loaded) return fail("Project not found", 404);
    const { project, nodes, calendar, tasks } = loaded;

    if (tasks.length === 0) {
      return fail("Generate a schedule before requesting recovery options", 422);
    }

    const url = new URL(req.url);
    const crewCostPerDay = url.searchParams.get("crewCostPerDay")
      ? Number(url.searchParams.get("crewCostPerDay"))
      : undefined;

    const deadline =
      offsetOfDate(project.startDate, project.targetEndDate, calendar) + 1;

    const lookup = buildRateLookup();
    const scalable = new Map<string, ScalableActivity>();

    for (const t of tasks) {
      if (!t.quantity || t.quantity <= 0 || t.durationDays <= 0) continue;

      const binding = bindingFor(
        t.code,
        project.constructionMethod as ConstructionMethod,
        project.buildingType
      );
      if (!binding) continue;

      const rate = lookup(binding.rateCode);
      if (!rate) continue;

      // Crews are recovered from the stored quantity and duration, which is
      // exact because duration = ceil(quantity / (output x crews)).
      const crews = Math.max(
        1,
        Math.round(t.quantity / (rate.outputPerDay * t.durationDays))
      );

      scalable.set(t.code, {
        crews,
        quantity: t.quantity,
        outputPerCrewDay: rate.outputPerDay,
        rateCode: rate.code,
        // Cycle-governed work cannot be compressed by labour, so recovery must
        // not offer savings the generator would refuse to produce.
        minDays: cycleFloorDays(
          t.code,
          project.constructionMethod as ConstructionMethod,
          project.numberOfFloors
        ),
      });
    }

    const input = {
      nodes,
      scalable,
      deadline,
      nearCriticalThreshold: project.nearCriticalThresholdDays,
      watchThreshold: project.watchThresholdDays,
      crewCostPerDay,
      currency: project.currency,
    };

    // Solve once to learn the shortfall, then generate options against it.
    const probe = generateRecoveryPlan({ ...input, scalable: new Map() });
    const shortfall = Math.max(0, probe.baselineDurationDays - deadline);

    const withTarget = generateRecoveryPlan(
      input,
      shortfall > 0 ? shortfall : undefined
    );

    const nameOf = new Map(tasks.map((t) => [t.code, t.name]));

    return ok({
      situation: {
        forecastDurationWorkingDays: withTarget.baselineDurationDays,
        availableWorkingDays: deadline,
        shortfallWorkingDays: shortfall,
        contractFinishDate: project.targetEndDate,
      },
      quantityDrivenActivities: scalable.size,
      options: withTarget.options.map((o) => ({
        ...o,
        targetActivityNames: o.targetActivities.map(
          (c) => nameOf.get(c) ?? c
        ),
      })),
      bestOption: withTarget.bestOption
        ? {
            id: withTarget.bestOption.id,
            title: withTarget.bestOption.title,
            recoveryDays: withTarget.bestOption.recoveryDays,
          }
        : null,
      requiresCombination: withTarget.requiresCombination,
      // The honest headline: whether any single lever closes the gap.
      summary:
        shortfall === 0
          ? "Project is forecast to meet its contract date; no recovery required."
          : withTarget.options.length === 0
          ? `${shortfall} working day(s) short, and no single lever recovers time on the current network.`
          : withTarget.requiresCombination
          ? `${shortfall} working day(s) short. The best single option recovers ${withTarget.bestOption?.recoveryDays ?? 0}; a combination is required.`
          : `${shortfall} working day(s) short, recoverable by a single option.`,
      notes: withTarget.notes,
    });
  } catch (err) {
    return handleError(err);
  }
}
