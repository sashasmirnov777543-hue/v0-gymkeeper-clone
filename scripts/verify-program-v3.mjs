import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = JSON.parse(readFileSync(join(root, "lib/program/h2-v9-v3.json"), "utf8"));
const guides = readFileSync(join(root, "lib/exercise-guides.ts"), "utf8");
let fail = 0;
const ok = (c, m, d = "") => { console.log(`${c ? "  OK  " : "ФЕЙЛ "} ${m}${d ? " — " + d : ""}`); if (!c) fail++; };
const abs = (c) => (c.block === "h2" ? c.number : c.number + 9);

console.log("=== 1. КАРКАС ===");
ok(p.version === "h2-v9-3.0", "версия h2-v9-3.0", p.version);
ok(p.durationDays === 176 && p.cycleLengthDays === 8, "176 дней по 8");
ok(p.cycles.length === 22, "22 цикла");
ok(p.cycles.filter(c=>c.block==="h2").length === 9, "9 циклов гипертрофии");
ok(p.cycles.filter(c=>c.block==="v9").length === 13, "13 силовых циклов");
ok(p.cycles.flatMap(c=>c.workouts).length === 88, "88 сессий");
ok(p.cycles.every((c,i)=>c.dayOffset === i*8), "dayOffset непрерывен");
ok(p.cycles.every(c=>c.workouts.map(w=>w.slot).join()==="B1,B2,B3,B4"), "порядок слотов B1-B2-B3-B4");
ok(p.cycles.every(c=>c.workouts.map(w=>w.day).join()==="3,4,7,8"), "дни 3-4-7-8");

console.log("\n=== 2. КОНТРОЛЬНЫЕ ТОЧКИ (Ц1,5,9,14,20 + тест Ц22) ===");
const cps = p.cycles.filter(c=>c.checkpoint).map(c=>abs(c));
ok(JSON.stringify(cps)==="[1,5,9,14,20,22]", "6 точек на правильных циклах", `[${cps}]`);
ok(p.cycles.find(c=>abs(c)===1).checkpoint.type==="baseline_calibration_triple", "Ц1 — базовый замер");
ok(p.cycles.find(c=>abs(c)===22).checkpoint.type==="mutually_exclusive_branch_test", "Ц22 — тест");
const cpIds = cps.map(a=>a<=9?`h2-${a}`:`v9-${a-9}`);
ok(JSON.stringify(cpIds)==='["h2-1","h2-5","h2-9","v9-5","v9-11","v9-13"]', "id точек", cpIds.join(","));

console.log("\n=== 3. RPE: НИ ОДНОГО ПОДХОДА ВЫШЕ 8 ===");
let over=[], calib=[];
for (const c of p.cycles) for (const w of c.workouts) for (const e of w.exercises) {
  if (!e.targetRpe) continue;
  if (e.targetRpe.max > 8.05) over.push(`${e.id}=${e.targetRpe.max}`);
  if (e.role==="calibration"||e.role==="test_triple") calib.push(`${e.id}:${e.targetRpe.min}-${e.targetRpe.max}`);
}
ok(over.length===0, "нет подходов выше RPE 8", over.join(" "));
ok(calib.every(s=>s.endsWith(":8-8")), "все калибровки и тест ровно на RPE 8", `${calib.length} шт`);

console.log("\n=== 4. ДОЗА >=80% RMref ===");
const dose = (list) => list.reduce((s,c)=>s+c.workouts.reduce((t,w)=>t+w.exercises.reduce((u,e)=>{
  if (e.role==="calibration"||e.role==="test_triple") return u+1;
  return u + (e.percent && e.percent.min>=80 ? Number(e.sets) : 0);},0),0),0);
const H=p.cycles.filter(c=>c.block==="h2"), S=p.cycles.filter(c=>c.block==="v9");
const dh=dose(H), ds=dose(S);
console.log(`       гипертрофия ${dh} сетов = ${(dh/(72/7)).toFixed(2)}/нед | сила ${ds} = ${(ds/(104/7)).toFixed(2)}/нед`);
ok(ds/(104/7) >= 3 && ds/(104/7) <= 6, "силовой блок в диапазоне MED 3-6 сетов/нед", (ds/(104/7)).toFixed(2));
ok(dh+ds === 92, "всего 92 сета >=80% (как в расчёте редакции 2.1)", String(dh+ds));

