/** Today's date in Kuwait as YYYY-MM-DD. Call only after request data has been read. */
export function todayKuwait(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Start and end of a Kuwait calendar day / month as instants (+03:00, no DST). */
export function kuwaitDayRange(isoDate: string): [Date, Date] {
  const start = new Date(`${isoDate}T00:00:00+03:00`);
  return [start, new Date(start.getTime() + 86_400_000)];
}

export function kuwaitMonthStart(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 7)}-01T00:00:00+03:00`);
}

/** Formats a Date as the value of an <input type="datetime-local"> in Kuwait time. */
export function toLocalInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 16);
}

/** Current hour (0–23) in Kuwait. Call only after request data has been read. */
export function kuwaitHour(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kuwait" }).format(new Date()));
}
