import { Suspense } from "react";
import { pageContext } from "@/lib/page";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ServiceForm } from "@/components/service-form";

export default function NewServicePage(props: PageProps<"/[lang]/services/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewService {...props} />
    </Suspense>
  );
}

async function NewService({ params }: PageProps<"/[lang]/services/new">) {
  const { lang, t } = await pageContext(params, { admin: true });
  return (
    <>
      <PageHeader title={t.services.new} back={{ href: `/${lang}/services`, label: t.services.title }} />
      <div className="card card-pad max-w-2xl">
        <ServiceForm lang={lang} t={t} />
      </div>
    </>
  );
}
