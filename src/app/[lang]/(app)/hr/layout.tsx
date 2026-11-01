import { Suspense } from "react";
import { lang as langParam } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/i18n";
import { HrTabs, TabsView } from "@/components/hr/hr-tabs";

export default async function HrLayout({ children }: LayoutProps<"/[lang]/hr">) {
  const lang = await langParam();
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  return (
    <>
      <Suspense fallback={<TabsView lang={lang} labels={t.hr.tabs} pathname="" />}>
        <HrTabs lang={lang} labels={t.hr.tabs} />
      </Suspense>
      {children}
    </>
  );
}