console.log("\n=== 5. УСЛОВНЫЕ СИНГЛЫ (Ц17,19,21 -> v9-8,v9-10,v9-12) ===");
const sing = p.cycles.filter(c=>c.workouts.some(w=>w.exercises.some(e=>e.role==="conditional_single"))).map(c=>c.id);
ok(JSON.stringify(sing)==='["v9-8","v9-10","v9-12"]', "синглы только в v9-8, v9-10, v9-12", sing.join(","));
ok(p.cycles.every(c=>c.workouts.filter(w=>w.slot!=="B2").every(w=>!w.exercises.some(e=>e.role==="conditional_single"))), "синглы только в B2");
const singles = p.cycles.flatMap(c=>c.workouts).flatMap(w=>w.exercises).filter(e=>e.role==="conditional_single");
ok(singles.every(e=>e.percent.min<=92.5), "ни один сингл не выше 92,5% по подписи", `[${singles.map(e=>e.percent.min)}]`);
ok(singles.every(e=>e.exampleKg.min<=106.375), "ни один сингл не выше 92,5% по ШТАНГЕ", `[${singles.map(e=>e.exampleKg.min)}]`);
const peak = singles.find(e=>e.id.startsWith("v9-12"));
ok(peak && peak.condition === "test_branch_c_and_clearance_level_3", "пиковый сингл привязан к ветке C", peak?.condition);

console.log("\n=== 6. КАЛЕНДАРЬ ПИКА совпадает с calendar.ts ===");
const cal = readFileSync(join(root,"lib/program/calendar.ts"),"utf8");
for (const [id,off] of [["v9-11-b2",-16],["v9-11-b4",-12],["v9-12-b2",-8],["v9-12-b4",-4],["v9-13-b1",-1],["v9-13-b2",0],["v9-13-b3",3]]) {
  const exists = p.cycles.flatMap(c=>c.workouts).some(w=>w.id===id);
  const inCal = new RegExp(`"${id}"\\s*:\\s*${off}`).test(cal.replace(/\s+/g," "));
  ok(exists && inCal, `${id} = T${off>=0?"+":""}${off}`);
}

console.log("\n=== 7. ЖИМ В ОБОИХ ЗАЛЬНЫХ ДНЯХ КАЖДОГО ЦИКЛА ===");
const noBench = p.cycles.filter(c=>["B2","B4"].some(s=>{
  const w=c.workouts.find(x=>x.slot===s);
  return !w.exercises.some(e=>/жим лёжа с паузой|Калибровочная тройка|Тестовая тройка|Жим лёжа/.test(e.name));
})).map(c=>c.id);
ok(noBench.length===0, "во всех 22 циклах жим есть и в B2, и в B4", noBench.join(","));

console.log("\n=== 8. ПРОВЕРКА ПРОЦЕНТ -> КИЛОГРАММЫ (RMref 115) ===");
const rnd=(x)=>{const lo=Math.floor(x/2.5)*2.5;return x-lo<=lo+2.5-x?lo:lo+2.5;};
let bad=[];
for (const c of p.cycles) for (const w of c.workouts) for (const e of w.exercises)
  if (e.percent && e.exampleKg) { const exp=rnd(115*e.percent.min/100); if (exp!==e.exampleKg.min) bad.push(`${e.id} ${e.percent.min}%→${e.exampleKg.min} (ожидалось ${exp})`); }
ok(bad.length===0, "все конверсии процент→кг верны", bad.slice(0,3).join("; "));

console.log("\n=== 9. СЛОВАРЬ role, который понимает интерфейс ===");
const roles=[...new Set(p.cycles.flatMap(c=>c.workouts).flatMap(w=>[...w.exercises,...w.branches.flatMap(b=>b.exercises??[])]).map(e=>e.role))].sort();
console.log("       роли:", roles.join(", "));
ok(roles.includes("calibration"), "точная роль calibration (нужна app/stats)");
ok(roles.includes("test_triple"), "точная роль test_triple (нужна app/stats)");
ok(p.cycles.flatMap(c=>c.workouts).flatMap(w=>w.exercises).filter(e=>e.role==="primary_bench").length>0 &&
   roles.filter(r=>r.includes("primary")).length>0, "есть роли с подстрокой primary (оранжевый светофор)");
