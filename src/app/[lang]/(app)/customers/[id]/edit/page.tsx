import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { CustomerForm } from "@/components/customer-form";
import { updateCustomer } from "@/lib/actions/customers";

export default function EditCustomerPage(props: PageProps<"/[lang]/customers/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditCustomer {...props} />
    </Suspense>
  );
}

async function EditCustomer({ params }: PageProps<"/[lang]/customers/[id]/edit">) {
  const { lang, t } = await pageContext(params);
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
  if (!customer) notFound();
  const back = `/${lang}/customers/${id}`;
  return (
    <>
      <PageHeader title={`${t.common.edit}: ${customer.name}`} back={{ href: back, label: customer.name }} />
      <div className="card card-pad max-w-2xl">
        <CustomerForm action={updateCustomer} lang={lang} t={t} customer={customer} cancelHref={back} />
      </div>
    </>
  );
}
