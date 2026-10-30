"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND } from "./logo";

const SEEN_KEY = "bee_intro_seen";
const MAX_MS = 8000; // safety net if the video stalls

/**
 * Full-screen logo animation shown when the landing page opens.
 * Plays once per browser session, can be skipped, and is skipped for
 * people who prefer reduced motion.
 */
export function IntroSplash({ skipLabel }: { skipLabel: string }) {
  const [state, setState] = useState<"playing" | "leaving" | "done">("playing");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduced) {
      // Already shown this session (or motion is reduced): remove on the next frame.
      const id = requestAnimationFrame(() => setState("done"));
      return () => cancelAnimationFrame(id);
    }
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    videoRef.current?.play().catch(() => finish());
    const timer = window.setTimeout(finish, MAX_MS);
    return () => window.clearTimeout(timer);
  }, []);

  function finish() {
    setState((s) => (s === "playing" ? "leaving" : s));
  }

  if (state === "done") return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#f4f4f6] transition-opacity duration-700 ${
        state === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      onTransitionEnd={() => state === "leaving" && setState("done")}
    >
      <video
        ref={videoRef}
        src={BRAND.intro}
        poster={BRAND.introPoster}
        className="h-full max-h-[min(100dvh,960px)] w-full max-w-[720px] object-contain"
        aria-hidden="true"
        muted
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
      />
      <button
        type="button"
        onClick={finish}
        className="btn-ghost absolute end-4 bottom-4 bg-white/70 backdrop-blur-sm sm:end-6 sm:bottom-6"
      >
        {skipLabel}
      </button>
    </div>
  );
}
