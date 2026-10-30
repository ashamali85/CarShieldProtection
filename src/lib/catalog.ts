import "server-only";
import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Dictionary } from "@/i18n";
import type { PickerLabels, PickerMake } from "@/components/vehicle-picker";

/** Active brands with their model counts, for the vehicle picker. */
export async function getPickerMakes(): Promise<PickerMake[]> {
  const db = await getDb();
  return db
    .select({
      id: schema.carMakes.id,
      name: schema.carMakes.name,
      nameAr: schema.carMakes.nameAr,
      models: count(schema.carModels.id),
    })
    .from(schema.carMakes)
    .leftJoin(schema.carModels, and(eq(schema.carModels.makeId, schema.carMakes.id), eq(schema.carModels.active, true)))
    .where(eq(schema.carMakes.active, true))
    .groupBy(schema.carMakes.id)
    .orderBy(schema.carMakes.name);
}

export function pickerLabels(t: Dictionary): PickerLabels {
  const v = t.vehicles;
  return {
    brand: v.brand,
    bodyType: v.bodyType,
    model: v.model,
    year: v.year,
    chooseBrand: v.chooseBrand,
    chooseBody: v.chooseBody,
    chooseModel: v.chooseModel,
    chooseYear: v.chooseYear,
    pickBrandFirst: v.pickBrandFirst,
    pickBodyFirst: v.pickBodyFirst,
    pickModelFirst: v.pickModelFirst,
    otherBrand: v.otherBrand,
    otherModel: v.otherModel,
    brandName: v.brandName,
    modelName: v.modelName,
    loadingModels: v.loadingModels,
    loadFailed: v.loadFailed,
    modelsCount: v.modelsCount,
    bodyTypes: v.bodyTypes,
  };
}
