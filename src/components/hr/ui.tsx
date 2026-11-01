import type { Dictionary } from "@/i18n";
import type { EmployeeStatus, LeaveStatus, PayrollStatus } from "@/db/schema";

const LEAVE_TONES: Record<LeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
};

export function LeaveStatusBadge({ status, t }: { status: LeaveStatus; t: Dictionary }) {
  return <span className={`badge ${LEAVE_TONES[status]}`}>{t.hr.leave.status[status]}</span>;
}

const RUN_TONES: Record<PayrollStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
};

export function PayrollStatusBadge({ status, t }: { status: PayrollStatus; t: Dictionary }) {
  return <span className={`badge ${RUN_TONES[status]}`}>{t.hr.payroll.status[status]}</span>;
}

export function EmployeeStatusBadge({ status, t }: { status: EmployeeStatus; t: Dictionary }) {
  return <span className={`badge ${status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{t.hr.employees.status[status]}</span>;
}

/** Hundredths → "1.5". */
export const fromCenti = (n: number) => String(Math.round(n) / 100);

/** "March 2026" style label. */
export function monthLabel(year: number, month: number, lang: string) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(year, month - 1, 1));
}

export function PayBreakdown({ breakdown, t }: { breakdown: { days: number; pct: number }[] | null; t: Dictionary }) {
  if (!breakdown || breakdown.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="num flex flex-col">
      {breakdown.map((b, i) => (
        <span key={i} className={b.pct === 0 ? "text-red-700" : b.pct < 100 ? "text-amber-800" : "text-emerald-800"}>
          {b.days} × {b.pct === 100 ? t.hr.leave.fullPay : b.pct === 0 ? t.hr.leave.unpaid : `${b.pct}%`}
        </span>
      ))}
    </span>
  );
}
