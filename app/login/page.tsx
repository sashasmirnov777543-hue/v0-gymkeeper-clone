"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dumbbell, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginShell() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <div className="h-80 w-full max-w-sm animate-pulse rounded-2xl border border-border bg-card" />
    </main>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const needsSetup = params.get("setup") === "1";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не удалось войти");
        return;
      }
      const next = params.get("next");
      router.replace(next?.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Dumbbell className="size-6" aria-hidden="true" />
        </div>
        <p className="mt-5 font-mono text-xs uppercase tracking-[0.2em] text-primary">
          Gymkeeper
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Персональный вход
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Введите пароль приложения. Он проверяется на сервере и не сохраняется
          в браузере.
        </p>

        {needsSetup && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            Задайте <code className="font-mono">APP_USERNAME</code>, <code className="font-mono">APP_PASSWORD</code> и длинный <code className="font-mono">SESSION_SECRET</code> в Vercel.
          </div>
        )}

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <label className="block text-sm font-medium" htmlFor="username">Имя пользователя</label>
          <input id="username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className="h-12 w-full rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Личный логин" />
          <label className="block text-sm font-medium" htmlFor="password">
            Пароль
          </label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 w-full rounded-lg border border-input bg-background pl-10 pr-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Пароль приложения"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || needsSetup}
            className="h-12 w-full rounded-lg bg-primary font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {busy ? "Проверяю…" : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
}
