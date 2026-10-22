import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  detectLocaleFromAcceptLanguage,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
} from "@/lib/i18n/locale";

/**
 * Refreshes the Supabase auth session on every request so Server
 * Components always see a valid (non-expired) session cookie.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Prima visita (nessun cookie di preferenza): rileva la lingua dalla
  // localizzazione del browser (Accept-Language), NON dalla geolocalizzazione.
  const existingLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const detectedLocale = isLocale(existingLocale)
    ? existingLocale
    : detectLocaleFromAcceptLanguage(request.headers.get("accept-language"));
  if (!isLocale(existingLocale)) {
    request.cookies.set(LOCALE_COOKIE, detectedLocale);
    response = NextResponse.next({ request });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/api") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/c/"); // link di condivisione pubblico, in sola lettura

  if (!user && !isAuthRoute && request.nextUrl.pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectResponse = NextResponse.redirect(url);
    if (!isLocale(existingLocale)) {
      redirectResponse.cookies.set(LOCALE_COOKIE, detectedLocale, {
        path: "/",
        maxAge: LOCALE_COOKIE_MAX_AGE,
        sameSite: "lax",
      });
    }
    return redirectResponse;
  }

  if (!isLocale(existingLocale)) {
    response.cookies.set(LOCALE_COOKIE, detectedLocale, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
