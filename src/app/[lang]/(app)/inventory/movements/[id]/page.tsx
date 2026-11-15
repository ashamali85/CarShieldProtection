import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatDateTime } from "@/i18n";
import { pageContext } from "@/lib/page";
import { UUID_RE } from "@/lib/actions/helpers";
import { deleteStockMovement, updateStockMovement } from "@/lib/actions/inventory";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { RowDelete } from "@/components/finance/row-delete";
import { todayKuwait } from "@/lib/dates";

export default function EditMovementPage(props: PageProps<"/[lang]/inventory/movements/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditMovement {...props} />
    </Suspense>
  );
}

async function EditMovement({ params }: PageProps<"/[lang]/inventory/movements/[id]">) {
  const { lang, t } = await pageContext(params, { perm: "inventory.manage" });
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const I = t.inventory;
  const db = await getDb();
  const [row] = await db
    .select({ mv: schema.inventoryMovements, item: schema.inventoryItems, by: schema.users.name })
    .from(schema.inventoryMovements)
    .innerJoin(schema.inventoryItems, eq(schema.inventoryItems.id, schema.inventoryMovements.itemId))
    .leftJoin(schema.users, eq(schema.users.id, schema.inventoryMovements.userId))
    .where(eq(schema.inventoryMovements.id, id))
    .limit(1);
  if (!row || (row.mv.reason !== "restock" && row.mv.reason !== "adjustment") || row.item.deletedAt) notFound();
  const { mv, item, by } = row;
  const isPurchase = mv.reason === "restock";
  const name = lang === "ar" ? item.nameAr : item.nameEn;
  const unit = t.inventory.units[item.unit];
  const qty = mv.deltaMilli / 1000;
  const kuwaitDate = new Date(mv.createdAt.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={isPurchase ? I.editPurchase : I.editCount}
        subtitle={
          <>
            {name} · {formatDateTime(mv.createdAt, lang)}
            {by && <> · {by}</>}
          </>
        }
        back={{ href: `/${lang}/inventory/movements`, label: I.movementsTab }}
      />
      <div className="card card-pad max-w-2xl">
        <p className="mb-5 text-sm text-muted">{I.editHint}</p>
        <ActionForm action={updateStockMovement} hidden={{ lang, id }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={`${isPurchase ? I.quantity : I.changeQty} (${unit})`}
              name="quantity"
              required
              inputMode={isPurchase ? "decimal" : "text"}
              dir="ltr"
              defaultValue={String(qty)}
              hint={isPurchase ? I.purchaseQtyHint : I.changeHint}
            />
            <Field label={t.common.date} name="date" type="date" required dir="ltr" defaultValue={kuwaitDate} max={todayKuwait()} />
          </div>
          {isPurchase && (
            <>
              <Field
                label={I.totalCost}
                name="totalCost"
                inputMode="decimal"
                dir="ltr"
                placeholder="0.000"
                defaultValue={mv.totalCostFils != null ? (mv.totalCostFils / 1000).toFixed(3) : ""}
                hint={I.totalCostHint}
                optionalLabel={t.common.optional}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={I.supplier} name="supplier" defaultValue={mv.supplier ?? ""} optionalLabel={t.common.optional} />
                <div>
                  <label htmlFor="f-paidWith" className="label">
                    {I.paidWith}
                  </label>
                  <select id="f-paidWith" name="paidWith" className="input" defaultValue={mv.paidWith ?? "cash"}>
                    {(["cash", "knet", "card", "transfer"] as const).map((m) => (
                      <option key={m} value={m}>
                        {t.invoices.methods[m]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
          <Field label={I.note} name="note" defaultValue={mv.note ?? ""} optionalLabel={t.common.optional} />
          <SubmitButton className="btn-primary" pendingLabel={t.common.saving}>
            {I.saveChanges}
          </SubmitButton>
        </ActionForm>
        <div className="mt-6 flex justify-end border-t border-line pt-4">
          <RowDelete
            action={deleteStockMovement}
            hidden={{ lang, id }}
            labels={{ delete: I.deleteMovement, confirm: I.deleteMovementConfirm, cancel: t.common.cancel, saving: t.common.saving }}
          />
        </div>
      </div>
    </>
  );
}
