export type AssessmentStatus = 'IN_PROGRESS' | 'SUBMITTED';

export interface Assessment {
  id: string;
  sessionId: string;
  companyName: string;
  assessedBy: string;
  designation: string;
  email: string | null;
  phone: string | null;
  startedAt: string;
  lastSavedAt: string;
  submittedAt: string | null;
  status: AssessmentStatus;
  overallScore: number | null;
  overallRating: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AssessmentSummary = Assessment & {
  answeredCount: number;
};

export interface AdminCounts {
  total: number;
  submitted: number;
  inProgress: number;
  incomplete: number;
}

export interface AdminListResponse {
  counts: AdminCounts;
  assessments: AssessmentSummary[];
}

export interface AssessmentDetailResponse {
  assessment: AssessmentSummary;
  responses: { questionId: string; answer: string; updatedAt: string }[];
  rows: import('./riskQuestions').DomainScore[];
  overall: { assigned: number; total: number; percentage: number | null };
}

export interface ReportPayload {
  assessment: Assessment;
  responses: { questionId: string; answer: string }[];
  generatedAt: string;
}

export interface StartAssessmentInput {
  companyName: string;
  assessedBy: string;
  designation: string;
  email?: string;
  phone?: string;
}
