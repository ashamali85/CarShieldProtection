import { Suspense } from "react";
import { lang as langParam } from "next/root-params";
import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/i18n";
import { HrTabs, TabsView } from "@/components/hr/hr-tabs";
import { can, getCurrentUser } from "@/lib/auth";

/** Reads the session, so it renders inside the Suspense boundary. Settings is only for people who can change it. */
async function Tabs({ lang, labels }: { lang: string; labels: Parameters<typeof HrTabs>[0]["labels"] }) {
  const user = await getCurrentUser();
  return <HrTabs lang={lang} labels={labels} settings={can(user, "hr.manage")} />;
}

export default async function HrLayout({ children }: LayoutProps<"/[lang]/hr">) {
  const lang = await langParam();
  if (!isLocale(lang)) notFound();
  const t = getDictionary(lang);
  return (
    <>
      <Suspense fallback={<TabsView lang={lang} labels={t.hr.tabs} pathname="" />}>
        <Tabs lang={lang} labels={t.hr.tabs} />
      </Suspense>
      {children}
    </>
  );
}
