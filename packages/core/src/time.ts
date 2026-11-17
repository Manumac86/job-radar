// Time-zone helpers built on Intl (no extra dependency).

function offsetMinutes(date: Date, timeZone: string): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part ?? "");
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** Wall-clock parts of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    hour: Number(parts["hour"]),
    minute: Number(parts["minute"]),
  };
}

/** The UTC instant of a wall-clock time in a zone (DST-aware). */
export function zonedTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  const second = guess - offsetMinutes(new Date(first), timeZone) * 60_000;
  return new Date(second);
}

/** Next midnight in `timeZone` after `now`. */
export function nextMidnight(now: Date, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return zonedTimeToUtc(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    0,
    0,
    timeZone,
  );
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Whether `now` falls in [start, end) wall-clock range, which may cross midnight. */
export function isWithinWindow(now: Date, start: string, end: string, timeZone: string): boolean {
  const p = zonedParts(now, timeZone);
  const t = p.hour * 60 + p.minute;
  const s = minutesOf(start);
  const e = minutesOf(end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

/** Next occurrence of a wall-clock time (e.g. "08:30") after `now`. */
export function nextWallClock(now: Date, hhmm: string, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  const [h, m] = hhmm.split(":").map(Number);
  let candidate = zonedTimeToUtc(p.year, p.month, p.day, h ?? 0, m ?? 0, timeZone);
  if (candidate.getTime() <= now.getTime()) {
    const t = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    candidate = zonedTimeToUtc(
      t.getUTCFullYear(),
      t.getUTCMonth() + 1,
      t.getUTCDate(),
      h ?? 0,
      m ?? 0,
      timeZone,
    );
  }
  return candidate;
}

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The app's time zone (local-operation spec, "App time zone"): `JOB_RADAR_TIMEZONE` when set and
 * valid, otherwise the runtime's zone (the machine's in Node, the browser's on the client),
 * otherwise UTC.
 */
export function appTimeZone(
  env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env,
): string {
  const configured = env["JOB_RADAR_TIMEZONE"]?.trim();
  if (configured && isTimeZone(configured)) return configured;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
