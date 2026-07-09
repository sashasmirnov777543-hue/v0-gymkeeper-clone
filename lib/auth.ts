const COOKIE_NAME = "gym_session";
const SESSION_PAYLOAD = "gymkeeper:authenticated:v1";

export { COOKIE_NAME };

function password(): string | null {
  const value = process.env.APP_PASSWORD?.trim();
  return value ? value : null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

/** Стабильный токен сессии. Пароль никогда не сохраняется в cookie. */
export async function expectedSessionToken(): Promise<string | null> {
  const value = password();
  return value ? sha256(`${SESSION_PAYLOAD}:${value}`) : null;
}

/** Сравнение без раннего выхода по первому отличающемуся символу. */
function safeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function isPasswordConfigured(): boolean {
  return password() != null;
}

export function verifyPassword(candidate: string): boolean {
  const value = password();
  return value != null && safeEqual(candidate, value);
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const expected = await expectedSessionToken();
  return expected != null && safeEqual(token, expected);
}
