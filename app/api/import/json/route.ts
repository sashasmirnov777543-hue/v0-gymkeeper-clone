import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

const TABLES = ["cycles","workouts","workout_exercises","sessions","logged_sets","app_settings","tm_recalc_events","tm_change_history"] as const;
const q=(v:string)=>`"${v.replaceAll('"','""')}"`;
export async function POST(request: Request) {
  let backup: {format?:string;version?:number;tables?:Record<string,unknown[]>};
  try { backup=await request.json() } catch { return NextResponse.json({error:"Некорректный JSON"},{status:400}) }
  if(backup.format!=="gymkeeper-backup"||backup.version!==1||!backup.tables) return NextResponse.json({error:"Это не резервная копия GymKeeper v1"},{status:400});
  for(const name of Object.keys(backup.tables)) if(!TABLES.includes(name as never)) return NextResponse.json({error:`Недопустимая таблица: ${name}`},{status:400});
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    for(const name of [...TABLES].reverse()) await client.query(`DELETE FROM ${q(name)}`);
    for(const name of TABLES){
      const rows=backup.tables[name]??[]; if(!Array.isArray(rows)) throw new Error(`Некорректная таблица ${name}`);
      const cols=(await client.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[name])).rows.map(x=>x.column_name);
      for(const raw of rows){ if(!raw||typeof raw!=="object"||Array.isArray(raw)) throw new Error(`Некорректная строка ${name}`); const row=raw as Record<string,unknown>; const keys=Object.keys(row); if(keys.some(k=>!cols.includes(k))) throw new Error(`Неизвестная колонка в ${name}`); if(!keys.length) continue; await client.query(`INSERT INTO ${q(name)} (${keys.map(q).join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`,keys.map(k=>row[k])); }
      const seq=await client.query<{seq:string|null}>("SELECT pg_get_serial_sequence($1,'id') AS seq",[name]); if(seq.rows[0]?.seq) await client.query(`SELECT setval($1, COALESCE((SELECT MAX(id) FROM ${q(name)}),1), true)`,[seq.rows[0].seq]);
    }
    await client.query("COMMIT"); return NextResponse.json({ok:true});
  } catch(e){await client.query("ROLLBACK");return NextResponse.json({error:e instanceof Error?e.message:"Ошибка восстановления"},{status:400})} finally {client.release()}
}
