import { Suspense } from "react";
import { pageContext } from "@/lib/page";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { InventoryForm } from "@/components/inventory-form";

export default function NewInventoryPage(props: PageProps<"/[lang]/inventory/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewItem {...props} />
    </Suspense>
  );
}

async function NewItem({ params }: PageProps<"/[lang]/inventory/new">) {
  const { lang, t } = await pageContext(params, { admin: true });
  return (
    <>
      <PageHeader title={t.inventory.new} back={{ href: `/${lang}/inventory`, label: t.inventory.title }} />
      <div className="card card-pad max-w-2xl">
        <InventoryForm lang={lang} t={t} />
      </div>
    </>
  );
}
