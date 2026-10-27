import { performance } from "node:perf_hooks";
import knex from "knex";
import { upsertAnalyticsRows } from "../../lib/analytics-upsert.js";

// Synthetic local SQLite comparison; not an estimate of production latency.
const database = knex({ client:"better-sqlite3", connection:{filename:":memory:"}, useNullAsDefault:true });
const counters=["status_code_2xx","status_code_3xx","status_code_4xx","status_code_5xx","bytes_sent","request_count"];
const conflict=["aggregation_key","aggregation_timestamp","aggregation_generation"];
const model={tableName:"analytic_count",transaction:callback=>database.transaction(callback)};
const rows=Array.from({length:500},(_,index)=>({aggregation_key:`host:${index}`,aggregation_timestamp:"2026-10-17 12:00:00",aggregation_generation:1,...Object.fromEntries(counters.map(column=>[column,column==="bytes_sent"?1024:1]))}));
let inserts=0;
database.on("query",query=>{if(/^insert /i.test(query.sql))inserts++;});
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
try {
 await database.schema.createTable("analytic_count",table=>{table.string("aggregation_key");table.string("aggregation_timestamp");table.integer("aggregation_generation");for(const column of counters)table.integer(column).defaultTo(0);table.unique(conflict);});
 const original=()=>database.transaction(async trx=>{
  const merge=Object.fromEntries(counters.map(column=>[column,trx.raw("coalesce(??,0)+excluded.??",[`analytic_count.${column}`,column])]));
  for(const row of rows)await trx("analytic_count").insert(row).onConflict(conflict).merge(merge);
 });
 const results={};
 for(const [name,run] of [["individual",original],["batch",()=>upsertAnalyticsRows(model,rows)]]){
  const samples=[];const statements=[];
  for(let iteration=0;iteration<8;iteration++){
   await database("analytic_count").delete();inserts=0;
   const start=performance.now();await run();await run();const elapsed=performance.now()-start;
   const stored=await database("analytic_count");
   if(stored.length!==500||stored.some(row=>row.request_count!==2||row.bytes_sent!==2048))throw new Error("Counters differ");
   if(iteration){samples.push(elapsed);statements.push(inserts);}
  }
  results[name]={samples_ms:samples,median_ms:median(samples),inserts_for_two_flushes:statements};
 }
 console.log(JSON.stringify({node:process.version,engine:"SQLite :memory:",rows:500,flushes_per_sample:2,warmups:1,results},null,2));
} finally {await database.destroy();}
