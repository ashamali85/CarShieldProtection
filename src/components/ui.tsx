import Link from "next/link";
import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n";
import type { InvoiceStatus, JobStatus } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { BrandIcon, type BrandIconName } from "@/components/logo";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 pt-2">
      {back && (
        <Link href={back.href} className="no-print mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <span aria-hidden="true" className="rtl:rotate-180">←</span>
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const JOB_TONES: Record<JobStatus, string> = {
  scheduled: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-800",
  quality_check: "bg-violet-100 text-violet-800",
  completed: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
};

export function JobStatusBadge({ status, t }: { status: JobStatus; t: Dictionary }) {
  return <span className={`badge ${JOB_TONES[status]}`}>{t.jobs.status[status]}</span>;
}

const INVOICE_TONES: Record<InvoiceStatus, string> = {
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  void: "bg-slate-100 text-slate-600",
};

export function InvoiceStatusBadge({ status, t }: { status: InvoiceStatus; t: Dictionary }) {
  return <span className={`badge ${INVOICE_TONES[status]}`}>{t.invoices.status[status]}</span>;
}

export type WarrantyState = "active" | "expiring" | "expired" | "void";

export function warrantyState(endsOn: string, status: "active" | "void", today: string): WarrantyState {
  if (status === "void") return "void";
  if (endsOn < today) return "expired";
  return endsOn <= addDays(today, 30) ? "expiring" : "active";
}

const WARRANTY_TONES: Record<WarrantyState, string> = {
  active: "bg-emerald-100 text-emerald-800",
  expiring: "bg-amber-100 text-amber-800",
  expired: "bg-slate-100 text-slate-600",
  void: "bg-red-100 text-red-700",
};

export function WarrantyBadge({ state, t }: { state: WarrantyState; t: Dictionary }) {
  return <span className={`badge ${WARRANTY_TONES[state]}`}>{t.warranties.state[state]}</span>;
}

export function EmptyState({ message, action, icon = "car" }: { message: string; action?: ReactNode; icon?: BrandIconName | null }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && (
        <span className="grid size-24 place-items-center rounded-full bg-radial from-white from-40% to-brand-50">
          <BrandIcon name={icon} className="size-16 opacity-90" />
        </span>
      )}
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {action}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="animate-pulse pt-2" aria-busy="true">
      <div className="mb-6 h-8 w-48 rounded-lg bg-line" />
      <div className="card h-72" />
    </div>
  );
}

export function Stat({ label, value, href, icon }: { label: string; value: ReactNode; href?: string; icon?: BrandIconName }) {
  const body = (
    <>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="num mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      </div>
      {icon && (
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-white to-silver-100 ring-1 ring-line">
          <BrandIcon name={icon} className="size-12 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" />
        </span>
      )}
    </>
  );
  const cls = "card group flex items-center justify-between gap-3 p-4 sm:p-5";
  return href ? (
    <Link href={href} className={`${cls} transition-[box-shadow,border-color,transform] hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-(--shadow-lift)`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs text-muted">{i.label}</dt>
          <dd className="mt-0.5 text-sm">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
