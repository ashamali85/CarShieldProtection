import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, gte, ilike, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDateTime, formatLongDate, formatMoney, formatTime, type Dictionary, type Locale } from "@/i18n";
import { first, pageContext } from "@/lib/page";
import { EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { likeAny, UUID_RE } from "@/lib/actions/helpers";
import { AUDIT_AREAS, areaOf, type AuditArea } from "@/lib/audit-areas";
import type { Permission } from "@/lib/permissions";

const PER_PAGE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function AuditPage(props: PageProps<"/[lang]/audit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Audit {...props} />
    </Suspense>
  );
}

type Entry = typeof schema.auditLog.$inferSelect;

async function Audit({ params, searchParams }: PageProps<"/[lang]/audit">) {
  const { lang, t } = await pageContext(params, { perm: "audit.view" });
  const A = t.audit;
  const sp = await searchParams;
  const userFilter = first(sp.user);
  const area = (first(sp.area) in AUDIT_AREAS ? first(sp.area) : "") as AuditArea | "";
  const from = DATE_RE.test(first(sp.from)) ? first(sp.from) : "";
  const to = DATE_RE.test(first(sp.to)) ? first(sp.to) : "";
  const q = first(sp.q).slice(0, 100);
  const page = Math.min(Math.max(Number.parseInt(first(sp.page) || "1", 10) || 1, 1), 1000);
  const db = await getDb();
  const L = schema.auditLog;

  const where: (SQL | undefined)[] = [
    userFilter === "none" ? isNull(L.userId) : UUID_RE.test(userFilter) ? eq(L.userId, userFilter) : undefined,
    area ? or(...AUDIT_AREAS[area].map((p) => like(L.action, `${p}.%`))) : undefined,
    // Dates are the shop's (Kuwait, UTC+3, no daylight saving).
    from ? gte(L.at, new Date(`${from}T00:00:00+03:00`)) : undefined,
    to ? lt(L.at, new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 86_400_000)) : undefined,
    q ? or(ilike(L.entityLabel, likeAny(q)), ilike(L.userEmail, likeAny(q)), ilike(L.userName, likeAny(q))) : undefined,
  ];

  const [rows, people] = await Promise.all([
    db
      .select()
      .from(L)
      .where(and(...where))
      .orderBy(desc(L.at))
      .limit(PER_PAGE + 1)
      .offset((page - 1) * PER_PAGE),
    // Everyone who appears in the log, including deleted accounts (by the name recorded at the time).
    db
      .select({ id: L.userId, name: sql<string>`max(${L.userName})`, email: sql<string>`max(${L.userEmail})` })
      .from(L)
      .groupBy(L.userId)
      .orderBy(sql`max(${L.userName})`),
  ]);
  const hasMore = rows.length > PER_PAGE;
  const entries = rows.slice(0, PER_PAGE);
  const filtered = !!(userFilter || area || from || to || q);

  const link = (p: number) => {
    const u = new URLSearchParams();
    if (userFilter) u.set("user", userFilter);
    if (area) u.set("area", area);
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    if (q) u.set("q", q);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return `/${lang}/audit${s ? `?${s}` : ""}`;
  };

  // Entries grouped under a heading per day.
  const days: { key: string; date: Date; items: Entry[] }[] = [];
  for (const e of entries) {
    const key = formatLongDate(e.at, lang);
    if (days.at(-1)?.key !== key) days.push({ key, date: e.at, items: [] });
    days.at(-1)!.items.push(e);
  }

  return (
    <>
      <PageHeader title={A.title} subtitle={A.subtitle} />

      <form className="card card-pad mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]" role="search">
        <div>
          <label htmlFor="a-user" className="label">
            {A.user}
          </label>
          <select id="a-user" name="user" defaultValue={userFilter} className="input">
            <option value="">{A.allUsers}</option>
            {people.map((p) => (
              <option key={p.id ?? "none"} value={p.id ?? "none"}>
                {p.id ? `${p.name} (${p.email})` : A.system}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="a-area" className="label">
            {A.area}
          </label>
          <select id="a-area" name="area" defaultValue={area} className="input">
            <option value="">{A.allAreas}</option>
            {(Object.keys(AUDIT_AREAS) as AuditArea[]).map((k) => (
              <option key={k} value={k}>
                {A.areas[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="a-from" className="label">
            {A.fromDate}
          </label>
          <input id="a-from" name="from" type="date" defaultValue={from} className="input" dir="ltr" />
        </div>
        <div>
          <label htmlFor="a-to" className="label">
            {A.toDate}
          </label>
          <input id="a-to" name="to" type="date" defaultValue={to} className="input" dir="ltr" />
        </div>
        <div>
          <label htmlFor="a-q" className="label">
            {t.common.search}
          </label>
          <input id="a-q" name="q" type="search" defaultValue={q} placeholder={A.search} className="input" />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary">
            {A.filter}
          </button>
          {filtered && (
            <Link href={`/${lang}/audit`} className="btn-secondary">
              {A.clear}
            </Link>
          )}
        </div>
      </form>

      {entries.length === 0 ? (
        <div className="card">
          <EmptyState message={filtered || page > 1 ? A.noMatch : A.empty} icon={null} />
        </div>
      ) : (
        <div className="grid gap-4">
          {days.map((d) => (
            <section key={d.key} className="card">
              <h2 className="section-title border-b border-line px-4 py-3 sm:px-6">{d.key}</h2>
              <ol>
                {d.items.map((e) => (
                  <EntryRow key={e.id} e={e} lang={lang} t={t} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {(page > 1 || hasMore) && (
        <nav className="mt-4 flex items-center justify-between gap-2" aria-label={A.title}>
          {page > 1 ? (
            <Link href={link(page - 1)} className="btn-secondary">
              {A.newer}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted num">
            {A.showing.replace("{from}", String((page - 1) * PER_PAGE + 1)).replace("{to}", String((page - 1) * PER_PAGE + entries.length))}
          </span>
          {hasMore ? (
            <Link href={link(page + 1)} className="btn-secondary">
              {A.older}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

/** Where an entry's record lives, if it has its own page. */
function recordHref(lang: Locale, type: string | null, id: string | null): string | null {
  if (!type) return null;
  const base = `/${lang}`;
  if (type === "user") return `${base}/users`;
  if (type === "category") return `${base}/finance/settings`;
  if (type === "leaveType") return `${base}/hr/settings`;
  if (!id || !UUID_RE.test(id)) return null;
  const paths: Record<string, string> = {
    job: "jobs",
    invoice: "invoices",
    customer: "customers",
    service: "services",
    make: "catalog",
    inventory: "inventory",
    role: "roles",
    expense: "finance/expenses",
    contract: "finance/contracts",
    employee: "hr/employees",
    payroll: "hr/payroll",
  };
  return paths[type] ? `${base}/${paths[type]}/${id}` : null;
}

function EntryRow({ e, lang, t }: { e: Entry; lang: Locale; t: Dictionary }) {
  const A = t.audit;
  const label = (A.actions as Record<string, string>)[e.action] ?? e.action;
  const area = areaOf(e.action);
  const href = recordHref(lang, e.entityType, e.entityId);
  // Empty facts (no reference, no technician) are left out.
  const details = Object.entries(e.details ?? {}).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));
  const failed = e.action === "auth.loginFailed";
  return (
    <li className="grid gap-1 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[5.5rem_1fr] sm:gap-4 sm:px-6">
      <time dateTime={e.at.toISOString()} title={formatDateTime(e.at, lang)} className="num text-sm text-muted">
        {formatTime(e.at, lang)}
      </time>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`font-medium ${failed ? "text-red-700" : ""}`}>{label}</span>
          {e.entityLabel &&
            (href ? (
              <Link href={href} className="link min-w-0 break-words" dir="auto">
                <bdi>{e.entityLabel}</bdi>
              </Link>
            ) : (
              <bdi className="min-w-0 break-words">{e.entityLabel}</bdi>
            ))}
          {area && <span className="badge bg-slate-100 text-slate-700">{A.areas[area]}</span>}
        </p>
        <p className="text-sm text-muted">
          {e.userId || e.userName ? (
            <>
              <bdi className="text-ink">{e.userName}</bdi> <bdi dir="ltr">· {e.userEmail}</bdi>
            </>
          ) : (
            A.system
          )}
          {e.ip && (
            <>
              {" "}
              · <span title={A.ip} className="num" dir="ltr">{e.ip}</span>
            </>
          )}
        </p>
        {details.length > 0 && (
          <dl className="mt-1.5 grid gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[max-content_1fr]">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{fieldLabel(k, t)}</dt>
                <dd className="min-w-0 break-words">
                  {k === "permissions" && isPair(v) && Array.isArray(v[0]) ? (
                    <PermissionChange before={v[0]} after={v[1]} t={t} />
                  ) : isPair(v) && k !== "services" && k !== "permissions" ? (
                    <>
                      <span className="text-muted line-through decoration-muted/50">{show(k, v[0], lang, t)}</span> <span aria-hidden="true">{lang === "ar" ? "←" : "→"}</span>{" "}
                      <span>{show(k, v[1], lang, t)}</span>
                    </>
                  ) : (
                    show(k, v, lang, t)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  );
}

/** A [before, after] change (a role's permissions change is a pair of lists). */
function isPair(v: unknown): v is [unknown, unknown] {
  return Array.isArray(v) && v.length === 2 && !v.some((x) => typeof x === "object" && x !== null && !Array.isArray(x));
}

function permLabel(p: string, t: Dictionary): string {
  const [area] = p.split(".");
  const areaName = (t.roles.areas as Record<string, string>)[area] ?? area;
  return `${areaName}: ${(t.roles.perms as Record<Permission, string>)[p as Permission] ?? p}`;
}

/** What a role gained and lost. */
function PermissionChange({ before, after, t }: { before: unknown; after: unknown; t: Dictionary }) {
  const b = new Set(Array.isArray(before) ? before.map(String) : []);
  const a = new Set(Array.isArray(after) ? after.map(String) : []);
  const added = [...a].filter((p) => !b.has(p));
  const removed = [...b].filter((p) => !a.has(p));
  return (
    <ul className="grid gap-0.5">
      {added.map((p) => (
        <li key={`+${p}`} className="text-emerald-700">
          + {permLabel(p, t)}
        </li>
      ))}
      {removed.map((p) => (
        <li key={`-${p}`} className="text-red-700">
          − {permLabel(p, t)}
        </li>
      ))}
    </ul>
  );
}

function fieldLabel(key: string, t: Dictionary): string {
  const known = (t.audit.fields as Record<string, string>)[key];
  if (known) return known;
  // Settings keys like "pifss.employee.basic" read better spaced out.
  return key.replace(/\./g, " › ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Enum values (statuses, methods, reasons) in the reader's language. */
function enumLabel(v: string, t: Dictionary): string | undefined {
  const maps: Record<string, string>[] = [
    t.audit.values,
    t.jobs.status,
    t.invoices.status,
    t.invoices.methods,
    t.hr.leave.status,
    t.hr.payroll.status,
    t.hr.separation.reasons,
    t.finance.money.kinds,
  ];
  for (const m of maps) if (v in m) return m[v];
  return undefined;
}

function show(key: string, v: unknown, lang: Locale, t: Dictionary): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? t.audit.yes : t.audit.no;
  if (typeof v === "number") {
    if (key.endsWith("Fils")) return formatMoney(v, lang);
    if (key.endsWith("CentiHours")) return String(v / 100);
    if (key === "discountPercentBp") return `${v / 100}%`;
    if (key === "reorderLevelMilli") return String(v / 1000);
    return new Intl.NumberFormat(lang === "ar" ? "ar-KW-u-nu-latn" : "en-KW").format(v);
  }
  if (Array.isArray(v)) {
    if (key === "permissions") return v.map((p) => permLabel(String(p), t)).join(lang === "ar" ? "، " : ", ");
    return v.map((x) => show(key, x, lang, t)).join(lang === "ar" ? "، " : ", ");
  }
  const s = String(v);
  // Internal ids mean nothing to a reader; say that it changed.
  if (key.endsWith("Id") && UUID_RE.test(s)) return t.audit.values.changed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return formatDateTime(new Date(s), lang);
  return enumLabel(s, t) ?? s;
}
