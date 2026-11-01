"use client";

import { decideLeave } from "@/lib/actions/hr";
import { ActionForm, SubmitButton } from "@/components/forms";

/** Approve / reject a pending request, or cancel an approved one. */
export function LeaveActions({
  lang,
  id,
  status,
  labels,
}: {
  lang: string;
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  labels: { approve: string; reject: string; cancel: string; saving: string };
}) {
  const button = (decision: string, label: string, cls: string) => (
    <ActionForm key={decision} action={decideLeave} hidden={{ lang, id, decision }} className="contents">
      <SubmitButton className={`btn min-h-8 px-2.5 text-xs ${cls}`} pendingLabel={labels.saving}>
        {label}
      </SubmitButton>
    </ActionForm>
  );
  if (status === "pending") {
    return (
      <div className="flex flex-wrap justify-end gap-1">
        {button("approved", labels.approve, "bg-emerald-600 text-white hover:bg-emerald-700")}
        {button("rejected", labels.reject, "border border-line bg-white text-red-700 hover:bg-red-50")}
      </div>
    );
  }
  if (status === "approved") {
    return <div className="flex justify-end">{button("cancelled", labels.cancel, "text-muted hover:bg-silver-100 hover:text-ink")}</div>;
  }
  return null;
}
