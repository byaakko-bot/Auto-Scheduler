import { notFound } from "next/navigation";
import { db } from "@/lib/prisma";
import { ProjectSettingsForm } from "@/components/app/ProjectSettingsForm";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const [project, taskCount] = await Promise.all([
    db.project.findUnique({ where: { id: params.id } }),
    db.task.count({ where: { projectId: params.id } }),
  ]);

  if (!project) notFound();

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
