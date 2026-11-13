#!/usr/bin/env node
// Matching report for moving Funnel Mapper's existing clients onto the shared ecosystem client list (Design V7 D1; plan stage 2).
// Offline and read-only: it compares two exported lists and prints a report for the owner's approval. It links, merges or writes nothing.
//   node scripts/fmp-client-match.mjs <funnel-mapper-clients.json> <ecosystem-clients.json> [--md out.md]
// Each file: a JSON array of { id, name, business_name?, email? } (export with a SELECT from each database; never commit real exports).
// Classes (same rules as the live "New client" check, packages/core/fmp-operations.mjs):
//   email_exact  one ecosystem client with the same e-mail (trimmed, lower case) → proposed link, still needs the owner's yes
//   ambiguous    several ecosystem clients share that e-mail → the owner chooses
//   name_review  no e-mail match, but the same name or business name → review; never linked by name alone
//   new          no candidate → becomes a new ecosystem client
import { readFileSync, writeFileSync } from 'node:fs';
import { normEmail, normName } from '../packages/core/fmp-operations.mjs';

export function matchReport(fmpClients, ecoClients) {
  const byEmail = new Map(); const byName = new Map();
  for (const e of ecoClients) {
    const em = normEmail(e.email); if (em) byEmail.set(em, [...(byEmail.get(em) ?? []), e]);
    for (const n of new Set([normName(e.name), normName(e.business_name)].filter(Boolean))) byName.set(n, [...(byName.get(n) ?? []), e]);
  }
  return fmpClients.map((f) => {
    const em = normEmail(f.email); const hits = em ? (byEmail.get(em) ?? []) : [];
    if (hits.length === 1) return { fmp: f, class: 'email_exact', candidates: hits };
    if (hits.length > 1) return { fmp: f, class: 'ambiguous', candidates: hits };
    const names = [...new Map([normName(f.name), normName(f.business_name)].filter(Boolean).flatMap((n) => byName.get(n) ?? []).map((e) => [e.id, e])).values()];
    return names.length ? { fmp: f, class: 'name_review', candidates: names } : { fmp: f, class: 'new', candidates: [] };
  });
}

export function toMarkdown(rows) {
  const n = (c) => rows.filter((r) => r.class === c).length;
  const who = (x) => `${x.name}${x.business_name ? ` (${x.business_name})` : ''}${x.email ? ` <${x.email}>` : ''}`;
  return [`# Funnel Mapper → shared clients: matching report`, '',
    `Nothing has been linked or changed. Proposed links need the owner's approval (V7 decision D1).`, '',
    `| Class | Count |`, `|---|---|`, ...['email_exact', 'ambiguous', 'name_review', 'new'].map((c) => `| ${c} | ${n(c)} |`), '',
    `| Funnel Mapper client | Class | Candidate(s) in the shared list | Decision (owner) |`, `|---|---|---|---|`,
    ...rows.map((r) => `| ${who(r.fmp)} | ${r.class} | ${r.candidates.map(who).join('; ') || '–'} | |`), ''].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) { console.error('usage: node scripts/fmp-client-match.mjs <funnel-mapper-clients.json> <ecosystem-clients.json> [--md out.md]'); process.exit(2); }
  const md = toMarkdown(matchReport(JSON.parse(readFileSync(a, 'utf8')), JSON.parse(readFileSync(b, 'utf8'))));
  const out = process.argv.indexOf('--md'); if (out > 0) writeFileSync(process.argv[out + 1], md); else console.log(md);
}
