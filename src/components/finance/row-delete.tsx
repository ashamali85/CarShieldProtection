"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";

/** A small Delete button that asks "Delete this …?" inline before acting. */
export function RowDelete({ action, hidden, labels }: { action: FormAction; hidden: Record<string, string>; labels: { delete: string; confirm: string; cancel: string; saving: string } }) {
  const [ask, setAsk] = useState(false);
  if (!ask) {
    return (
      <button type="button" className="btn-ghost min-h-8 px-2 text-xs text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setAsk(true)}>
        {labels.delete}
      </button>
    );
  }
  return (
    <ActionForm action={action} hidden={hidden} className="flex flex-wrap items-center justify-end gap-1">
      <span className="text-xs text-red-900">{labels.confirm}</span>
      <SubmitButton className="btn min-h-8 bg-red-600 px-2 text-xs text-white hover:bg-red-700" pendingLabel={labels.saving}>
        {labels.delete}
      </SubmitButton>
      <button type="button" className="btn-ghost min-h-8 px-2 text-xs" onClick={() => setAsk(false)}>
        {labels.cancel}
      </button>
    </ActionForm>
  );
}
