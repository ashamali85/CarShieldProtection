"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { BodyType } from "@/db/schema";

export type PickerMake = { id: string; name: string; nameAr: string; models: number };
type PickerModel = { id: string; name: string; bodyType: BodyType; yearFrom: number; yearTo: number | null };

export type PickerLabels = {
  brand: string;
  bodyType: string;
  model: string;
  year: string;
  chooseBrand: string;
  chooseBody: string;
  chooseModel: string;
  chooseYear: string;
  pickBrandFirst: string;
  pickBodyFirst: string;
  pickModelFirst: string;
  otherBrand: string;
  otherModel: string;
  brandName: string;
  modelName: string;
  loadingModels: string;
  loadFailed: string;
  modelsCount: string;
  bodyTypes: Record<BodyType, string>;
};

const OTHER = "other";
const BODY_ORDER: BodyType[] = ["sedan", "suv", "coupe", "convertible", "hatchback", "wagon", "pickup", "minivan", "van"];
const OLDEST_YEAR = 1980;

/**
 * Interconnected Brand → Body type → Model → Year selects.
 * Submits makeId / bodyType / modelId / year, plus makeName / modelName when "Other" is chosen.
 */
export function VehiclePicker({ makes, labels, lang }: { makes: PickerMake[]; labels: PickerLabels; lang: string }) {
  const uid = useId();
  const cache = useRef(new Map<string, PickerModel[]>());
  const [makeId, setMakeId] = useState("");
  const [models, setModels] = useState<PickerModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [body, setBody] = useState<BodyType | "">("");
  const [modelId, setModelId] = useState("");
  const [year, setYear] = useState("");
  const maxYear = new Date().getFullYear() + 1;
  const rootRef = useRef<HTMLDivElement>(null);

  // Clear the selection when the surrounding form is reset after a successful save.
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const onReset = () => onMake("");
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const sortedMakes = useMemo(
    () => [...makes].sort((a, b) => (lang === "ar" ? a.nameAr.localeCompare(b.nameAr, "ar") : a.name.localeCompare(b.name))),
    [makes, lang],
  );

  // Load the brand's models when the brand changes.
  useEffect(() => {
    if (!makeId || makeId === OTHER) return;
    const cached = cache.current.get(makeId);
    if (cached) {
      applyModels(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch(`/api/catalog/models?make=${makeId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: PickerModel[]) => {
        if (cancelled) return;
        cache.current.set(makeId, data);
        applyModels(data);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [makeId]);

  function applyModels(data: PickerModel[]) {
    setModels(data);
    const bodies = new Set(data.map((m) => m.bodyType));
    // A brand with a single body type (e.g. only SUVs) skips that step.
    setBody(bodies.size === 1 ? [...bodies][0] : "");
  }

  const bodyCounts = useMemo(() => {
    const counts = new Map<BodyType, number>();
    for (const m of models ?? []) counts.set(m.bodyType, (counts.get(m.bodyType) ?? 0) + 1);
    return BODY_ORDER.filter((b) => counts.has(b)).map((b) => ({ body: b, count: counts.get(b)! }));
  }, [models]);

  const modelsForBody = useMemo(() => (models ?? []).filter((m) => m.bodyType === body), [models, body]);
  const model = modelsForBody.find((m) => m.id === modelId);

  const years = useMemo(() => {
    const from = model ? Math.max(model.yearFrom, OLDEST_YEAR) : OLDEST_YEAR;
    const to = model?.yearTo ?? maxYear;
    const list: number[] = [];
    for (let y = Math.min(to, maxYear); y >= from; y--) list.push(y);
    return list;
  }, [model, maxYear]);

  const otherMake = makeId === OTHER;
  const otherModel = otherMake || modelId === OTHER;
  const bodyOptions = otherMake ? BODY_ORDER.map((b) => ({ body: b, count: 0 })) : bodyCounts;

  function onMake(v: string) {
    setMakeId(v);
    setModels(null);
    setFailed(false);
    setBody("");
    setModelId("");
    setYear("");
  }

  const id = (n: string) => `${uid}-${n}`;
  const step = "grid gap-4 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div ref={rootRef} className="space-y-4">
      <div className={step}>
        {/* Brand */}
        <div>
          <label htmlFor={id("make")} className="label">
            {labels.brand}
          </label>
          <select id={id("make")} name="makeId" className="input" required value={makeId} onChange={(e) => onMake(e.target.value)}>
            <option value="" disabled>
              {labels.chooseBrand}
            </option>
            {sortedMakes.map((m) => (
              <option key={m.id} value={m.id}>
                {lang === "ar" ? `${m.nameAr} — ${m.name}` : m.name}
              </option>
            ))}
            <option value={OTHER}>{labels.otherBrand}</option>
          </select>
        </div>

        {/* Body type */}
        <div>
          <label htmlFor={id("body")} className="label">
            {labels.bodyType}
          </label>
          <select
            id={id("body")}
            name="bodyType"
            className="input"
            required
            disabled={!makeId || loading || (!otherMake && !models)}
            value={body}
            onChange={(e) => {
              setBody(e.target.value as BodyType);
              setModelId("");
              setYear("");
            }}
          >
            <option value="" disabled>
              {!makeId ? labels.pickBrandFirst : loading ? labels.loadingModels : labels.chooseBody}
            </option>
            {bodyOptions.map(({ body: b, count }) => (
              <option key={b} value={b}>
                {labels.bodyTypes[b]}
                {count > 0 ? ` (${count})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label htmlFor={id("model")} className="label">
            {labels.model}
          </label>
          {otherMake ? (
            <select id={id("model")} className="input" disabled value={OTHER}>
              <option value={OTHER}>{labels.otherModel}</option>
            </select>
          ) : (
            <select
              id={id("model")}
              name="modelId"
              className="input"
              required
              disabled={!body}
              value={modelId}
              onChange={(e) => {
                setModelId(e.target.value);
                setYear("");
              }}
            >
              <option value="" disabled>
                {body ? labels.chooseModel : labels.pickBodyFirst}
              </option>
              {modelsForBody.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value={OTHER}>{labels.otherModel}</option>
            </select>
          )}
        </div>

        {/* Year */}
        <div>
          <label htmlFor={id("year")} className="label">
            {labels.year}
          </label>
          <select
            id={id("year")}
            name="year"
            className="input num"
            required
            disabled={!(model || (otherModel && body))}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="" disabled>
              {model || (otherModel && body) ? labels.chooseYear : labels.pickModelFirst}
            </option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {failed && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {labels.loadFailed}
        </p>
      )}

      {otherModel && (
        <div className="grid gap-4 sm:grid-cols-2">
          {otherMake && (
            <div>
              <label htmlFor={id("make-name")} className="label">
                {labels.brandName}
              </label>
              <input id={id("make-name")} name="makeName" className="input" required dir="ltr" autoComplete="off" />
            </div>
          )}
          <div>
            <label htmlFor={id("model-name")} className="label">
              {labels.modelName}
            </label>
            <input id={id("model-name")} name="modelName" className="input" required dir="ltr" autoComplete="off" />
          </div>
        </div>
      )}
    </div>
  );
}
