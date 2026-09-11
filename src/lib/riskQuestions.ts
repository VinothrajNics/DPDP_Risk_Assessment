/**
 * DPDP Risk & Compliance questionnaire.
 *
 * This is a faithful re-implementation of the original NICS DPDP risk
 * assessment definitions. The new application owns these definitions; nothing is
 * imported from the legacy project at runtime.
 *
 * - 50 questions: DPDP-001 .. DPDP-050
 * - answer values: '3' Strong, '2' Partial, '1' Weak, '0' None, 'N/A'
 * - scoring: assigned = weight x value; total = weight x 3
 * - N/A is excluded from the total; unanswered questions still count in the total.
 */

export interface RiskQuestion {
  id: string;
  domain: string;
  question: string;
  weight: number;
  na?: boolean;
}

export const RISK_ANSWER_OPTIONS = ['3', '2', '1', '0'];

export interface RiskAnswerChoice {
  value: string;
  label: string;
}

/** UI choices (labels shown to participants) mapped to the original stored values. */
export const RISK_ANSWER_CHOICES: RiskAnswerChoice[] = [
  { value: '3', label: 'Strong' },
  { value: '2', label: 'Partial' },
  { value: '1', label: 'Weak' },
  { value: '0', label: 'None' },
];

export const RISK_NA_CHOICE: RiskAnswerChoice = { value: 'N/A', label: 'N/A' };

export function answerLabel(value: string | undefined | null): string {
  if (value === 'N/A') return 'N/A';
  return RISK_ANSWER_CHOICES.find((c) => c.value === value)?.label ?? '—';
}

