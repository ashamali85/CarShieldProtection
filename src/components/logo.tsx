/* eslint-disable @next/next/no-img-element -- brand assets are small, pre-optimised files on a CDN */

/** Brand assets, generated with Higgsfield and optimised for the web. */
export const BRAND = {
  name: "Bee Protection",
  /** Full 3D logo with the "BEE PROTECTION" wordmark (708×1200, WebP). */
  logo: "https://d2ol7oe51mr4n9.cloudfront.net/user_3JCO3UXh1P2KlQ2FeJgOKnr7S2x/bddc3671-a8de-4d3e-9d7f-07b311b48208.webp",
  /** Bee symbol only, square (256×256, PNG) — sidebar, invoices, browser tab. */
  mark: "https://d2ol7oe51mr4n9.cloudfront.net/user_3JCO3UXh1P2KlQ2FeJgOKnr7S2x/920539d8-0c5f-42b7-b141-16e513ff346e.png",
  /** 6-second logo animation (H.264, silent, 720×960). */
  intro: "https://d2ol7oe51mr4n9.cloudfront.net/user_3JCO3UXh1P2KlQ2FeJgOKnr7S2x/d732d889-683f-4cdf-9804-11866c5a35db.mp4",
  /** Last frame of the animation, shown while the video loads. */
  introPoster: "https://d2ol7oe51mr4n9.cloudfront.net/user_3JCO3UXh1P2KlQ2FeJgOKnr7S2x/f643617b-f92a-4513-9a28-95b386e35f6f.jpg",
  /** Studio photo of a ceramic-coated car (880×1168) — sign-in page. */
  hero: "https://d2ol7oe51mr4n9.cloudfront.net/user_3JCO3UXh1P2KlQ2FeJgOKnr7S2x/276756e7-dea0-4053-8a80-dd9716dc0d38.webp",
  /** Wide photo of film being applied, subject on the right (1344×576) — dashboard. */
  banner: "https://d2ol7oe51mr4n9.cloudfront.net/user_3JCO3UXh1P2KlQ2FeJgOKnr7S2x/4d6d6fe8-5030-43fb-8de0-87c4b2742e82.webp",
};

const CDN = "https://d2ol7oe51mr4n9.cloudfront.net/user_3JCO3UXh1P2KlQ2FeJgOKnr7S2x/";

/** 3D enamel-and-silver icons in the logo's style (256×256, white background). */
export const BRAND_ICONS = {
  jobs: `${CDN}8c140e57-fe7e-4bdb-ba54-053afc47bba5.webp`,
  calendar: `${CDN}c7c5db6a-3d30-47c8-bc77-6a75a3f75e62.webp`,
  revenue: `${CDN}6570aac8-00df-4ed2-bc8b-da14ea6f6549.webp`,
  due: `${CDN}cded8931-ca58-4db7-a9ef-e23e7236f841.webp`,
  car: `${CDN}0ff3bac4-d82f-4376-8a7f-69e7b3cc1e6a.webp`,
} as const;

export type BrandIconName = keyof typeof BRAND_ICONS;

/** One of the 3D brand icons. They sit on white, so multiply blends them into tinted tiles. */
export function BrandIcon({ name, className = "size-12" }: { name: BrandIconName; className?: string }) {
  return (
    <img
      src={BRAND_ICONS[name]}
      alt=""
      aria-hidden="true"
      width={256}
      height={256}
      loading="lazy"
      decoding="async"
      className={`${className} shrink-0 object-contain mix-blend-multiply`}
    />
  );
}

/** The bee symbol, used wherever a small logo is needed. */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <img
      src={BRAND.mark}
      alt=""
      aria-hidden="true"
      className={`${className} shrink-0 rounded-lg bg-white object-contain p-0.5 shadow-sm ring-1 ring-black/5`}
      width={256}
      height={256}
      decoding="async"
    />
  );
}

/** The full logo with wordmark. */
export function BrandLogo({ className = "", alt = BRAND.name, priority = false }: { className?: string; alt?: string; priority?: boolean }) {
  return (
    <img
      src={BRAND.logo}
      alt={alt}
      width={708}
      height={1200}
      className={`object-contain ${className}`}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}
