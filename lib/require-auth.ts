import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";
export async function requireAuth(): Promise<void> {
 const store=await cookies();
 if (!(await verifySessionToken(store.get(COOKIE_NAME)?.value))) throw new Error("UNAUTHORIZED");
}