export const RISK_QUESTIONS: RiskQuestion[] = [
  { id: 'DPDP-001', domain: 'Applicability', question: 'Has the organisation assessed whether the DPDP Act applies to its processing of digital personal data?', weight: 2, na: true },
  { id: 'DPDP-002', domain: 'Applicability', question: 'Has the organisation identified the categories of Data Principals whose personal data it processes?', weight: 2 },
  { id: 'DPDP-003', domain: 'Governance', question: 'Has senior management formally assigned responsibility for DPDP compliance?', weight: 3 },
  { id: 'DPDP-004', domain: 'Governance', question: 'Has the organisation established a formal DPDP compliance governance framework?', weight: 3 },
  { id: 'DPDP-005', domain: 'Governance', question: 'Are DPDP responsibilities allocated across relevant departments?', weight: 2 },
  { id: 'DPDP-006', domain: 'Governance', question: 'Has management approved a DPDP compliance roadmap with timelines and owners?', weight: 3 },
  { id: 'DPDP-007', domain: 'Governance', question: 'Has a budget/resources been allocated for DPDP compliance?', weight: 2 },
  { id: 'DPDP-008', domain: 'Data Inventory', question: 'Has the organisation created an inventory of personal data processed?', weight: 0 },
  { id: 'DPDP-009', domain: 'Data Inventory', question: 'Has the organisation documented the source of personal data?', weight: 2 },
  { id: 'DPDP-010', domain: 'Data Inventory', question: 'Has the organisation identified where personal data is stored?', weight: 3 },
  { id: 'DPDP-011', domain: 'Data Inventory', question: 'Has the organisation identified who has access to personal data?', weight: 3 },
  { id: 'DPDP-012', domain: 'Data Flow', question: 'Has the organisation mapped how personal data moves between systems and departments?', weight: 3 },
  { id: 'DPDP-013', domain: 'Data Flow', question: 'Has the organisation identified external parties with whom personal data is shared?', weight: 3 },
  { id: 'DPDP-014', domain: 'Purpose', question: 'Has the organisation documented the purpose for which personal data is collected and processed?', weight: 3 },
  { id: 'DPDP-015', domain: 'Purpose', question: 'Does the organisation review whether personal data collected is necessary for the stated purpose?', weight: 2 },
  { id: 'DPDP-016', domain: 'Notice', question: 'Does the organisation provide an appropriate notice when personal data is collected?', weight: 3 },
  { id: 'DPDP-017', domain: 'Notice', question: 'Are privacy notices understandable and accessible to Data Principals?', weight: 2 },
  { id: 'DPDP-018', domain: 'Notice', question: 'Does the organisation maintain different notices where different processing contexts require them?', weight: 2 },
  { id: 'DPDP-019', domain: 'Consent', question: 'Has the organisation identified processing activities where consent is relied upon?', weight: 3 },
  { id: 'DPDP-020', domain: 'Consent', question: 'Where consent is required, does the organisation obtain consent through a valid mechanism?', weight: 3, na: true },
  { id: 'DPDP-021', domain: 'Consent', question: 'Does the organisation maintain evidence/records of consent?', weight: 3, na: true },
  { id: 'DPDP-022', domain: 'Consent', question: 'Can Data Principals withdraw consent through an accessible mechanism?', weight: 3, na: true },
  { id: 'DPDP-023', domain: 'Consent', question: 'Does withdrawal of consent trigger appropriate downstream actions?', weight: 3, na: true },
  { id: 'DPDP-024', domain: 'Rights', question: 'Has the organisation established a process for handling Data Principal rights requests?', weight: 3 },
  { id: 'DPDP-025', domain: 'Rights', question: 'Can the organisation verify the identity of a person making a Data Principal request?', weight: 2 },
  { id: 'DPDP-026', domain: 'Rights', question: 'Has the organisation established defined timelines and ownership for responding to requests?', weight: 3 },
  { id: 'DPDP-027', domain: 'Rights', question: 'Can the organisation coordinate Data Principal requests across relevant systems/departments?', weight: 3 },
  { id: 'DPDP-028', domain: 'Grievance', question: 'Has the organisation established a mechanism for Data Principal grievances?', weight: 3 },
  { id: 'DPDP-029', domain: 'Grievance', question: 'Are grievances tracked, investigated and closed with appropriate evidence?', weight: 2 },
  { id: 'DPDP-030', domain: 'Accuracy', question: 'Does the organisation have controls to maintain accurate personal data where required?', weight: 2 },
  { id: 'DPDP-031', domain: 'Retention', question: 'Has the organisation defined retention periods for categories of personal data?', weight: 3 },
  { id: 'DPDP-032', domain: 'Retention', question: 'Are retention periods linked to business, legal or regulatory requirements?', weight: 2 },
  { id: 'DPDP-033', domain: 'Deletion', question: 'Does the organisation have a process to delete personal data when it is no longer required?', weight: 3 },
  { id: 'DPDP-034', domain: 'Deletion', question: 'Can the organisation identify and delete personal data across relevant systems?', weight: 3 },
  { id: 'DPDP-035', domain: 'Security', question: 'Has the organisation implemented appropriate technical and organisational safeguards for personal data?', weight: 3 },
  { id: 'DPDP-036', domain: 'Security', question: 'Are access controls implemented to restrict personal data based on business need?', weight: 3 },
  { id: 'DPDP-037', domain: 'Security', question: 'Are privileged/user access rights periodically reviewed?', weight: 2 },
  { id: 'DPDP-038', domain: 'Security', question: 'Is personal data protected through appropriate security measures such as encryption, authentication, logging or monitoring?', weight: 3 },
  { id: 'DPDP-039', domain: 'Breach', question: 'Does the organisation have a documented personal data breach response procedure?', weight: 3 },
  { id: 'DPDP-040', domain: 'Breach', question: 'Does the incident response process include assessment, escalation, documentation and required notifications?', weight: 3 },
  { id: 'DPDP-041', domain: 'Third Party', question: 'Has the organisation identified all relevant Data Processors handling personal data?', weight: 3 },
  { id: 'DPDP-042', domain: 'Third Party', question: 'Does the organisation conduct privacy/security due diligence before onboarding relevant processors?', weight: 3 },
  { id: 'DPDP-043', domain: 'Third Party', question: 'Do processor contracts include appropriate data protection obligations?', weight: 3 },
  { id: 'DPDP-044', domain: 'Third Party', question: 'Does the organisation periodically monitor processor compliance?', weight: 2 },
  { id: 'DPDP-045', domain: 'Cross-Border', question: 'Has the organisation identified whether personal data is transferred/shared outside India?', weight: 2, na: true },
  { id: 'DPDP-046', domain: 'Policies', question: 'Does the organisation have a documented personal data/privacy policy framework?', weight: 3 },
  { id: 'DPDP-047', domain: 'Training', question: 'Do employees receive periodic DPDP/privacy awareness training?', weight: 2 },
  { id: 'DPDP-048', domain: 'Privacy by Design', question: 'Is privacy considered when launching new products, systems, applications or business processes?', weight: 3 },
  { id: 'DPDP-049', domain: 'Monitoring', question: 'Does the organisation periodically assess and report its DPDP compliance status to management?', weight: 3 },
  { id: 'DPDP-050', domain: 'Evidence', question: 'Can the organisation produce documented evidence demonstrating its DPDP compliance controls?', weight: 3 },
];

export const RISK_DOMAINS: string[] = (() => {
  const seen: string[] = [];
  for (const q of RISK_QUESTIONS) if (!seen.includes(q.domain)) seen.push(q.domain);
  return seen;
})();

export interface DomainScore {
  domain: string;
  questions: number;
  answered: number;
  assigned: number;
  total: number;
  percentage: number | null;
}

export interface RiskRating {
  key: string;
  emoji: string;
  label: string;
  min: number;
  max: number;
  summary: string;
}

