import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  isPasswordConfigured,
  verifySessionToken,
} from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  if (!isPasswordConfigured()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "APP_PASSWORD не настроен" },
        { status: 503 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?setup=1";
    return NextResponse.redirect(url);
  }

  const authenticated = await verifySessionToken(
    request.cookies.get(COOKIE_NAME)?.value,
  );
  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|apple-icon.png|icon-light-32x32.png|icon-dark-32x32.png|manifest.webmanifest|sw.js).*)",
  ],
};
