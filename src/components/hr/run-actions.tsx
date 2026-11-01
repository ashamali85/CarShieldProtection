"use client";

import { useState } from "react";
import { deletePayroll, recalcPayroll, setPayrollStatus } from "@/lib/actions/hr";
import { ActionForm, SubmitButton } from "@/components/forms";

type Labels = { recalc: string; approve: string; reopen: string; markPaid: string; delete: string; deleteConfirm: string; cancel: string; saving: string };

export function RunActions({ lang, id, status, labels }: { lang: string; id: string; status: "draft" | "approved" | "paid"; labels: Labels }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const statusButton = (to: string, label: string, cls: string) => (
    <ActionForm action={setPayrollStatus} hidden={{ lang, id, to }} className="contents">
      <SubmitButton className={cls} pendingLabel={labels.saving}>
        {label}
      </SubmitButton>
    </ActionForm>
  );
  if (confirmDelete) {
    return (
      <div role="group" className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
        <p className="text-sm text-red-900">{labels.deleteConfirm}</p>
        <ActionForm action={deletePayroll} hidden={{ lang, id }} className="contents">
          <SubmitButton className="btn border border-red-700 bg-red-600 text-white hover:bg-red-700" pendingLabel={labels.saving}>
            {labels.delete}
          </SubmitButton>
        </ActionForm>
        <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
          {labels.cancel}
        </button>
      </div>
    );
  }
  return (
    <>
      {status === "draft" && (
        <>
          <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
            {labels.delete}
          </button>
          <ActionForm action={recalcPayroll} hidden={{ lang, id }} className="contents">
            <SubmitButton className="btn-secondary" pendingLabel={labels.saving}>
              {labels.recalc}
            </SubmitButton>
          </ActionForm>
          {statusButton("approved", labels.approve, "btn-primary")}
        </>
      )}
      {status === "approved" && (
        <>
          {statusButton("draft", labels.reopen, "btn-secondary")}
          {statusButton("paid", labels.markPaid, "btn-primary")}
        </>
      )}
      {status === "paid" && statusButton("approved", labels.reopen, "btn-secondary")}
    </>
  );
}