export const RISK_RATINGS: RiskRating[] = [
  {
    key: 'strong',
    emoji: '\u{1F7E2}',
    label: 'Strong \u2013 DPDP Ready',
    min: 80,
    max: 100,
    summary:
      'The organisation demonstrates a strong level of preparedness for DPDP compliance. Key governance, data management, privacy, security, consent, Data Principal rights, third-party and incident management controls are substantially established. Processes are generally documented, responsibilities are defined, and evidence of implementation is available. Only limited gaps or optimisation opportunities may remain. The organisation should focus on continuous monitoring, periodic testing, evidence maintenance and addressing any identified critical gaps.',
  },
  {
    key: 'moderate',
    emoji: '\u{1F7E1}',
    label: 'Moderate \u2013 Improvements Required',
    min: 60,
    max: 79,
    summary:
      'The organisation has established some elements of a DPDP compliance framework, but significant gaps remain across one or more important areas. While certain policies, processes or controls may be in place, they may not be consistently implemented, documented or supported by sufficient evidence. Priority should be given to strengthening governance, data inventory and mapping, privacy notices, consent management, Data Principal rights, retention/deletion, security, third-party management and breach response. A defined remediation roadmap with owners and timelines should be implemented.',
  },
  {
    key: 'weak',
    emoji: '\u{1F7E0}',
    label: 'Weak \u2013 Significant Gaps',
    min: 40,
    max: 59,
    summary:
      'The organisation has limited DPDP preparedness and several important compliance controls are either absent, informal or inconsistently implemented. There may be limited visibility over personal data, processing activities, data flows, third parties and retention requirements. Governance and accountability may also require significant strengthening. The organisation should undertake a structured DPDP remediation programme, beginning with data discovery, applicability assessment, governance, purpose identification, risk assessment and development of core policies and processes.',
  },
  {
    key: 'poor',
    emoji: '\u{1F534}',
    label: 'Poor \u2013 High Risk',
    min: 20,
    max: 39,
    summary:
      'The organisation demonstrates a low level of DPDP preparedness and has substantial compliance and operational gaps. Key controls relating to personal data identification, processing, consent, rights, retention, security, third parties and breach management may not be adequately established. The organisation should treat DPDP compliance as a high-priority programme and establish clear management ownership, resources and implementation timelines. Immediate attention should be given to critical and high-risk gaps.',
  },
  {
    key: 'critical',
    emoji: '\u26D4',
    label: 'Critical \u2013 Not Ready',
    min: 0,
    max: 19,
    summary:
      'The organisation currently has very limited evidence of DPDP preparedness. Fundamental governance, data management, privacy and security controls may be absent or largely informal. The organisation is not adequately positioned to demonstrate effective compliance and requires a comprehensive DPDP implementation programme. Immediate management intervention is recommended, beginning with applicability assessment, governance ownership, data discovery, processing inventory, risk identification and development of the basic privacy compliance framework.',
  },
];

export function ratingFor(pct: number | null): RiskRating | null {
  if (pct === null) return null;
  for (const r of RISK_RATINGS) if (pct >= r.min) return r;
  return RISK_RATINGS[RISK_RATINGS.length - 1];
}

export function ratingByKey(key: string | null | undefined): RiskRating | null {
  if (!key) return null;
  return RISK_RATINGS.find((r) => r.key === key) ?? null;
}

export function answerValue(answer: string | undefined): number | null {
  if (answer === 'N/A' || answer === undefined || answer === '') return null;
  const n = Number(answer);
  return Number.isFinite(n) ? n : null;
}

export function computeDomainScores(answers: Record<string, string>): DomainScore[] {
  const map = new Map<string, DomainScore>();
  for (const q of RISK_QUESTIONS) {
    const d = map.get(q.domain) || { domain: q.domain, questions: 0, answered: 0, assigned: 0, total: 0, percentage: null };
    d.questions += 1;
    const val = answerValue(answers[q.id]);
    if (val === null) {
      // N/A (or unanswered) — for totals, unanswered questions still count; N/A questions are excluded.
      const isNa = answers[q.id] === 'N/A';
      if (!isNa) d.total += 3 * q.weight;
    } else {
      d.answered += 1;
      d.assigned += q.weight * val;
      d.total += 3 * q.weight;
    }
    map.set(q.domain, d);
  }
  const rows = RISK_DOMAINS.map((domain) => map.get(domain)).filter((d): d is DomainScore => !!d);
  for (const r of rows) r.percentage = r.total > 0 ? Math.round((r.assigned / r.total) * 100) : null;
  return rows;
}

export function overallScore(rows: DomainScore[]): { assigned: number; total: number; percentage: number | null } {
  const assigned = rows.reduce((s, r) => s + r.assigned, 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return { assigned, total, percentage: total > 0 ? Math.round((assigned / total) * 100) : null };
}

export interface QuestionResult {
  id: string;
  domain: string;
  question: string;
  weight: number;
  answer: string | null;
  answerLabel: string;
  assigned: number | null;
  maximum: number;
  isNa: boolean;
  answered: boolean;
}

export function questionResults(answers: Record<string, string>): QuestionResult[] {
  return RISK_QUESTIONS.map((q) => {
    const answer = answers[q.id] ?? null;
    const val = answerValue(answer ?? undefined);
    const isNa = answer === 'N/A';
    return {
      id: q.id,
      domain: q.domain,
      question: q.question,
      weight: q.weight,
      answer,
      answerLabel: answerLabel(answer),
      assigned: val === null ? null : q.weight * val,
      maximum: q.weight * 3,
      isNa,
      answered: answer !== null && answer !== '',
    };
  });
}
