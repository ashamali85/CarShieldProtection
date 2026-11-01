import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pageContext } from "@/lib/page";
import { getHrSettings } from "@/lib/hr-data";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { AddLeaveType, LeaveTypeItem, PayRulesForm } from "@/components/hr/settings-forms";

export default function HrSettingsPage(props: PageProps<"/[lang]/hr/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings {...props} />
    </Suspense>
  );
}

async function Settings({ params }: PageProps<"/[lang]/hr/settings">) {
  const { lang, t } = await pageContext(params, { admin: true });
  const S = t.hr.settings;
  const L = t.hr.leave;
  const db = await getDb();
  const [s, types] = await Promise.all([getHrSettings(db), db.select().from(schema.leaveTypes).orderBy(asc(schema.leaveTypes.sortOrder), asc(schema.leaveTypes.nameEn))]);
  const typeText = {
    nameEn: t.inventory.nameEn,
    nameAr: t.inventory.nameAr,
    allowanceDays: S.allowanceDays,
    payPct: S.payPct,
    payBands: S.payBands,
    minService: S.minService,
    femaleOnly: S.femaleOnly,
    active: t.common.active,
    period: S.period,
    periods: S.periods,
    save: t.common.save,
    saving: t.common.saving,
    saved: S.saved,
    edit: t.common.edit,
    cancel: t.common.cancel,
    noLimit: L.noLimit,
    addType: S.addType,
  };
  const bandText = (tiers: { days: number | null; pct: number }[]) =>
    tiers.map((b) => `${b.days ?? "∞"} × ${b.pct === 100 ? L.fullPay : b.pct === 0 ? L.unpaid : `${b.pct}%`}`).join(" · ");

  return (
    <>
      <PageHeader title={S.title} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          <PayRulesForm
            lang={lang}
            s={s}
            text={{
              saved: S.saved,
              save: t.common.save,
              saving: t.common.saving,
              payRules: S.payRules,
              dailyDivisor: S.dailyDivisor,
              dailyDivisorHint: S.dailyDivisorHint,
              hoursPerDay: S.hoursPerDay,
              otNormal: S.otNormal,
              otRest: S.otRest,
              otHoliday: S.otHoliday,
              pifssTitle: S.pifssTitle,
              pifssHint: S.pifssHint,
              basicCap: S.basicCap,
              totalCap: S.totalCap,
              remunerationCap: S.remunerationCap,
              employeeRates: S.employeeRates,
              employerRates: S.employerRates,
              components: S.components,
            }}
          />
        </div>
        <div className="grid min-w-0 content-start gap-4 [&>*]:min-w-0">
          <section className="card">
            <div className="border-b border-line px-4 py-3.5 sm:px-6">
              <h2 className="section-title">{S.leaveTypes}</h2>
              <p className="hint">{S.leaveTypesHint}</p>
            </div>
            <ul>
              {types.map((ty) => (
                <LeaveTypeItem
                  key={ty.id}
                  lang={lang}
                  title={lang === "ar" ? ty.nameAr : ty.nameEn}
                  summary={`${ty.allowanceDays ?? L.noLimit} · ${S.periods[ty.period]} · ${bandText(ty.payTiers)}${ty.minServiceMonths ? ` · ${L.eligibleAfter.replace("{n}", String(ty.minServiceMonths))}` : ""}${ty.femaleOnly ? ` · ${S.femaleOnly}` : ""}`}
                  row={{
                    id: ty.id,
                    nameEn: ty.nameEn,
                    nameAr: ty.nameAr,
                    allowanceDays: ty.allowanceDays,
                    period: ty.period,
                    bands: bandText(ty.payTiers),
                    singlePct: ty.payTiers.length === 1 ? ty.payTiers[0].pct : null,
                    minServiceMonths: ty.minServiceMonths,
                    femaleOnly: ty.femaleOnly,
                    active: ty.active,
                  }}
                  text={typeText}
                />
              ))}
            </ul>
          </section>
          <div>
            <AddLeaveType lang={lang} text={typeText} />
          </div>
        </div>
      </div>
    </>
  );
}
