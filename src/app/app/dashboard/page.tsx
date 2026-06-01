import Link from "next/link";
import { ArrowRight, Building2, FolderKanban, ListChecks, ShieldAlert } from "lucide-react";
import { getProjects } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const projects = await getProjects();
  const totalTasks = projects.reduce((s, p) => s + p._count.tasks, 0);
  const totalRisks = projects.reduce((s, p) => s + p._count.risks, 0);
  const active = projects.filter((p) => p.status === "ACTIVE").length;

  const kpis = [
    { label: "Projects", value: projects.length, icon: FolderKanban, tone: "text-blue-600 bg-blue-50" },
    { label: "Active", value: active, icon: Building2, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Scheduled tasks", value: totalTasks, icon: ListChecks, tone: "text-violet-600 bg-violet-50" },
    { label: "Open risks", value: totalRisks, icon: ShieldAlert, tone: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-sm text-slate-500">Portfolio overview across all projects</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${k.tone}`}>
                <k.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{k.value}</p>
                <p className="text-xs text-slate-500">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Recent projects</h2>
      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            No projects yet.{" "}
            <Link href="/app/projects/new" className="font-medium text-blue-600">
              Create your first project
            </Link>{" "}
            to generate a schedule. If you expected seeded data, run{" "}
            <code className="rounded bg-slate-100 px-1">npm run db:seed</code>.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Tasks</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link href={`/app/projects/${p.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                      {p.name}
                    </Link>
                    <div className="text-xs text-slate-400">{p.code}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.city}, {p.country}</td>
                  <td className="px-4 py-3 text-slate-600">{titleCase(p.constructionMethod)}</td>
                  <td className="px-4 py-3 text-slate-600">{p._count.tasks}</td>
                  <td className="px-4 py-3">
                    <Badge className="bg-blue-50 text-blue-700">{titleCase(p.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/app/projects/${p.id}/schedule`} className="inline-flex items-center text-blue-600">
                      Schedule <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
