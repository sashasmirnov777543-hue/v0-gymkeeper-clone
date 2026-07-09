const COOKIE_NAME = "gym_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export { COOKIE_NAME, SESSION_TTL_SECONDS };
const enc = new TextEncoder();
function ownerName() { return process.env.APP_USERNAME?.trim() || "owner" }
function secret() { return process.env.SESSION_SECRET?.trim() || null }
function password() { return process.env.APP_PASSWORD?.trim() || null }
function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,"0")).join("") }
async function sign(value: string) {
 const key=await crypto.subtle.importKey("raw",enc.encode(secret()!),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(await crypto.subtle.sign("HMAC",key,enc.encode(value)));
}
function safeEqual(a:string,b:string){let d=a.length^b.length,n=Math.max(a.length,b.length);for(let i=0;i<n;i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0}
export function isPasswordConfigured(){return Boolean(password() && secret() && secret()!.length>=32)}
export function verifyCredentials(username:string,candidate:string){return isPasswordConfigured()&&safeEqual(username.trim().toLocaleLowerCase(),ownerName().toLocaleLowerCase())&&safeEqual(candidate,password()!)}
export async function createSessionToken(){if(!isPasswordConfigured())return null;const exp=Math.floor(Date.now()/1000)+SESSION_TTL_SECONDS;const payload=`${ownerName()}:${exp}`;return `${payload}:${await sign(payload)}`}
export async function verifySessionToken(token?:string){if(!token||!isPasswordConfigured())return false;const parts=token.split(":");if(parts.length<3)return false;const sig=parts.pop()!,exp=Number(parts.pop()),name=parts.join(":");if(!Number.isFinite(exp)||exp<Math.floor(Date.now()/1000)||!safeEqual(name,ownerName()))return false;return safeEqual(sig,await sign(`${name}:${exp}`))}
