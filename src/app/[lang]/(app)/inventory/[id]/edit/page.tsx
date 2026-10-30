import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { InventoryForm } from "@/components/inventory-form";

export default function EditInventoryPage(props: PageProps<"/[lang]/inventory/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditItem {...props} />
    </Suspense>
  );
}

async function EditItem({ params }: PageProps<"/[lang]/inventory/[id]/edit">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();
  const [item] = await db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id)).limit(1);
  if (!item) notFound();
  const name = lang === "ar" ? item.nameAr : item.nameEn;
  return (
    <>
      <PageHeader title={`${t.common.edit}: ${name}`} back={{ href: `/${lang}/inventory/${id}`, label: name }} />
      <div className="card card-pad max-w-2xl">
        <InventoryForm lang={lang} t={t} item={item} />
      </div>
    </>
  );
}
