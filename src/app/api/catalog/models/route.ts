import type { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { UUID_RE } from "@/lib/actions/helpers";

/** Models of one brand for the vehicle picker. Staff only. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const makeId = request.nextUrl.searchParams.get("make") ?? "";
  if (!UUID_RE.test(makeId)) return Response.json({ error: "bad request" }, { status: 400 });

  const db = await getDb();
  const models = await db
    .select({
      id: schema.carModels.id,
      name: schema.carModels.name,
      bodyType: schema.carModels.bodyType,
      yearFrom: schema.carModels.yearFrom,
      yearTo: schema.carModels.yearTo,
    })
    .from(schema.carModels)
    .where(and(eq(schema.carModels.makeId, makeId), eq(schema.carModels.active, true)))
    .orderBy(asc(schema.carModels.name));

  return Response.json(models, { headers: { "Cache-Control": "private, max-age=300" } });
}
