import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { ServiceForm } from "@/components/service-form";

export default function EditServicePage(props: PageProps<"/[lang]/services/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditService {...props} />
    </Suspense>
  );
}

async function EditService({ params }: PageProps<"/[lang]/services/[id]">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = await getDb();
  const [service] = await db.select().from(schema.services).where(eq(schema.services.id, id)).limit(1);
  if (!service) notFound();
  return (
    <>
      <PageHeader
        title={lang === "ar" ? service.nameAr : service.nameEn}
        back={{ href: `/${lang}/services`, label: t.services.title }}
      />
      <div className="card card-pad max-w-2xl">
        <ServiceForm lang={lang} t={t} service={service} />
      </div>
    </>
  );
}
