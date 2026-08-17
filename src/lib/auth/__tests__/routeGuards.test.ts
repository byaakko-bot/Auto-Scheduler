// Static audit of the API surface.
//
// The hole this closes was not a subtle logic error — it was seventeen route
// handlers that simply never asked who was calling. A behavioural test only
// covers the routes someone remembered to write a test for, so this walks the
// filesystem instead: every exported handler must resolve identity before it
// touches the database, and a route added later fails this test by default.

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const API_ROOT = join(process.cwd(), "src/app/api");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const GUARDS = ["requireProject(", "requireCompany(", "requireRole(", "requireUser("];
const HANDLER = /export async function (GET|POST|PATCH|PUT|DELETE)\s*\(/g;

interface Handler {
  file: string;
  method: string;
  body: string;
}

function handlers(): Handler[] {
  return routeFiles(API_ROOT).flatMap((file) => {
    const src = readFileSync(file, "utf8");
    const rel = file.slice(process.cwd().length + 1);
    const starts: { method: string; at: number }[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(HANDLER.source, "g");
    while ((m = re.exec(src)) !== null) {
      starts.push({ method: m[1], at: m.index });
    }
    return starts.map((s, i) => ({
      file: rel,
      method: s.method,
      body: src.slice(s.at, starts[i + 1]?.at ?? src.length),
    }));
  });
}

describe("every API route is guarded", () => {
  const all = handlers();

  it("finds the API surface", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it.each(all.map((h) => [`${h.method} ${h.file}`, h] as const))(
    "%s resolves the caller",
    (_label, handler) => {
      const guarded = GUARDS.some((g) => handler.body.includes(g));
      expect(guarded).toBe(true);
    }
  );

  it.each(all.map((h) => [`${h.method} ${h.file}`, h] as const))(
    "%s guards before it queries",
    (_label, handler) => {
      const guardAt = Math.min(
        ...GUARDS.map((g) => {
          const i = handler.body.indexOf(g);
          return i === -1 ? Number.MAX_SAFE_INTEGER : i;
        })
      );
      const queryAt = handler.body.search(/\bdb\.\w+\.\w+\(/);
      if (queryAt === -1) return; // handler touches no tables
      expect(guardAt).toBeLessThan(queryAt);
    }
  );

  it("requires more than VIEWER for anything that mutates", () => {
    const offenders = all
      .filter((h) => h.method !== "GET")
      .filter((h) => /require\w+\([^)]*"VIEWER"/.test(h.body))
      .map((h) => `${h.method} ${h.file}`);
    expect(offenders).toEqual([]);
  });

  it("never trusts a companyId supplied by the caller", () => {
    const offenders = all
      .filter((h) => /companyId:\s*(body|input|req)\./.test(h.body))
      .map((h) => `${h.method} ${h.file}`);
    expect(offenders).toEqual([]);
  });
});

describe("the old fail-open helpers are gone", () => {
  it("no longer reads NEXT_PUBLIC_DISABLE_AUTH anywhere", () => {
    const hits = routeFiles(join(process.cwd(), "src"))
      .concat(sourceFiles(join(process.cwd(), "src")))
      .filter((f) => readFileSync(f, "utf8").includes("NEXT_PUBLIC_DISABLE_AUTH"));
    expect(hits).toEqual([]);
  });

  it("no longer attaches new work to whichever company happens to be first", () => {
    const hits = sourceFiles(join(process.cwd(), "src")).filter((f) =>
      readFileSync(f, "utf8").includes("getOrCreateDefaultCompany")
    );
    expect(hits).toEqual([]);
  });
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !full.includes("__tests__")) out.push(full);
  }
  return out;
}
