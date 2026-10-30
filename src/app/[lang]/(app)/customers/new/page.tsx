import { Suspense } from "react";
import { pageContext } from "@/lib/page";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { CustomerForm } from "@/components/customer-form";
import { createCustomer } from "@/lib/actions/customers";

export default function NewCustomerPage(props: PageProps<"/[lang]/customers/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewCustomer {...props} />
    </Suspense>
  );
}

async function NewCustomer({ params }: PageProps<"/[lang]/customers/new">) {
  const { lang, t } = await pageContext(params);
  return (
    <>
      <PageHeader title={t.customers.new} back={{ href: `/${lang}/customers`, label: t.customers.title }} />
      <div className="card card-pad max-w-2xl">
        <CustomerForm action={createCustomer} lang={lang} t={t} cancelHref={`/${lang}/customers`} />
      </div>
    </>
  );
}
