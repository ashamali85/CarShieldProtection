import type { ReactNode } from "react";

export type Line = {
  label: ReactNode;
  value: number;
  previous?: number;
  /** 0 = item, 1 = sub-item; "total" lines are bold with a rule above; "section" is a heading row. */
  level?: 0 | 1;
  kind?: "item" | "total" | "grand" | "section";
  /** For costs shown as negatives (e.g. "−KWD 50.000"). */
  negative?: boolean;
  /** For lines where a fall is good (costs), colour the change accordingly. */
  costLike?: boolean;
};

/** A financial statement: label, this period, previous period and change. */
export function Statement({
  lines,
  money,
  headings,
  compare = true,
}: {
  lines: Line[];
  money: (fils: number) => string;
  headings: { item: string; current: string; previous: string; change: string };
  compare?: boolean;
}) {
  const fmt = (v: number, neg?: boolean) => (neg && v !== 0 ? `−${money(Math.abs(v))}` : v < 0 ? `−${money(-v)}` : money(v));
  return (
    <div className="table-wrap">
      <table className="table min-w-[36rem]">
        <thead>
          <tr>
            <th>{headings.item}</th>
            <th className="text-end">{headings.current}</th>
            {compare && <th className="text-end">{headings.previous}</th>}
            {compare && <th className="text-end">{headings.change}</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            if (l.kind === "section") {
              return (
                <tr key={i} className="bg-silver-100/50 hover:bg-silver-100/50">
                  <td colSpan={compare ? 4 : 2} className="pt-4 text-xs font-semibold tracking-wide text-muted uppercase">
                    {l.label}
                  </td>
                </tr>
              );
            }
            const strong = l.kind === "total" || l.kind === "grand";
            const diff = l.previous === undefined ? null : l.value - l.previous;
            const good = diff === null || diff === 0 ? null : l.costLike ? diff < 0 : diff > 0;
            return (
              <tr key={i} className={l.kind === "grand" ? "bg-brand-50/70 hover:bg-brand-50/70" : undefined}>
                <td className={`${l.level === 1 ? "ps-8 text-muted" : ""} ${strong ? "font-semibold" : ""} ${l.kind === "grand" ? "text-base" : ""}`}>{l.label}</td>
                <td className={`num text-end ${strong ? "font-semibold" : ""} ${l.kind === "grand" ? "text-base" : ""} ${l.kind === "grand" && l.value < 0 ? "text-red-700" : ""}`}>
                  {fmt(l.value, l.negative)}
                </td>
                {compare && <td className="num text-end text-muted">{l.previous === undefined ? "" : fmt(l.previous, l.negative)}</td>}
                {compare && (
                  <td className={`num text-end text-xs ${good === null ? "text-muted" : good ? "text-emerald-700" : "text-red-700"}`}>
                    {diff === null || diff === 0 ? (l.previous === undefined ? "" : "—") : `${diff > 0 ? "▲" : "▼"} ${money(Math.abs(diff))}`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
