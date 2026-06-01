import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Settings, Users, FileStack } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const sections = [
    { icon: Users, title: "Users & roles", body: "Invite team members and assign roles (Owner, Admin, PM, Site Manager, Viewer)." },
    { icon: FileStack, title: "Schedule templates", body: "Manage method templates and default productivity rates per construction method." },
    { icon: Settings, title: "Company settings", body: "Company profile, currency, working calendar and public holidays." },
  ];
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
      <p className="text-sm text-slate-500">Workspace configuration</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <s.icon className="h-4 w-4" />
              </div>
              <CardTitle>{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500">{s.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
