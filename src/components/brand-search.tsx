"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CarBrandBadge } from "@/components/logo";

export type BrandCard = {
  id: string;
  name: string;
  nameAr: string;
  logo: string | null;
  active: boolean;
  models: string;
};

/** Lower-case, strip Latin accents and Arabic diacritics, and unify alef/yaa/taa-marbuta forms. */
function fold(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** 0 = name starts with the query, 1 = a word starts with it, 2 = contains it, -1 = no match. */
function rank(haystack: string, q: string) {
  const h = fold(haystack);
  if (h.startsWith(q)) return 0;
  if (h.split(" ").some((w) => w.startsWith(q))) return 1;
  return h.includes(q) ? 2 : -1;
}

/** Wraps the first case-insensitive occurrence of the query in <mark>. */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-brand-100 text-brand-900">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function BrandSearch({
  lang,
  brands,
  initialQuery,
  labels,
}: {
  lang: "en" | "ar";
  brands: BrandCard[];
  initialQuery: string;
  /** `results` contains {n}, replaced with the match count. */
  labels: { search: string; clear: string; noMatch: string; results: string; modelsCount: string };
}) {
  const [query, setQuery] = useState(initialQuery);
  const deferred = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = fold(deferred);
    if (!q) return brands;
    return brands
      .map((b) => ({ b, r: Math.min(...[rank(b.name, q), rank(b.nameAr, q)].map((r) => (r < 0 ? 99 : r))) }))
      .filter((x) => x.r < 99)
      .sort((a, b) => a.r - b.r || a.b.name.localeCompare(b.b.name))
      .map((x) => x.b);
  }, [brands, deferred]);

  // Keep ?q= in the address bar so the filtered list survives a reload or a shared link.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (deferred.trim()) url.searchParams.set("q", deferred.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
  }, [deferred]);

  // "/" jumps to the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const primary = (b: BrandCard) => (lang === "ar" ? b.nameAr : b.name);
  const secondary = (b: BrandCard) => (lang === "ar" ? b.name : b.nameAr);

  return (
    <>
      <div role="search" className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <label htmlFor="brand-q" className="sr-only">
            {labels.search}
          </label>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-4.5 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            ref={inputRef}
            id="brand-q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
              // Enter opens the top result.
              if (e.key === "Enter" && results.length > 0) {
                e.preventDefault();
                document.getElementById(`brand-${results[0].id}`)?.click();
              }
            }}
            placeholder={labels.search}
            autoComplete="off"
            spellCheck={false}
            className="input ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden"
            aria-controls="brand-results"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute end-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-silver-100 hover:text-ink"
            >
              <span className="sr-only">{labels.clear}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>
        <p role="status" aria-live="polite" className="text-sm text-muted">
          {deferred.trim() ? labels.results.replace("{n}", String(results.length)) : ""}
        </p>
      </div>

      {results.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-muted">{labels.noMatch}</p>
          <button type="button" className="btn-secondary" onClick={() => setQuery("")}>
            {labels.clear}
          </button>
        </div>
      ) : (
        <ul id="brand-results" className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {results.map((b) => (
            <li key={b.id}>
              <Link
                id={`brand-${b.id}`}
                href={`/${lang}/catalog/${b.id}`}
                className={`card flex items-center gap-3 px-3 py-3 transition-[border-color,box-shadow] hover:border-brand-200 hover:shadow-(--shadow-lift) ${b.active ? "" : "opacity-60"}`}
              >
                <CarBrandBadge src={b.logo} name={b.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    <Highlight text={primary(b)} q={deferred.trim()} />
                  </span>
                  <span className="block truncate text-xs text-muted" lang={lang === "ar" ? "en" : "ar"}>
                    <Highlight text={secondary(b)} q={deferred.trim()} />
                  </span>
                </span>
                <span className="num shrink-0 text-sm text-muted">
                  {b.models} {labels.modelsCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
