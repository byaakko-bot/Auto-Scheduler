import Link from "next/link";
import { ArrowRight, Building2, MapPin, PlusCircle } from "lucide-react";
import { getProjects } from "@/lib/data";
import { Badge } from "@/components/ui/Badge";
import { titleCase, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-slate-500">
            {projects.length} project{projects.length === 1 ? "" : "s"} in your
            workspace
          </p>
        </div>
        <Link
          href="/app/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <PlusCircle className="h-4 w-4" /> New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            No projects yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Create your first project and the scheduling engine will generate a
            full WBS and Gantt automatically. (If you expected data here, run the
            database seed — see the README.)
          </p>
          <Link
            href="/app/projects/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <PlusCircle className="h-4 w-4" /> Create project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/app/projects/${p.id}`}
              className="group rounded-xl border border-border bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <Badge className="bg-slate-100 text-slate-600">{p.code}</Badge>
                <Badge className="bg-blue-50 text-blue-700">
                  {titleCase(p.status)}
                </Badge>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900 group-hover:text-blue-700">
                {p.name}
              </h3>
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                <MapPin className="h-3.5 w-3.5" /> {p.city}, {p.country}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div>
                  <span className="block font-medium text-slate-900">
                    {titleCase(p.buildingType)}
                  </span>
                  {titleCase(p.constructionMethod)}
                </div>
                <div className="text-right">
                  <span className="block font-medium text-slate-900">
                    {p._count.tasks} tasks
                  </span>
                  Start {formatDate(p.startDate)}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-end text-sm font-medium text-blue-600">
                Open <ArrowRight className="ml-1 h-4 w-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