ok(roles.includes("secondary_press"), "есть secondary (патч stopSecondaryPressing)");
ok(roles.includes("conditional_single"), "conditional_single содержит conditional и single");
ok(roles.includes("direct_1rm_test"), "direct_1rm_test для ветки теста");
const cardioRoles=[...new Set(p.cycles.flatMap(c=>c.workouts).filter(w=>w.kind==="cardio").flatMap(w=>w.exercises).map(e=>e.role))];
ok(cardioRoles.length===1 && cardioRoles[0]==="rehab", "на кардио-днях только роль rehab", cardioRoles.join(","));

console.log("\n=== 10. КАЖДОЕ УПРАЖНЕНИЕ ИМЕЕТ ГАЙД ===");
const kw=[...guides.matchAll(/keywords:\s*\[([^\]]+)\]/g)].flatMap(m=>[...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1].toLowerCase()));
const names=[...new Set(p.cycles.flatMap(c=>c.workouts).flatMap(w=>[...w.exercises,...w.branches.flatMap(b=>b.exercises??[])]).map(e=>e.name))];
const miss=names.filter(n=>!kw.some(k=>n.toLowerCase().includes(k)));
ok(miss.length===0, `все ${names.length} названий находят гайд`, miss.join(" | "));

console.log("\n=== 11. RPE СЧИТАЕТСЯ ОТ ШТАНГИ, А НЕ ОТ ПОДПИСИ ===");
// В редакции 2.0 rpeOf() получал номинальный процент, kg() округлял отдельно,
// и они никогда не сверялись: 37 упражнений расходились больше чем на 0,35 п.п.
const RPES=[6,6.5,7,7.5,8,8.5,9,9.5,10];
const T={1:[86.3,87.8,89.2,90.7,92.2,93.9,95.5,97.8,100],2:[83.7,85,86.3,87.8,89.2,90.7,92.2,93.9,95.5],
         3:[81.1,82.4,83.7,85,86.3,87.8,89.2,90.7,92.2],4:[78.6,79.9,81.1,82.4,83.7,85,86.3,87.8,89.2],
         5:[76.2,77.4,78.6,79.9,81.1,82.4,83.7,85,86.3]};
const firstRpe=(reps,pct)=>{const row=T[reps]; if(!row||pct<row[0])return null;
  for(let i=0;i<row.length-1;i++) if(pct>=row[i]&&pct<=row[i+1])
    return RPES[i]+((pct-row[i])/(row[i+1]-row[i]))*(RPES[i+1]-RPES[i]);
  return 10;};
let rpeBad=[], scaleBad=[], noteBad=[];
for (const c of p.cycles) for (const w of c.workouts) for (const e of w.exercises) {
  const kg = e.exampleKg?.min ?? null;
  const sets = Number.parseInt(e.sets,10), reps = Number.parseInt(e.reps,10);
  if (kg!==null && T[reps] && Number.isFinite(sets)) {
    const f = firstRpe(reps, 100*kg/115);
    if (f===null) { if (e.targetRpe) scaleBad.push(`${e.id} ниже шкалы, но с целью`); }
    else if (!e.targetRpe) scaleBad.push(`${e.id} в шкале, но без цели`);
    else {
      const a=Math.round(f*10)/10, z=Math.round((f+0.35*(sets-1))*10)/10;
      if (Math.abs(e.targetRpe.min-a)>0.06||Math.abs(e.targetRpe.max-z)>0.06)
        rpeBad.push(`${e.id}: ${e.targetRpe.min}-${e.targetRpe.max} вместо ${a}-${z}`);
    }
  }
  for (const n of e.notes ?? []) for (const m of n.matchAll(/около (\d+(?:,\d+)?)/g)) {
    const v = Number.parseFloat(m[1].replace(",","."));
    if (!e.targetRpe || (Math.abs(v-e.targetRpe.min)>0.06 && Math.abs(v-e.targetRpe.max)>0.06))
      noteBad.push(`${e.id}: заметка ${v}, цель ${e.targetRpe?.min}-${e.targetRpe?.max}`);
  }
}
ok(rpeBad.length===0, "целевой RPE совпадает с расчётом от веса", rpeBad.slice(0,3).join("; "));
ok(scaleBad.length===0, "ниже шкалы цели нет, внутри шкалы цель есть", scaleBad.slice(0,3).join("; "));
ok(noteBad.length===0, "текст заметок не расходится с targetRpe", noteBad.slice(0,3).join("; "));
const below = p.cycles.flatMap(c=>c.workouts).flatMap(w=>w.exercises).filter(e=>e.belowScale);
console.log(`       ниже шкалы: ${below.length} подходов, все без числовой цели`);

