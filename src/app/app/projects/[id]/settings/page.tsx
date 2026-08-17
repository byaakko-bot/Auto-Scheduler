import { notFound } from "next/navigation";
import { db } from "@/lib/prisma";
import { AuthError, requireProject } from "@/lib/auth/session";
import { ProjectSettingsForm } from "@/components/app/ProjectSettingsForm";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  // Settings change the programme, so reading them is gated at the same level
  // as changing them.
  let project;
  try {
    ({ project } = await requireProject(params.id, "PROJECT_MANAGER"));
  } catch (err) {
    if (err instanceof AuthError) notFound();
    throw err;
  }

  const taskCount = await db.task.count({ where: { projectId: project.id } });

  return (
    <div className="px-8 py-6">
      <ProjectSettingsForm
        projectId={project.id}
        taskCount={taskCount}
        initial={{
          name: project.name,
          clientName: project.clientName ?? "",
          country: project.country,
          city: project.city,
          buildingType: project.buildingType,
          constructionMethod: project.constructionMethod,
          totalAreaSqm: project.totalAreaSqm,
          numberOfFloors: project.numberOfFloors,
          numberOfUnits: project.numberOfUnits ?? 0,
          numberOfBasements: project.numberOfBasements,
          startDate: project.startDate.toISOString().slice(0, 10),
          targetEndDate: project.targetEndDate
            ? project.targetEndDate.toISOString().slice(0, 10)
            : "",
          workingDaysPerWeek: project.workingDaysPerWeek,
          workingHoursPerDay: project.workingHoursPerDay,
          currency: project.currency,
          designComplete: project.designComplete,
          permitsObtained: project.permitsObtained,
          procurementPlaced: project.procurementPlaced,
        }}
      />
    </div>
  );
}
