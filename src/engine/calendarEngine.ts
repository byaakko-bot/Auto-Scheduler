// Working-day calendar utilities. Pure functions, no side effects.
//
// A calendar is a 7-slot working-week mask plus exception days, so it can model
// Mon–Fri, Mon–Sat, 4-day weeks, night shifts on Sunday, or any custom pattern.
// Exceptions cut both ways: a non-working exception (holiday, shutdown) and a
// working exception (a recovery Saturday) are both expressible.

export interface CalendarException {
  date: Date;
  working: boolean; // false = holiday/shutdown, true = extra working day
  name?: string;
}

export interface WorkingCalendar {
  id: string;
  name: string;
  /** Index 0 = Sunday … 6 = Saturday. true = normally a working day. */
  workingWeek: boolean[];
  hoursPerDay: number;
  /** ISO yyyy-mm-dd → working flag. Overrides workingWeek. */
  exceptions: Map<string, boolean>;
}

export function isoKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Expands a days-per-week count into a concrete week mask, Mon-first. */
export function weekFromDaysPerWeek(daysPerWeek: number): boolean[] {
  const n = Math.min(Math.max(Math.round(daysPerWeek), 1), 7);
  // Order of allocation: Mon, Tue, Wed, Thu, Fri, Sat, Sun
  const order = [1, 2, 3, 4, 5, 6, 0];
  const week = [false, false, false, false, false, false, false];
  for (let i = 0; i < n; i++) week[order[i]] = true;
  return week;
}

export function buildCalendar(
  workingDaysPerWeek: number,
  holidays: Date[] = [],
  options: {
    id?: string;
    name?: string;
    hoursPerDay?: number;
    workingWeek?: boolean[];
    exceptions?: CalendarException[];
  } = {}
): WorkingCalendar {
  const exceptions = new Map<string, boolean>();
  for (const h of holidays) exceptions.set(isoKey(h), false);
  for (const e of options.exceptions ?? []) {
    exceptions.set(isoKey(e.date), e.working);
  }

  return {
    id: options.id ?? "default",
    name: options.name ?? "Project calendar",
    workingWeek: options.workingWeek ?? weekFromDaysPerWeek(workingDaysPerWeek),
    hoursPerDay: options.hoursPerDay ?? 8,
    exceptions,
  };
}

// Treats all dates in UTC to avoid timezone drift.
function addCalendarDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function isWorkingDay(d: Date, cal: WorkingCalendar): boolean {
  const override = cal.exceptions.get(isoKey(d));
  if (override !== undefined) return override;
  return cal.workingWeek[d.getUTCDay()] === true;
}

/** True when the calendar has no working days at all — guards infinite loops. */
function hasAnyWorkingDay(cal: WorkingCalendar): boolean {
  return cal.workingWeek.some(Boolean) || [...cal.exceptions.values()].some(Boolean);
}

// Returns the first working day on or after the given date.
export function nextWorkingDay(d: Date, cal: WorkingCalendar): Date {
  if (!hasAnyWorkingDay(cal)) return new Date(d.getTime());
  let cur = new Date(d.getTime());
  let guard = 0;
  while (!isWorkingDay(cur, cal) && guard < 3650) {
    cur = addCalendarDays(cur, 1);
    guard++;
  }
  return cur;
}

// Returns the calendar date that is `offset` working days after `start`.
// offset 0 => the first working day on/after start.
export function workingDayDate(
  start: Date,
  offset: number,
  cal: WorkingCalendar
): Date {
  if (!hasAnyWorkingDay(cal)) return new Date(start.getTime());
  let cur = nextWorkingDay(start, cal);
  let remaining = offset;
  let guard = 0;
  while (remaining > 0 && guard < 100000) {
    cur = addCalendarDays(cur, 1);
    if (isWorkingDay(cur, cal)) remaining--;
    guard++;
  }
  return cur;
}

// Adds `n` working days to a date (n can be 0). Used by delay propagation.
export function addWorkingDays(
  start: Date,
  n: number,
  cal: WorkingCalendar
): Date {
  if (n <= 0) return nextWorkingDay(start, cal);
  return workingDayDate(start, n, cal);
}

// Counts working days strictly between two dates (a -> b), inclusive of b's day.
export function daysBetweenWorking(
  a: Date,
  b: Date,
  cal: WorkingCalendar
): number {
  if (b <= a) return 0;
  let cur = addCalendarDays(new Date(a.getTime()), 1);
  let count = 0;
  let guard = 0;
  while (cur <= b && guard < 100000) {
    if (isWorkingDay(cur, cal)) count++;
    cur = addCalendarDays(cur, 1);
    guard++;
  }
  return count;
}

/**
 * Converts a calendar date back into a working-day offset from project start.
 * Inverse of workingDayDate — needed to translate a user-entered actual date
 * into the offset space the CPM solver works in.
 */
export function offsetOfDate(
  start: Date,
  target: Date,
  cal: WorkingCalendar
): number {
  const from = nextWorkingDay(start, cal);
  if (target <= from) return 0;
  return daysBetweenWorking(from, target, cal);
}