console.log("\n=== 12. ПОТОЛОК ДОПУСКА СЧИТАЕТСЯ ПО ШТАНГЕ ===");
const overCeil = p.cycles.flatMap(c=>c.workouts).flatMap(w=>w.exercises)
  .filter(e=>(e.exampleKg?.max ?? 0) > 106.375)
  .map(e=>`${e.id}=${e.exampleKg.max}кг (${(100*e.exampleKg.max/115).toFixed(1)}%)`);
ok(overCeil.length===0, "ни один вес не выше 92,5% RMref = 106,375 кг", overCeil.join("; "));

console.log("\n=== 13. НИ ОДИН СИЛОВОЙ ЦИКЛ НЕ ПОВТОРЯЕТ ДРУГОЙ ===");
// Так редакция 2.0 теряла прогрессию: Ц12 повторялся в Ц15, Ц13 — в Ц16.
const benchRoles=new Set(["primary_bench","primary_backoff","conditional_single","primer_single"]);
const seen=new Map(); let dups=[];
for (const c of p.cycles.filter(c=>c.block==="v9" && !c.checkpoint)) {
  const sig=c.workouts.filter(w=>w.kind==="strength").map(w=>`${w.slot}:`+
    w.exercises.filter(e=>benchRoles.has(e.role)).map(e=>`${e.sets}x${e.reps}@${e.exampleKg?.min}`).join(",")).join("|");
  if (seen.has(sig)) dups.push(`${c.id} == ${seen.get(sig)}`);
  seen.set(sig,c.id);
}
ok(dups.length===0, "13 силовых циклов, все уникальны", dups.join("; "));

console.log("\n=== 14. КАРДИО: ДЛИННАЯ Z2 ПЕРЕД ЛЁГКИМ ДНЁМ ===");
let cardioBad=[];
for (const c of p.cycles) {
  const b1=c.workouts.find(w=>w.slot==="B1"), b3=c.workouts.find(w=>w.slot==="B3");
  if (b1.cardio?.zone==="Z2") cardioBad.push(`${c.id} B1 идёт в Z2`);
  if (c.id!=="v9-13" && (b1.duration?.max ?? 0) > (b3.duration?.max ?? 0))
    cardioBad.push(`${c.id} B1 ${b1.duration?.max} > B3 ${b3.duration?.max}`);
}
ok(cardioBad.length===0, "перед главным жимовым днём только короткое Z1", cardioBad.join("; "));

console.log("\n=== 15. РЕАБ-БЛОК ПРОХОДИТ ШЕСТЬ СТУПЕНЕЙ ===");
const stages=new Map();
for (const c of p.cycles) for (const w of c.workouts.filter(w=>w.kind==="cardio")) {
  const sig=w.exercises.map(e=>`${e.key}:${e.sets}x${e.reps}`).join("|");
  if (!stages.has(sig)) stages.set(sig, []);
  stages.get(sig).push(c.id);
}
ok(stages.size===6, "шесть различных ступеней вместо одной неизменной", `найдено ${stages.size}`);
const order=[...stages.values()];
let monotone=true;
for (let i=1;i<p.cycles.length;i++) {
  const prev=order.findIndex(l=>l.includes(p.cycles[i-1].id));
  const cur=order.findIndex(l=>l.includes(p.cycles[i].id));
  if (cur<prev) monotone=false;
}
ok(monotone, "ступень не откатывается по ходу программы");

console.log(`\n${fail===0?"ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ":"ПРОВАЛОВ: "+fail}`);
process.exit(fail?1:0);
