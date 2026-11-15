import "server-only";
import { randomInt } from "node:crypto";
import { eq, getTableName, is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { dbFor, schema } from "@/db";
import type { Db } from "@/db";

/**
 * Refreshes the training copy from the real shop: every table is copied over (parents before
 * children), the demo accounts are kept, copied real accounts are disabled, and optionally
 * customer and employee personal details are replaced with made-up ones.
 */

/** Tables never copied: sign-ins belong to each database on its own. */
// The real audit log stays out of the training copy, which keeps its own.
const SKIP = new Set(["sessions", "login_attempts", "audit_log"]);
/** A bcrypt hash of a random string: copied real accounts can never sign in to the training copy. */
const DISABLED_HASH = "$2b$10$uUQsGj8PSFFmsXxrHSrXO.gob2KFq/vJn67agm5pq/xup7ccHWOXa";
const CHUNK = 200;

/** All tables in the schema, ordered so every table comes after the tables it references. */
function tablesInOrder(): PgTable[] {
  const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));
  const done = new Set<string>();
  const out: PgTable[] = [];
  const visit = (t: PgTable, path: Set<string>) => {
    const name = getTableName(t);
    if (done.has(name) || path.has(name)) return;
    path.add(name);
    for (const fk of getTableConfig(t).foreignKeys) {
      const parent = fk.reference().foreignTable;
      if (parent !== t) visit(parent, path);
    }
    path.delete(name);
    done.add(name);
    out.push(t);
  };
  for (const t of tables) visit(t, new Set());
  return out;
}

async function copyTable(from: Db, to: Db, table: PgTable) {
  const rows = (await from.select().from(table)) as Record<string, unknown>[];
  for (let i = 0; i < rows.length; i += CHUNK) {
    await to.insert(table).values(rows.slice(i, i + CHUNK) as never);
  }
  return rows.length;
}

export type RefreshResult = { tables: number; rows: number; demoAccounts: number };

export async function refreshTrainingCopy({ anonymize }: { anonymize: boolean }): Promise<RefreshResult> {
  const live = await dbFor("live");
  const training = await dbFor("training");
  const ordered = tablesInOrder().filter((t) => !SKIP.has(getTableName(t)));

  // The demo accounts (and the role names they use) survive the refresh.
  const demoUsers = await training.select().from(schema.users);
  const demoRoles = await training.select().from(schema.roles);

  // Empty the training copy in one statement (table names come from our own schema).
  const names = tablesInOrder().map((t) => `"${getTableName(t)}"`).join(", ");
  await training.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));

  let rows = 0;
  for (const t of ordered) rows += await copyTable(live, training, t);

  // Real accounts stay (so names on jobs still show) but can't be used here.
  await training.update(schema.users).set({ active: false, passwordHash: DISABLED_HASH });

  // Put the demo accounts back with their roles (matched by id, then by role key, else Front desk).
  const roles = await training.select().from(schema.roles);
  const staff = roles.find((r) => r.key === "staff") ?? roles.find((r) => !r.system)!;
  for (const u of demoUsers) {
    const oldRole = demoRoles.find((r) => r.id === u.roleId);
    const role = roles.find((r) => r.id === u.roleId) ?? roles.find((r) => r.key === oldRole?.key) ?? staff;
    const { id, ...rest } = u;
    await training
      .insert(schema.users)
      .values({ id, ...rest, roleId: role.id })
      .onConflictDoUpdate({ target: schema.users.id, set: { ...rest, roleId: role.id } });
  }

  // Running numbers continue after the copied ones (jobs, invoices, employee codes).
  await training.execute(sql`
    do $$ declare r record; begin
      for r in select table_name, column_name from information_schema.columns
               where table_schema = 'public' and column_default like 'nextval(%' loop
        execute format('select setval(pg_get_serial_sequence(%L, %L), coalesce((select max(%I) from %I), 0) + 1, false)',
                       r.table_name, r.column_name, r.column_name, r.table_name);
      end loop;
    end $$`);

  if (anonymize) await anonymizeTraining(training);
  return { tables: ordered.length, rows, demoAccounts: demoUsers.length };
}

const digits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join("");

/** Replaces customers' and employees' personal details with made-up ones (numbering keeps them distinct). */
async function anonymizeTraining(db: Db) {
  const customers = await db.select({ id: schema.customers.id }).from(schema.customers).orderBy(schema.customers.createdAt);
  for (const [i, c] of customers.entries()) {
    await db
      .update(schema.customers)
      .set({ name: `Customer ${i + 1}`, phone: `9${digits(7)}`, email: null, civilId: null, notes: null })
      .where(eq(schema.customers.id, c.id));
  }
  const employees = await db.select({ id: schema.employees.id }).from(schema.employees).orderBy(schema.employees.hireDate);
  for (const [i, e] of employees.entries()) {
    await db
      .update(schema.employees)
      .set({ fullName: `Employee ${i + 1}`, fullNameAr: `موظف ${i + 1}`, phone: null, email: null, civilId: null, passportNo: null, iban: null, bankName: null, notes: null })
      .where(eq(schema.employees.id, e.id));
  }
}
