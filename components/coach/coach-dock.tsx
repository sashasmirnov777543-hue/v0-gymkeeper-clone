"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  Check,
  ChevronDown,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type UiMessage = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  questions?: string[];
  createdAt?: string;
};

type UiProposal = {
  id: number;
  kind: string;
  status: string;
  target: string;
  title: string;
  rationale: string;
  patch: Record<string, unknown>;
  safety: {
    readinessLevel?: string;
    respectsProgramInvariants?: boolean;
    warnings?: string[];
  };
  expiresAt?: string | null;
};

const CONSENT_KEY = "gym:gemini-coach-consent-v1";

export function CoachDock() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState("gemini-3.5-flash");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [proposals, setProposals] = useState<UiProposal[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConsent(localStorage.getItem(CONSENT_KEY) === "accepted");
  }, []);

  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    fetch("/api/coach", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить чат");
        return response.json();
      })
      .then((data) => {
        setConfigured(Boolean(data.configured));
        setModel(data.model ?? "gemini-3.5-flash");
        setMessages(
          (data.messages ?? []).map((message: Record<string, unknown>) => ({
            id: Number(message.id),
            role: message.role === "user" ? "user" : "assistant",
            content: String(message.content ?? ""),
            createdAt: String(message.createdAt ?? ""),
            questions:
              message.metadata && typeof message.metadata === "object"
                ? ((message.metadata as { questions?: string[] }).questions ?? [])
                : [],
          })),
        );
        setProposals(data.proposals ?? []);
        setLoaded(true);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [open, loaded]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, proposals]);

  if (pathname === "/login") return null;

  function acceptConsent() {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setConsent(true);
  }

  async function sendMessage(text = input) {
    const message = text.trim();
    if (!message || loading || !consent) return;
    setOpen(true);
    setInput("");
    setError(null);
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Gemini не ответил");
      setMessages((current) => [
        ...current,
        {
          id: data.assistant?.id,
          role: "assistant",
          content: data.assistant?.content ?? "Ответ не получен",
          questions: data.assistant?.questions ?? [],
        },
      ]);
      if (data.proposal) {
        setProposals((current) => [data.proposal, ...current]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить сообщение");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  async function decideProposal(id: number, action: "confirm" | "reject") {
    setError(null);
    try {
      const response = await fetch(`/api/coach/proposals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось обработать предложение");
      setProposals((current) => current.filter((proposal) => proposal.id !== id));
      router.refresh();
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            action === "confirm"
              ? "Корректировка подтверждена и записана. Каноническая программа не была переписана."
              : "Корректировка отклонена и не применялась.",
        },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка");
    }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[80] bg-black/70 px-0 pt-8 sm:p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Чат с Gemini 3.5 Flash"
            className="mx-auto flex h-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:h-[min(820px,calc(100dvh-2rem))] sm:rounded-2xl"
          >
            <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
              <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Gemini 3.5 Flash · тренер</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {configured === false ? "Нужен API-ключ" : model} · изменения только после подтверждения
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-10 place-items-center rounded-full hover:bg-secondary"
                aria-label="Свернуть чат"
              >
                <ChevronDown className="size-5" />
              </button>
            </header>

            {!consent ? (
              <div className="flex flex-1 flex-col justify-center p-6">
                <div className="rounded-2xl border border-primary/30 bg-card p-5">
                  <ShieldCheck className="size-7 text-primary" />
                  <h3 className="mt-3 text-lg font-bold">Перед первым сообщением</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Текст чата и необходимый контекст тренировок будут отправляться в Google AI Studio для ответа Gemini. API-ключ остаётся только на сервере. Не отправляйте лишние персональные данные. Gemini не заменяет врача, а любые изменения программы появляются отдельным черновиком и требуют вашего нажатия «Подтвердить».
                  </p>
                  <button
                    type="button"
                    onClick={acceptConsent}
                    className="mt-4 min-h-12 w-full rounded-lg bg-primary px-4 font-semibold text-primary-foreground"
                  >
                    Понимаю, включить чат
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
                  {messages.length === 0 && !loading && (
                    <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                      Спросите о сегодняшней тренировке, восстановлении, технике, кардио или любом другом вопросе. Помощник видит структуру всей H2→V9, но не меняет её самостоятельно.
                    </div>
                  )}
                  <div className="space-y-3">
                    {messages.map((message, index) => (
                      <div
                        key={`${message.id ?? "local"}-${index}`}
                        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            message.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "border border-border bg-card"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{message.content}</p>
                          {message.questions && message.questions.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {message.questions.map((question) => (
                                <button
                                  key={question}
                                  type="button"
                                  onClick={() => void sendMessage(question)}
                                  className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-foreground"
                                >
                                  {question}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {proposals.map((proposal) => (
                    <article
                      key={proposal.id}
                      className="mt-4 rounded-2xl border-2 border-warning/50 bg-warning/10 p-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-warning">
                        Требуется подтверждение
                      </p>
                      <h3 className="mt-1 font-bold">{proposal.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {proposal.rationale}
                      </p>
                      <dl className="mt-3 rounded-lg bg-background/70 p-3 text-xs">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Цель</dt>
                          <dd className="font-mono">{proposal.target}</dd>
                        </div>
                        {Object.entries(proposal.patch).map(([key, value]) => (
                          <div key={key} className="mt-1 flex justify-between gap-3">
                            <dt className="text-muted-foreground">{key}</dt>
                            <dd className="max-w-[60%] text-right font-mono">
                              {typeof value === "string" ? value : JSON.stringify(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void decideProposal(proposal.id, "reject")}
                          className="min-h-11 rounded-lg border border-border bg-background px-3 font-medium"
                        >
                          Отклонить
                        </button>
                        <button
                          type="button"
                          onClick={() => void decideProposal(proposal.id, "confirm")}
                          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 font-semibold text-primary-foreground"
                        >
                          <Check className="size-4" /> Подтвердить
                        </button>
                      </div>
                    </article>
                  ))}

                  {loading && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Gemini обдумывает ответ…
                    </div>
                  )}
                  {error && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      <X className="mt-0.5 size-4 shrink-0" /> {error}
                    </div>
                  )}
                  <div ref={endRef} />
                </div>

                <form onSubmit={submit} className="border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <div className="flex items-end gap-2 rounded-xl border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      rows={1}
                      maxLength={6000}
                      placeholder="Спросить Gemini 3.5 Flash…"
                      className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
                    />
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
                      aria-label="Отправить"
                    >
                      <Send className="size-4" />
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}

      {!open && (
        <form
          onSubmit={submit}
          className="fixed inset-x-0 bottom-[4.9rem] z-[70] mx-auto flex max-w-lg gap-2 px-3 pb-2 pointer-events-none"
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="pointer-events-auto grid size-12 shrink-0 place-items-center rounded-full border border-primary/40 bg-card text-primary shadow-xl"
            aria-label="Открыть Gemini-тренера"
          >
            <Bot className="size-5" />
          </button>
          <div className="pointer-events-auto flex min-w-0 flex-1 items-center rounded-full border border-border bg-card p-1.5 pl-4 shadow-xl">
            <input
              value={input}
              onFocus={() => setOpen(true)}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Спросить Gemini 3.5 Flash…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label="Сообщение Gemini-тренеру"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Отправить"
            >
              <Send className="size-4" />
            </button>
          </div>
        </form>
      )}
    </>
  );
}
