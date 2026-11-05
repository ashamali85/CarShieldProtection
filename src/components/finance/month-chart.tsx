/**
 * Grouped bars per month (revenue, total costs) with a profit line, drawn as inline SVG.
 * A data table with the same numbers sits next to it on the page, so the chart is decorative for
 * screen readers (aria-hidden) and the table carries the figures.
 */
export function MonthChart({
  data,
  labels,
}: {
  data: { label: string; revenue: number; costs: number; profit: number }[];
  labels: { revenue: string; costs: string; profit: string };
}) {
  const W = 720;
  const H = 240;
  const pad = { t: 12, r: 8, b: 28, l: 8 };
  const max = Math.max(1, ...data.flatMap((d) => [d.revenue, d.costs, Math.abs(d.profit)]));
  const min = Math.min(0, ...data.map((d) => d.profit));
  const span = max - min || 1;
  const y = (v: number) => pad.t + ((max - v) / span) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(18, slot / 3);
  const x0 = (i: number) => pad.l + i * slot + slot / 2;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x0(i).toFixed(1)},${y(d.profit).toFixed(1)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden="true">
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />
        {data.map((d, i) => (
          <g key={i}>
            <rect x={x0(i) - bw - 1} y={y(d.revenue)} width={bw} height={Math.max(0, y(0) - y(d.revenue))} rx="3" fill="var(--color-brand-500)" />
            <rect x={x0(i) + 1} y={y(d.costs)} width={bw} height={Math.max(0, y(0) - y(d.costs))} rx="3" fill="var(--color-silver-300)" />
            <text x={x0(i)} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
              {d.label}
            </text>
          </g>
        ))}
        <path d={line} fill="none" stroke="var(--color-emerald-600, #059669)" strokeWidth="2.5" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle key={i} cx={x0(i)} cy={y(d.profit)} r="3.5" fill={d.profit < 0 ? "#dc2626" : "#059669"} stroke="white" strokeWidth="1.5" />
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand-500" aria-hidden="true" />
          {labels.revenue}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-silver-300" aria-hidden="true" />
          {labels.costs}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-emerald-600" aria-hidden="true" />
          {labels.profit}
        </span>
      </figcaption>
    </figure>
  );
}

/** Horizontal share bars (e.g. expenses by category). */
export function ShareBars({ items, money, empty }: { items: { label: string; value: number }[]; money: (f: number) => string; empty: string }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (total <= 0) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items
        .filter((i) => i.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((i) => (
          <li key={i.label}>
            <div className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{i.label}</span>
              <span className="num shrink-0 text-muted">
                {money(i.value)} · {Math.round((i.value / total) * 100)}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-silver-100">
              <div className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-600 rtl:bg-linear-to-l" style={{ width: `${(i.value / total) * 100}%` }} />
            </div>
          </li>
        ))}
    </ul>
  );
}
