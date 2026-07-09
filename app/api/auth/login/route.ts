import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  expectedSessionToken,
  isPasswordConfigured,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { error: "Сначала задайте APP_PASSWORD в Vercel Environment Variables." },
      { status: 503 },
    );
  }

  let candidate = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    candidate = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (!verifyPassword(candidate)) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  const token = await expectedSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: "APP_PASSWORD не настроен" },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
