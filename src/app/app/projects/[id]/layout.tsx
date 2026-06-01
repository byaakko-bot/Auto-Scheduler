import Link from "next/link";
import { ChevronLeft, MapPin } from "lucide-react";
import { getProject } from "@/lib/data";
import { ProjectTabs } from "@/components/app/ProjectTabs";
import { Badge } from "@/components/ui/Badge";
import { titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const project = await getProject(params.id);

  return (
    <div>
      <div className="px-8 pt-6">
        <Link
          href="/app/projects"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" /> All projects
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {project?.name ?? "Project"}
            </h1>
            {project && (
              <p className="mt-0.5 flex items-center gap-2 text-sm text-slate-500">
                <span className="font-medium">{project.code}</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {project.city}, {project.country}
                </span>
                <Badge className="bg-blue-50 text-blue-700">
                  {titleCase(project.constructionMethod)}
                </Badge>
              </p>
            )}
          </div>
          {project && (
            <Badge className="bg-slate-100 text-slate-600">
              {titleCase(project.status)}
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-4">
        <ProjectTabs projectId={params.id} />
      </div>
      {children}
    </div>
  );
}
