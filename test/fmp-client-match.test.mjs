// The offline matching report (scripts/fmp-client-match.mjs): e-mail first, names only for review, ambiguity surfaced, nothing linked.
import { matchReport, toMarkdown } from '../scripts/fmp-client-match.mjs';
const results = []; const check = (id, name, ok) => results.push({ id, name, ok: !!ok });
const eco = [
  { id: 'e1', name: 'Sam Carter', business_name: 'Carter Strength', email: 'sam@carterstrength.test' },
  { id: 'e2', name: 'Priya Nair', email: 'priya@calmmind.test' },
  { id: 'e3', name: 'Twin A', email: 'shared@x.test' }, { id: 'e4', name: 'Twin B', email: 'shared@x.test' },
];
const fmp = [
  { id: 'f1', name: 'S Carter', email: ' SAM@carterstrength.test ' },
  { id: 'f2', name: 'priya nair', email: 'priya.other@else.test' },
  { id: 'f3', name: 'Someone', email: 'shared@x.test' },
  { id: 'f4', name: 'Brand New', email: 'new@new.test' },
  { id: 'f5', name: 'Other', business_name: 'carter strength' },
];
const r = Object.fromEntries(matchReport(fmp, eco).map((x) => [x.fmp.id, x]));
check('MR1', 'Same e-mail (any case or spaces) → email_exact with that one client', r.f1.class === 'email_exact' && r.f1.candidates[0].id === 'e1');
check('MR2', 'Same name, different e-mail → name_review (never linked by name)', r.f2.class === 'name_review' && r.f2.candidates[0].id === 'e2');
check('MR3', 'Two shared clients with the e-mail → ambiguous, both listed', r.f3.class === 'ambiguous' && r.f3.candidates.length === 2);
check('MR4', 'No candidate → new', r.f4.class === 'new' && r.f4.candidates.length === 0);
check('MR5', 'Business name match → name_review', r.f5.class === 'name_review' && r.f5.candidates[0].id === 'e1');
const md = toMarkdown(Object.values(r));
check('MR6', 'The report says nothing was linked and leaves a decision column for the owner', /Nothing has been linked/.test(md) && /Decision \(owner\)/.test(md) && md.includes('| email_exact | 1 |'));
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const p = results.filter((x) => x.ok).length; console.log(`\n${p}/${results.length} checks passed`); process.exit(p === results.length ? 0 : 1);
