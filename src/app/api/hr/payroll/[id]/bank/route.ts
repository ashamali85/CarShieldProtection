import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { UUID_RE } from "@/lib/actions/helpers";

const cell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Bank transfer list for a payroll run (CSV, admins only). */
export async function GET(_req: Request, ctx: RouteContext<"/api/hr/payroll/[id]/bank">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return Response.json({ error: "bad request" }, { status: 400 });
  const db = await getDb();
  const [run] = await db.select().from(schema.payrollRuns).where(eq(schema.payrollRuns.id, id)).limit(1);
  if (!run) return Response.json({ error: "not found" }, { status: 404 });
  const slips = await db.select().from(schema.payslips).where(eq(schema.payslips.runId, id)).orderBy(asc(schema.payslips.employeeName));
  const lines = [
    ["Employee", "Bank", "IBAN", "Net amount (KWD)", "Reference"].join(","),
    ...slips.map((p) =>
      [cell(p.employeeName), cell(p.bankName), cell(p.iban), (p.netFils / 1000).toFixed(3), cell(`Salary ${run.year}-${String(run.month).padStart(2, "0")}`)].join(","),
    ),
  ];
  const name = `payroll-${run.year}-${String(run.month).padStart(2, "0")}-bank.csv`;
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
