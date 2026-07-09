import { NextResponse } from "next/server";
import webpush from "web-push";
import { waitUntil } from "@vercel/functions";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
// Функция живёт до 5 минут — ждём конца отдыха прямо на сервере.
export const maxDuration = 300;

const MAX_WAIT_MS = 290_000;
const VAPID_SUBJECT = "mailto:gymkeeper@viktor.com";
// Серия пушей в конце отдыха: часы вибрируют несколько раз, а не один
// (одиночный сигнал легко пропустить).
const BURST_COUNT = 3;
const BURST_GAP_MS = 1600;

let initPromise: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  initPromise ??= (async () => {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS push_meta (key text PRIMARY KEY, value text NOT NULL)`,
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS push_schedules (
        endpoint text PRIMARY KEY,
        subscription text NOT NULL,
        end_at bigint NOT NULL,
        title text NOT NULL DEFAULT '',
        body text NOT NULL,
        client_ts bigint NOT NULL
      )`,
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS push_log (
        id serial PRIMARY KEY,
        at timestamptz NOT NULL DEFAULT now(),
        event text NOT NULL,
        detail text NOT NULL DEFAULT ''
      )`,
    );
  })();
  return initPromise;
}

async function getVapidKeys(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  await ensureTables();
  const read = async () => {
    const r = await pool.query(
      `SELECT key, value FROM push_meta WHERE key IN ('vapid_public','vapid_private')`,
    );
    const map = new Map<string, string>(
      r.rows.map((row) => [row.key, row.value]),
    );
    const publicKey = map.get("vapid_public");
    const privateKey = map.get("vapid_private");
    return publicKey && privateKey ? { publicKey, privateKey } : null;
  };
  let keys = await read();
  if (!keys) {
    const gen = webpush.generateVAPIDKeys();
    await pool.query(
      `INSERT INTO push_meta (key, value) VALUES ('vapid_public',$1),('vapid_private',$2)
       ON CONFLICT (key) DO NOTHING`,
      [gen.publicKey, gen.privateKey],
    );
    keys = await read();
  }
  if (!keys) throw new Error("vapid keys unavailable");
  return keys;
}

/** Публичная часть API отдаёт только VAPID-ключ; журнал наружу не публикуется. */
export async function GET() {
  const { publicKey } = await getVapidKeys();
  return NextResponse.json({ publicKey });
}

async function log(event: string, detail = "") {
  try {
    await pool.query(`INSERT INTO push_log (event, detail) VALUES ($1, $2)`, [
      event,
      detail.slice(0, 500),
    ]);
  } catch {
    // журнал не должен ломать доставку
  }
}

async function deliverAt(endpoint: string, endAt: number, clientTs: number) {
  const delay = Math.min(Math.max(0, endAt - Date.now()), MAX_WAIT_MS);
  await new Promise((r) => setTimeout(r, delay));
  // Перечитываем расписание: если его отменили или заменили новым — молчим.
  const r = await pool.query(
    `SELECT subscription, title, body, end_at, client_ts FROM push_schedules WHERE endpoint = $1`,
    [endpoint],
  );
  const row = r.rows[0];
  if (
    !row ||
    Number(row.client_ts) !== clientTs ||
    Number(row.end_at) !== endAt
  ) {
    await log("skip", `superseded or cancelled (endAt=${endAt})`);
    return;
  }
  await pool.query(
    `DELETE FROM push_schedules WHERE endpoint = $1 AND client_ts = $2`,
    [endpoint, clientTs],
  );
  const { publicKey, privateKey } = await getVapidKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  const sub = JSON.parse(row.subscription);
  const payload = JSON.stringify({
    title: row.title || "Время! Следующий подход",
    body: row.body,
    tag: "gym-rest-timer",
  });
  // Серия из нескольких пушей подряд: один тег + renotify в service worker —
  // на телефоне это одно уведомление, но каждый пуш повторяет сигнал, и часы
  // вибрируют несколько раз.
  for (let i = 0; i < BURST_COUNT; i++) {
    try {
      await webpush.sendNotification(sub, payload, {
        TTL: 1800,
        urgency: "high",
      });
      await log(
        "sent",
        `burst ${i + 1}/${BURST_COUNT} endAt=${endAt} body=${row.body}`,
      );
    } catch (e) {
      await log("send_error", String(e));
      break;
    }
    if (i < BURST_COUNT - 1) {
      await new Promise((res) => setTimeout(res, BURST_GAP_MS));
    }
  }
}

type ScheduleBody = {
  action: "schedule";
  subscription: { endpoint: string };
  endAt: number;
  title?: string;
  body: string;
  clientTs: number;
};
type CancelBody = { action: "cancel"; endpoint: string; clientTs: number };

export async function POST(req: Request) {
  let data: ScheduleBody | CancelBody;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  await ensureTables();

  if (data.action === "cancel") {
    if (!data.endpoint || typeof data.clientTs !== "number") {
      return NextResponse.json({ error: "bad cancel" }, { status: 400 });
    }
    // end_at=0 гасит ожидающую доставку; client_ts защищает от гонок —
    // более новое расписание (с большим ts) отмена не перетирает.
    await pool.query(
      `UPDATE push_schedules SET end_at = 0, client_ts = $2
       WHERE endpoint = $1 AND client_ts < $2`,
      [data.endpoint, data.clientTs],
    );
    await log("cancel", "");
    return NextResponse.json({ ok: true });
  }

  if (data.action === "schedule") {
    const { subscription, endAt, title, body, clientTs } = data;
    if (
      !subscription?.endpoint ||
      typeof endAt !== "number" ||
      typeof body !== "string" ||
      typeof clientTs !== "number"
    ) {
      return NextResponse.json({ error: "bad schedule" }, { status: 400 });
    }
    await pool.query(
      `INSERT INTO push_schedules (endpoint, subscription, end_at, title, body, client_ts)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE
         SET subscription = EXCLUDED.subscription,
             end_at = EXCLUDED.end_at,
             title = EXCLUDED.title,
             body = EXCLUDED.body,
             client_ts = EXCLUDED.client_ts
       WHERE push_schedules.client_ts < EXCLUDED.client_ts`,
      [
        subscription.endpoint,
        JSON.stringify(subscription),
        endAt,
        title ?? "",
        body,
        clientTs,
      ],
    );
    await log(
      "schedule",
      `in=${Math.round((endAt - Date.now()) / 1000)}s title=${title ?? ""} body=${body}`,
    );
    // Доставка идёт в фоне после ответа клиенту.
    waitUntil(deliverAt(subscription.endpoint, endAt, clientTs));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
