// Working-day calendar utilities. Pure functions, no side effects.

export interface WorkingCalendar {
  workingDaysPerWeek: number; // 5, 6, or 7
  holidaySet: Set<string>; // ISO yyyy-mm-dd strings
}

function isoKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildCalendar(
  workingDaysPerWeek: number,
  holidays: Date[] = []
): WorkingCalendar {
  return {
    workingDaysPerWeek: Math.min(Math.max(workingDaysPerWeek, 1), 7),
    holidaySet: new Set(holidays.map(isoKey)),
  };
}

// Treats all dates in UTC to avoid timezone drift.
function addCalendarDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function isWorkingDay(d: Date, cal: WorkingCalendar): boolean {
  const dow = d.getUTCDay(); // 0 = Sun ... 6 = Sat
  if (cal.workingDaysPerWeek <= 5 && (dow === 0 || dow === 6)) return false;
  if (cal.workingDaysPerWeek === 6 && dow === 0) return false;
  if (cal.holidaySet.has(isoKey(d))) return false;
  return true;
}

// Returns the first working day on or after the given date.
export function nextWorkingDay(d: Date, cal: WorkingCalendar): Date {
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
