// Value Ladder model: step names, the rising map, broken links and comparing two versions in plain words.
import { recorder } from './lib.mjs';
import { STEP_TYPES, stepLabel, riseOf, brokenLink, diffLadders, totals, priceOf } from '../apps/web/js/modules/laddermodel.js';
const { results, check } = recorder();
const a = [{ id: '1', stage: 'lead_magnet', name: 'Guide', price_amount: null, currency: null }, { id: '2', stage: 'tripwire', name: 'Starter', offer_name: 'Starter pack', price_amount: 47, currency: 'USD', conversion_pct: 8 }, { id: '3', stage: 'premium', name: 'Coaching', price_amount: 2000, currency: 'USD' }];
const b = [{ id: '2', stage: 'tripwire', name: 'Starter', offer_name: 'Starter pack v2', price_amount: 97, currency: 'USD', conversion_pct: 8 }, { id: '1', stage: 'lead_magnet', name: 'Guide', price_amount: null, currency: null }, { id: '4', stage: 'downsell', name: 'Lite', price_amount: 19, currency: 'USD' }];
const d = diffLadders(a, b);
check('LM1', 'There are seven step types with plain names', STEP_TYPES.length === 7 && stepLabel('tripwire') === 'Front-end offer' && stepLabel('premium') === 'High-ticket' && stepLabel('weird') === 'weird');
check('LM2', 'The map rises from free to premium', riseOf(0, 5) < riseOf(2, 5) && riseOf(4, 5) === 1 && riseOf(0, 1) === 1);
check('LM3', 'A step whose offer was archived is a broken link; one without an offer is not', brokenLink({ offer_id: 'x', offer_archived_at: '2026-01-01' }) && !brokenLink({ offer_id: 'x', offer_archived_at: null }) && !brokenLink({ offer_id: null }));
check('LM4', 'Compare lists added, removed, moved and changed steps in plain words', d.some((x) => x.kind === 'added' && x.text.includes('Lite')) && d.some((x) => x.kind === 'removed' && x.text.includes('Coaching')) && d.some((x) => x.kind === 'changed' && x.text.includes('Price: 47 USD → 97 USD') && x.text.includes('Linked offer: Starter pack → Starter pack v2') && x.text.includes('Position: 2 → 1')));
check('LM5', 'Comparing a ladder with itself shows nothing', diffLadders(a, a).length === 0);
check('LM6', 'Totals never mix currencies', JSON.stringify(totals([{ price_amount: 10, currency: 'USD' }, { price_amount: 5, currency: 'GBP' }, { price_amount: 7, currency: 'USD' }, { price_amount: null, currency: null }])) === '[{"currency":"USD","total":17},{"currency":"GBP","total":5}]' && priceOf({ price_amount: 1250.5, currency: 'USD' }) === '1,250.5 USD' && priceOf({}) === '—');
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.id.padEnd(5)} ${x.name}`);
const pc = results.filter((x) => x.ok).length; console.log(`\n${pc}/${results.length} checks passed`); process.exit(pc === results.length ? 0 : 1);
