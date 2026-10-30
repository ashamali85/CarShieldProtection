/**
 * Database maintenance: `npm run db:migrate` and `npm run db:seed`.
 * Works against Neon (postgres://…) or a local PGlite folder (pglite://./.pglite).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see .env.example).");
  process.exit(1);
}

async function connect() {
  if (url!.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite(url!.slice("pglite://".length) || "./.pglite");
    const db = drizzle(client, { schema });
    return {
      db,
      migrate: () => migrate(db, { migrationsFolder: "./drizzle" }),
      close: () => client.close(),
    };
  }
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return {
    db,
    migrate: () => migrate(db, { migrationsFolder: "./drizzle" }),
    close: () => pool.end(),
  };
}

const SERVICES: (typeof schema.services.$inferInsert)[] = [
  { nameEn: "Full body PPF (clear)", nameAr: "حماية كاملة للهيكل (شفاف)", category: "ppf", priceFils: 650_000, warrantyMonths: 120 },
  { nameEn: "Front package PPF", nameAr: "حماية الواجهة الأمامية", category: "ppf", priceFils: 220_000, warrantyMonths: 120 },
  { nameEn: "Matte PPF full body", nameAr: "حماية كاملة مطفية", category: "ppf", priceFils: 750_000, warrantyMonths: 120 },
  { nameEn: "Ceramic coating 9H", nameAr: "طلاء سيراميك 9H", category: "ceramic", priceFils: 120_000, warrantyMonths: 36 },
  { nameEn: "Window tint (ceramic film)", nameAr: "تظليل نوافذ (فيلم سيراميك)", category: "tint", priceFils: 85_000, warrantyMonths: 60 },
  { nameEn: "Windshield protection film", nameAr: "فيلم حماية الزجاج الأمامي", category: "tint", priceFils: 45_000, warrantyMonths: 12 },
  { nameEn: "Interior detailing", nameAr: "تنظيف داخلي شامل", category: "detailing", priceFils: 25_000, warrantyMonths: 0 },
  { nameEn: "Paint correction & polish", nameAr: "تصحيح وتلميع الطلاء", category: "detailing", priceFils: 60_000, warrantyMonths: 0 },
];

async function main() {
  const cmd = process.argv[2];
  const conn = await connect();
  try {
    if (cmd === "migrate") {
      await conn.migrate();
      console.log("Migrations applied.");
    } else if (cmd === "seed") {
      const email = (process.env.ADMIN_EMAIL ?? "admin@carshield.local").toLowerCase();
      const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
      const existing = await conn.db.select().from(schema.users).limit(1);
      if (existing.length === 0) {
        await conn.db.insert(schema.users).values({
          name: "Administrator",
          email,
          passwordHash: await bcrypt.hash(password, 10),
          role: "admin",
        });
        console.log(`Admin user created: ${email}`);
      } else {
        console.log("Users already exist; skipped admin user.");
      }
      const svc = await conn.db.select().from(schema.services).limit(1);
      if (svc.length === 0) {
        await conn.db.insert(schema.services).values(SERVICES);
        console.log(`Inserted ${SERVICES.length} starter services.`);
      } else {
        console.log("Services already exist; skipped.");
      }
    } else {
      console.error("Usage: tsx scripts/db.ts <migrate|seed>");
      process.exitCode = 1;
    }
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
