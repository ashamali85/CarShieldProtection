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
};

/** The bee symbol, used wherever a small logo is needed. */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return <img src={BRAND.mark} alt="" aria-hidden="true" className={`${className} shrink-0 rounded-md object-contain`} width={256} height={256} decoding="async" />;
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
