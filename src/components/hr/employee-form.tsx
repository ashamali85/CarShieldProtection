import type { Dictionary, Locale } from "@/i18n";
import type { Employee } from "@/db/schema";
import { saveEmployee } from "@/lib/actions/hr";
import { ActionForm, Field, SubmitButton } from "@/components/forms";

const kwd = (fils: number | null | undefined) => (fils == null ? "" : (fils / 1000).toFixed(3));

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section role="group" aria-labelledby={id} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h2 id={id} className="section-title mb-4">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Select({ label, name, value, options }: { label: string; name: string; value?: string; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="label">
        {label}
      </label>
      <select id={`f-${name}`} name={name} defaultValue={value} className="input">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function EmployeeForm({
  lang,
  t,
  employee,
  users,
}: {
  lang: Locale;
  t: Dictionary;
  employee?: Employee;
  users: { id: string; name: string }[];
}) {
  const E = t.hr.employees;
  const opt = t.common.optional;
  const e = employee;
  const cancel = e ? `/${lang}/hr/employees/${e.id}` : `/${lang}/hr/employees`;
  return (
    <ActionForm action={saveEmployee} hidden={{ lang, ...(e ? { id: e.id } : {}) }} className="space-y-6">
      <Section id="sec-personal" title={E.sections.personal}>
        <Field label={E.name} name="fullName" required dir="ltr" autoComplete="off" defaultValue={e?.fullName} />
        <Field label={E.nameAr} name="fullNameAr" dir="rtl" lang="ar" autoComplete="off" defaultValue={e?.fullNameAr ?? ""} optionalLabel={opt} />
        <Select
          label={E.gender}
          name="gender"
          value={e?.gender ?? "male"}
          options={[
            { value: "male", label: E.genders.male },
            { value: "female", label: E.genders.female },
          ]}
        />
        <Field label={E.nationality} name="nationality" required autoComplete="off" defaultValue={e?.nationality} />
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="isKuwaiti" defaultChecked={e?.isKuwaiti} className="mt-0.5 size-4 accent-brand-600" />
          {E.isKuwaiti}
        </label>
        <Field label={E.dateOfBirth} name="dateOfBirth" type="date" defaultValue={e?.dateOfBirth ?? ""} optionalLabel={opt} />
        <Field label={E.phone} name="phone" type="tel" dir="ltr" inputMode="tel" defaultValue={e?.phone ?? ""} optionalLabel={opt} />
        <Field label={E.email} name="email" type="email" dir="ltr" defaultValue={e?.email ?? ""} optionalLabel={opt} />
      </Section>

      <Section id="sec-job" title={E.sections.job}>
        <Field label={E.jobTitle} name="jobTitle" required defaultValue={e?.jobTitle} />
        <Field label={E.department} name="department" defaultValue={e?.department ?? ""} optionalLabel={opt} />
        <Field label={E.hireDate} name="hireDate" type="date" required defaultValue={e?.hireDate} />
        <Select
          label={E.contractType}
          name="contractType"
          value={e?.contractType ?? "unlimited"}
          options={[
            { value: "unlimited", label: E.contractTypes.unlimited },
            { value: "fixed", label: E.contractTypes.fixed },
          ]}
        />
        <Field label={E.contractEnd} name="contractEnd" type="date" defaultValue={e?.contractEnd ?? ""} optionalLabel={opt} />
        <div>
          <label htmlFor="f-userId" className="label">
            {E.linkedUser} <span className="font-normal text-muted">({opt})</span>
          </label>
          <select id="f-userId" name="userId" defaultValue={e?.userId ?? ""} className="input">
            <option value="">{E.noLinkedUser}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <p className="hint">{E.linkedUserHint}</p>
        </div>
      </Section>

      <Section id="sec-salary" title={E.sections.salary}>
        <Field label={E.basic} name="basic" required inputMode="decimal" dir="ltr" placeholder="0.000" defaultValue={kwd(e?.basicSalaryFils)} />
        <Field label={E.housing} name="housing" inputMode="decimal" dir="ltr" placeholder="0.000" defaultValue={kwd(e?.housingAllowanceFils)} optionalLabel={opt} />
        <Field label={E.transport} name="transport" inputMode="decimal" dir="ltr" placeholder="0.000" defaultValue={kwd(e?.transportAllowanceFils)} optionalLabel={opt} />
        <Field label={E.otherAllowance} name="otherAllowance" inputMode="decimal" dir="ltr" placeholder="0.000" defaultValue={kwd(e?.otherAllowanceFils)} optionalLabel={opt} />
        <Field label={E.pifssSalary} name="pifssSalary" inputMode="decimal" dir="ltr" placeholder="0.000" defaultValue={kwd(e?.pifssSalaryFils)} hint={E.pifssSalaryHint} optionalLabel={opt} />
        <Field
          label={E.leaveOpening}
          name="leaveOpeningDays"
          type="number"
          inputMode="numeric"
          dir="ltr"
          defaultValue={e?.leaveOpeningDays ?? 0}
          hint={E.leaveOpeningHint}
        />
      </Section>

      <Section id="sec-documents" title={E.sections.documents}>
        <Field label={E.civilId} name="civilId" dir="ltr" inputMode="numeric" autoComplete="off" defaultValue={e?.civilId ?? ""} optionalLabel={opt} />
        <Field label={E.civilIdExpiry} name="civilIdExpiry" type="date" defaultValue={e?.civilIdExpiry ?? ""} optionalLabel={opt} />
        <Field label={E.passportNo} name="passportNo" dir="ltr" autoComplete="off" defaultValue={e?.passportNo ?? ""} optionalLabel={opt} />
        <Field label={E.passportExpiry} name="passportExpiry" type="date" defaultValue={e?.passportExpiry ?? ""} optionalLabel={opt} />
        <Field label={E.residencyExpiry} name="residencyExpiry" type="date" defaultValue={e?.residencyExpiry ?? ""} optionalLabel={opt} />
      </Section>

      <Section id="sec-bank" title={E.sections.bank}>
        <Field label={E.bankName} name="bankName" defaultValue={e?.bankName ?? ""} optionalLabel={opt} />
        <Field label={E.iban} name="iban" dir="ltr" autoComplete="off" placeholder="KW00 XXXX 0000 0000 0000 0000 0000 00" defaultValue={e?.iban ?? ""} optionalLabel={opt} />
      </Section>

      <Section id="sec-other" title={E.sections.other}>
        <div className="sm:col-span-2">
          <label htmlFor="f-notes" className="label">
            {E.notes} <span className="font-normal text-muted">({opt})</span>
          </label>
          <textarea id="f-notes" name="notes" rows={3} className="input" defaultValue={e?.notes ?? ""} />
        </div>
      </Section>

      <div className="flex gap-2">
        <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
        <a href={cancel} className="btn-secondary">
          {t.common.cancel}
        </a>
      </div>
    </ActionForm>
  );
}
