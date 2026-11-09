import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import type { Db } from "@/db";

/** Active people whose role can see jobs, i.e. who can be assigned to one. */
export function assignableStaff(db: Db) {
  return db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.users.active, true), sql`(${schema.roles.system} or 'jobs.view' = any(${schema.roles.permissions}))`))
    .orderBy(schema.users.name);
}
