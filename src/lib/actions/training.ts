"use server";

import { refresh } from "next/cache";
import { trainingEnabled } from "@/db";
import { requireUser } from "@/lib/auth";
import { currentMode } from "@/lib/session-token";
import { refreshTrainingCopy } from "@/lib/training";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/forms";
import { langFrom, t } from "./helpers";

/** Admins of the real shop only: replaces the training copy with today's live data. */
export async function refreshTraining(_: ActionState, formData: FormData): Promise<ActionState> {
  const lang = langFrom(formData);
  const me = await requireUser(lang);
  const T = t(lang).training;
  if (!me.isAdmin || (await currentMode()) !== "live" || !trainingEnabled()) return { error: t(lang).users.notAllowed };
  try {
    const anonymize = formData.get("anonymize") === "on";
    const r = await refreshTrainingCopy({ anonymize });
    await audit("training.refresh", null, { anonymize, rows: r.rows });
  } catch {
    return { error: T.refreshFailed };
  }
  refresh();
  return {};
}
