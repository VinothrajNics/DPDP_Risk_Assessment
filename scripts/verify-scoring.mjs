/**
 * Locks the exact DPDP mark calculation used by the original risk assessment.
 *
 *   npm run verify:scoring
 *
 * This runs against the new project's own definitions (no dependency on the
 * legacy project) and asserts the exact numbers, totals, N/A handling and
 * rating boundaries.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const lib = await import(pathToFileURL(resolve(__dirname, '..', 'src', 'lib', 'riskQuestions.ts')).href);
const { RISK_QUESTIONS, RISK_DOMAINS, computeDomainScores, overallScore, ratingFor, answerValue } = lib;

let failures = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  } else {
    console.log(`ok   ${label} = ${e}`);
  }
};

const all = (value) => {
  const map = {};
  for (const q of RISK_QUESTIONS) map[q.id] = value;
  return map;
};
const score = (map) => overallScore(computeDomainScores(map));

// Structure
check('question count', RISK_QUESTIONS.length, 50);
check('first id', RISK_QUESTIONS[0].id, 'DPDP-001');
check('last id', RISK_QUESTIONS[49].id, 'DPDP-050');
check('domain count', RISK_DOMAINS.length, 21);
check('sum of weights', RISK_QUESTIONS.reduce((s, q) => s + q.weight, 0), 131);
check('sum of (weight x 3)', RISK_QUESTIONS.reduce((s, q) => s + q.weight * 3, 0), 393);

// Answer values
check('answerValue("3")', answerValue('3'), 3);
check('answerValue("2")', answerValue('2'), 2);
check('answerValue("1")', answerValue('1'), 1);
check('answerValue("0")', answerValue('0'), 0);
check('answerValue("N/A")', answerValue('N/A'), null);
check('answerValue(unanswered)', answerValue(undefined), null);
check('answerValue("")', answerValue(''), null);

// Totals
check('all Strong', score(all('3')), { assigned: 393, total: 393, percentage: 100 });
check('all Partial', score(all('2')), { assigned: 262, total: 393, percentage: 67 });
check('all Weak', score(all('1')), { assigned: 131, total: 393, percentage: 33 });
check('all None', score(all('0')), { assigned: 0, total: 393, percentage: 0 });
check('all unanswered (still counted)', score({}), { assigned: 0, total: 393, percentage: 0 });

// N/A is excluded from BOTH assigned and total (question cost drops out).
const naQuestions = ['DPDP-001', 'DPDP-020', 'DPDP-021', 'DPDP-022', 'DPDP-023', 'DPDP-045'];
const naMap = all('3');
for (const q of naQuestions) naMap[q] = 'N/A';
check('6 N/A excluded from score', score(naMap), { assigned: 345, total: 345, percentage: 100 });
check(
  'N/A excluded weight cost',
  RISK_QUESTIONS.filter((q) => naQuestions.includes(q.id)).reduce((s, q) => s + q.weight * 3, 0),
  48,
);
const oneNa = all('3');
oneNa['DPDP-003'] = 'N/A'; // weight 3 -> removes 9 points
check('single N/A removes 9 points', score(oneNa), { assigned: 384, total: 384, percentage: 100 });
const zeroWeightNa = all('3');
zeroWeightNa['DPDP-008'] = 'N/A'; // weight 0 -> removes nothing
check('weight-0 N/A changes nothing', score(zeroWeightNa), { assigned: 393, total: 393, percentage: 100 });
check('weight-0 question max', RISK_QUESTIONS.find((q) => q.id === 'DPDP-008').weight * 3, 0);

// Reference scenario cross-checked against the original implementation.
const scenario = all('3');
for (const q of naQuestions) scenario[q] = 'N/A';
for (const q of ['DPDP-003', 'DPDP-004', 'DPDP-008', 'DPDP-014', 'DPDP-046']) scenario[q] = '2';
check('scenario 333/345', score(scenario), { assigned: 333, total: 345, percentage: 97 });

// Rating boundaries (evaluated top-down on pct >= min).
const band = (p) => ratingFor(p)?.key ?? null;
check('100 -> strong', band(100), 'strong');
check('80 -> strong', band(80), 'strong');
check('79 -> moderate', band(79), 'moderate');
check('60 -> moderate', band(60), 'moderate');
check('59 -> weak', band(59), 'weak');
check('40 -> weak', band(40), 'weak');
check('39 -> poor', band(39), 'poor');
check('20 -> poor', band(20), 'poor');
check('19 -> critical', band(19), 'critical');
check('0 -> critical', band(0), 'critical');
check('null -> null', ratingFor(null), null);

// Rounding rule: Math.round(assigned / total * 100).
const partial = all('2');
check('rounding 262/393', score(partial).percentage, 67);
const mixed = all('3');
mixed['DPDP-003'] = '0'; // -9 assigned
check('rounding 384/393', score(mixed), { assigned: 384, total: 393, percentage: 98 });

console.log(failures === 0 ? '\nALL SCORING CHECKS PASSED' : `\n${failures} SCORING CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
