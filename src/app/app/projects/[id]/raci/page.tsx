import { getRaciData } from "@/lib/data";
import { RaciMatrix } from "@/components/app/RaciMatrix";

export const dynamic = "force-dynamic";

export default async function RaciPage({
  params,
}: {
  params: { id: string };
}) {
  const { parties, tasks } = await getRaciData(params.id);

  if (tasks.length === 0 || parties.length === 0) {
    return (
      <div className="px-8 py-16 text-center text-sm text-slate-500">
        No RACI data yet. Generate the schedule on the Schedule tab to create
        tasks and default responsibility assignments.
      </div>
    );
  }

  return <RaciMatrix projectId={params.id} parties={parties} tasks={tasks} />;
}
