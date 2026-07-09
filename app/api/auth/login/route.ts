import { NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_TTL_SECONDS, createSessionToken, isPasswordConfigured, verifyCredentials } from "@/lib/auth";
const attempts=new Map<string,{count:number;reset:number}>();
export async function POST(request: Request) {
 if(!isPasswordConfigured()) return NextResponse.json({error:"Задайте APP_PASSWORD, APP_USERNAME и SESSION_SECRET (не менее 32 символов)."},{status:503});
 const ip=request.headers.get("x-forwarded-for")?.split(",")[0]||"local", now=Date.now();
 const state=attempts.get(ip); if(state&&state.reset>now&&state.count>=5) return NextResponse.json({error:"Слишком много попыток. Повторите через 15 минут."},{status:429});
 let username="",password=""; try{const b=await request.json();username=typeof b.username==="string"?b.username:"";password=typeof b.password==="string"?b.password:""}catch{return NextResponse.json({error:"Некорректный запрос"},{status:400})}
 if(!verifyCredentials(username,password)){const cur=state&&state.reset>now?state:{count:0,reset:now+15*60_000};cur.count++;attempts.set(ip,cur);return NextResponse.json({error:"Неверное имя или пароль"},{status:401})}
 attempts.delete(ip); const token=await createSessionToken(); const response=NextResponse.json({ok:true});
 response.cookies.set(COOKIE_NAME,token!,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:SESSION_TTL_SECONDS});return response;
}
