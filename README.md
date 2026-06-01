# ConstructFlow — Construction Schedule Platform (MVP)

ConstructFlow generates realistic, dependency-aware construction schedules from a
handful of project parameters. A rules-based engine builds the work breakdown
structure, computes task durations from crew productivity and procurement lead
times, wires up FS/SS/FF dependencies, solves the **critical path** (forward +
backward pass CPM), assigns default **RACI** roles per phase, and renders an
interactive **Gantt** with live **delay propagation**.

> This is a standalone project and is fully isolated from any other project in
> the parent folder. It has its own database, environment, and dependencies.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** (strict)
- **Tailwind CSS** for styling (self-contained UI primitives)
- **Prisma** ORM + **PostgreSQL** (Supabase-ready)
- **Supabase Auth** (optional; bypassable for local dev)
- **Recharts** for the S-curve dashboard chart
- **Vitest** for the engine unit tests

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure your database. Copy the example env and edit DATABASE_URL.
cp .env.example .env
#   For Supabase use the pooled URL for DATABASE_URL and the direct (5432) URL
#   for DIRECT_URL. Any reachable Postgres works.

# 3. Create the schema and generate the client
npm run prisma:generate
npm run prisma:push

# 4. (Optional) Seed the full "Meridian Heights" demo project
npm run db:seed

# 5. Run the app
npm run dev
# → http://localhost:3000
```

Authentication is bypassed locally while `NEXT_PUBLIC_DISABLE_AUTH="true"` (the
default in `.env`). Set Supabase env vars and flip it to `false` to enable real
sign-in and `/app/*` route protection.

## Key flows

- `/` — marketing landing page
- `/app/dashboard` — portfolio overview
- `/app/projects` — project list
- `/app/projects/new` — **5-step wizard** → creates a project and runs the engine
- `/app/projects/[id]` — project dashboard (KPIs, S-curve, milestones, risks)
- `/app/projects/[id]/schedule` — **interactive Gantt** (zoom, critical path,
  today line, dependency arrows, click a bar → simulate a delay and cascade)
- `/app/projects/[id]/raci` — **RACI matrix** (click a cell to cycle R/A/C/I)

## The scheduling engine (`src/engine/`)

Pure TypeScript, no I/O, fully unit-testable:

| File | Responsibility |
|---|---|
| `index.ts` | `ScheduleEngine` orchestrator |
| `templateSelector.ts` | picks the WBS template by building type + method |
| `templates/rc_residential.ts` | the canonical RC activity network |
| `durationCalculator.ts` | duration formulas (productivity, crew, method factor) |
| `dependencyBuilder.ts` | resolves predecessor references into CPM nodes |
| `calendarEngine.ts` | working-day calendar (weekends + holidays) |
| `cpmSolver.ts` | forward/backward pass → ES, EF, LS, LF, float, critical |
| `delayPropagator.ts` | cascades a delay to downstream successors |
| `raciAssigner.ts` | default RACI map per phase |
| `ganttSerializer.ts` | tasks + links → Gantt-friendly JSON |

Run the engine tests:

```bash
npm test
```

## API routes

```
POST   /api/projects                              create project
GET    /api/projects                              list projects
GET    /api/projects/[id]                          project + counts
PATCH  /api/projects/[id]                          update settings
DELETE /api/projects/[id]                          delete
POST   /api/projects/[id]/generate-schedule        run engine, persist WBS
GET    /api/projects/[id]/schedule                 Gantt payload
PATCH  /api/projects/[id]/tasks/[taskId]           update task (progress/dates)
POST   /api/projects/[id]/tasks/[taskId]/delay     delay propagation
GET    /api/projects/[id]/raci                     RACI matrix data
PATCH  /api/projects/[id]/raci                      bulk RACI updates
GET    /api/projects/[id]/dashboard                aggregated dashboard data
```

## Notes

- Pages degrade gracefully when the database is unreachable (you'll see empty
  states rather than crashes) so you can explore the UI before wiring up a DB.
- The MVP fully models the **Reinforced Concrete residential** template. Other
  construction methods reuse the same activity network with method-specific
  speed factors applied in the duration calculator (see Appendix A).
```
