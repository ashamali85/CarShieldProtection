import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["en", "ar"];
const SESSION_COOKIE = "csp_session";
const LANG_COOKIE = "csp_lang";

function preferredLocale(request: NextRequest): string {
  const saved = request.cookies.get(LANG_COOKIE)?.value;
  if (saved && LOCALES.includes(saved)) return saved;
  const accept = request.headers.get("accept-language") ?? "";
  return accept.toLowerCase().startsWith("ar") ? "ar" : "en";
}

/**
 * Optimistic routing only: adds the locale prefix, remembers the language and
 * sends signed-out visitors to the login page. Every page and Server Action
 * still verifies the session itself.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const [, first, second] = pathname.split("/");

  if (!LOCALES.includes(first)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  const isLogin = second === "login";
  const hasSession = request.cookies.has(SESSION_COOKIE);

  let response: NextResponse;
  if (!isLogin && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = `/${first}/login`;
    url.search = "";
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next();
  }

  // Only real page loads change the saved language, not link prefetches.
  const isDocument = request.headers.get("sec-fetch-dest") === "document";
  if (isDocument && request.cookies.get(LANG_COOKIE)?.value !== first) {
    response.cookies.set(LANG_COOKIE, first, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|icon|.*\\..*).*)"],
};
