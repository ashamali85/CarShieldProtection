"use client";

import { useState } from "react";
import type { PeriodKind } from "@/lib/period";

type Labels = { label: string; month: string; quarter: string; year: string; custom: string; from: string; to: string; apply: string };

/** GET form that reloads the current report for another month, quarter, year or date range. */
export function PeriodPicker({
  lang,
  kind,
  year,
  month,
  quarter,
  from,
  to,
  years,
  labels,
  kinds = ["month", "quarter", "year", "custom"],
}: {
  lang: string;
  kind: PeriodKind;
  year: number;
  month: number;
  quarter: number;
  from: string;
  to: string;
  years: number[];
  labels: Labels;
  kinds?: PeriodKind[];
}) {
  const [k, setK] = useState<PeriodKind>(kind);
  const monthName = (m: number) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB", { month: "long", timeZone: "UTC" }).format(Date.UTC(2026, m - 1, 1));
  const sel = "input min-h-9 w-auto py-1.5 pe-8 text-sm";
  return (
    <form method="get" className="no-print mb-5 flex flex-wrap items-end gap-2" aria-label={labels.label}>
      <div role="radiogroup" aria-label={labels.label} className="flex rounded-lg border border-silver-300/80 bg-white p-0.5 shadow-[0_1px_2px_rgb(9_33_77/0.05)]">
        {kinds.map((x) => (
          <label key={x} className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${k === x ? "bg-brand-600 text-white" : "text-muted hover:text-ink"}`}>
            <input type="radio" name="p" value={x} checked={k === x} onChange={() => setK(x)} className="sr-only" />
            {labels[x]}
          </label>
        ))}
      </div>
      {k !== "custom" && (
        <>
          {k === "month" && (
            <select name="m" defaultValue={month} aria-label={labels.month} className={sel}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          )}
          {k === "quarter" && (
            <select name="q" defaultValue={quarter} aria-label={labels.quarter} className={sel}>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
          )}
          <select name="y" defaultValue={year} aria-label={labels.year} className={sel}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </>
      )}
      {k === "custom" && (
        <>
          <label className="text-sm">
            <span className="sr-only">{labels.from}</span>
            <input type="date" name="from" defaultValue={from} className={sel} aria-label={labels.from} />
          </label>
          <span className="pb-2 text-muted">→</span>
          <label className="text-sm">
            <span className="sr-only">{labels.to}</span>
            <input type="date" name="to" defaultValue={to} className={sel} aria-label={labels.to} />
          </label>
        </>
      )}
      <button type="submit" className="btn-secondary min-h-9 py-1.5">
        {labels.apply}
      </button>
    </form>
  );
}
