// Runs the prototype's own math code (extracted from reference/funnel-mapper.html) on its built-in
// templates and writes the results to tests/fixtures/prototype-results.json.
// The Vitest suite compares lib/funnel-math.ts against these numbers.
//   node scripts/gen-prototype-fixtures.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const html = readFileSync(new URL("../reference/funnel-mapper.html", import.meta.url), "utf8");
const slice = (start, end) => {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`marker not found: ${start} / ${end}`);
  return html.slice(a, b);
};

const code = [
  slice("const CATS=", "/* ================= state"),
  "const num=v=>{const n=parseFloat(v);return isFinite(n)?n:0};",
  "let uid=1;const nid=()=>'n'+(uid++).toString(36);",
  "const blank=()=>({v:2,name:'Untitled funnel',cur:'£',basis:'first',fixed:0,whatif:{traffic:1,conv:1},target:0,nodes:[],edges:[],view:{x:60,y:40,k:1}});",
  "let S=blank();",
  "const byId=()=>Object.fromEntries(S.nodes.map(n=>[n.id,n]));",
  slice("function trafficVals", "let R=compute();"),
  slice("function warnings()", "function inspReportBody"),
  slice("function tpl(", "/* ================= boot"),
  // layout: stub DOM-dependent helpers (fixed node height, synchronous animation)
  "const nodeH=()=>NH;const opts={snap:true};const snap=v=>opts.snap?Math.round(v/11)*11:Math.round(v);",
  "const toast=()=>{};const renderAll=()=>{};const save=()=>{};const fit=()=>{};",
  "function animateTo(target,done){const B=byId();Object.keys(target).forEach(id=>{B[id].x=target[id][0];B[id].y=target[id][1]});done()}",
  slice("function tidy(){", "function animateTo"),
  "return {compute,warnings,template,tidy,setS:v=>{S=v},getS:()=>S,offerVals};",
].join("\n");

const P = new Function(code)();

const enc = (v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v);
const TOTALS = ["traffic", "paidTraffic", "spend", "actCost", "leads", "cust", "orders", "rev", "cash", "ltv", "cogs", "mrr", "goals", "calls", "subs", "fixed", "costs", "profit", "aov", "cpa", "cpl", "roas", "epc", "conv", "cpc", "roi", "ltvc", "beroas"];

const variants = [
  { key: "default", basis: "first", fixed: 0, whatif: { traffic: 1, conv: 1 } },
  { key: "ltv", basis: "ltv", fixed: 0, whatif: { traffic: 1, conv: 1 } },
  { key: "fixed-whatif", basis: "first", fixed: 750, whatif: { traffic: 1.5, conv: 0.8 } },
  { key: "ltv-whatif", basis: "ltv", fixed: 200, whatif: { traffic: 0.5, conv: 1.75 } },
];

const out = {};
for (const t of ["tripwire", "quiz", "webinar", "call", "sub"]) {
  const base = P.template(t);
  out[t] = { name: base.name, variants: {} };
  for (const v of variants) {
    const S = { ...P.template(t), basis: v.basis, fixed: v.fixed, whatif: v.whatif };
    P.setS(S);
    const R = P.compute();
    const totals = Object.fromEntries(TOTALS.map((k) => [k, enc(R[k])]));
    const nodes = S.nodes.map((n) => ({ type: n.type, name: n.name, ...Object.fromEntries(Object.entries(R.N[n.id]).map(([k, x]) => [k, enc(x)])) }));
    const flows = S.edges.map((e) => enc(R.flows[e.id] ?? null));
    const sources = S.nodes
      .filter((n) => TYPES_CAT(n.type) === "traffic")
      .map((n) => {
        const x = P.compute(n.id);
        return { name: n.name, traffic: enc(x.traffic), cust: enc(x.cust), rev: enc(x.rev), spend: enc(x.spend) };
      });
    out[t].variants[v.key] = { settings: v, totals, nodes, flows, sources, warnings: P.warnings() };
  }
}
function TYPES_CAT(type) {
  // reuse the prototype catalog via a compute-free lookup
  return new Function(slice("const CATS=", "/* ================= state") + "\nreturn TYPES;")()[type].cat;
}

// tidy fixtures: positions after Tidy up, plus a scrambled variant
for (const t of ["tripwire", "quiz", "webinar", "call", "sub"]) {
  const S = P.template(t);
  P.setS(S);
  P.tidy();
  out[t].tidy = S.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w ?? null, h: n.h ?? null }));
  const S2 = P.template(t);
  S2.nodes.forEach((n, i) => { n.x = (i * 137) % 900; n.y = (i * 251) % 700; });
  out[t].scrambled = S2.nodes.map((n) => ({ x: n.x, y: n.y }));
  P.setS(S2);
  P.tidy();
  out[t].tidyScrambled = S2.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w ?? null, h: n.h ?? null }));
}

mkdirSync(new URL("../tests/fixtures/", import.meta.url), { recursive: true });
// A file exactly as the prototype's "Export funnel (.json)" writes it: {...S, app:'funnel-mapper'}
{
  const S = { ...P.template("webinar"), cur: "$", basis: "ltv", fixed: 250, whatif: { traffic: 1.2, conv: 0.9 }, target: 20000 };
  // include a v1-style edge flag to prove migration (no port, no:true)
  S.edges = S.edges.map((e) => {
    if (e.port !== "alt") return e;
    const v1 = { ...e, no: true };
    delete v1.port;
    return v1;
  });
  P.setS({ ...S, edges: S.edges.map((e) => ({ ...e, port: e.no ? "alt" : e.port })) });
  const R = P.compute();
  writeFileSync(new URL("../tests/fixtures/prototype-export-webinar.json", import.meta.url), JSON.stringify({ ...S, app: "funnel-mapper" }, null, 1) + "\n");
  out.webinar.exportTotals = { rev: R.rev, profit: R.profit, cust: R.cust, spend: R.spend };
}
writeFileSync(new URL("../tests/fixtures/prototype-results.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log("wrote tests/fixtures/prototype-results.json for", Object.keys(out).join(", "));
