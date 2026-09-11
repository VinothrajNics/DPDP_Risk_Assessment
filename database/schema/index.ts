import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

/**
 * Canonical schema. The same schema/SQL is used by:
 *  - local development (better-sqlite3, D1-compatible SQLite)
 *  - production (Cloudflare D1)
 *
 * Do NOT import anything from the legacy DPDP project. This app owns its schema.
 */

export const assessments = sqliteTable(
  'assessments',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    companyName: text('company_name').notNull(),
    assessedBy: text('assessed_by').notNull(),
    designation: text('designation').notNull(),
    email: text('email'),
    phone: text('phone'),
    startedAt: text('started_at').notNull(),
    lastSavedAt: text('last_saved_at').notNull(),
    submittedAt: text('submitted_at'),
    status: text('status').notNull().default('IN_PROGRESS'),
    overallScore: integer('overall_score'),
    overallRating: text('overall_rating'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_assessments_session_id').on(t.sessionId),
    index('idx_assessments_status').on(t.status),
    index('idx_assessments_company').on(t.companyName),
    index('idx_assessments_started_at').on(t.startedAt),
  ],
);

export const riskResponses = sqliteTable(
  'risk_responses',
  {
    id: text('id').primaryKey(),
    assessmentId: text('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    questionId: text('question_id').notNull(),
    answer: text('answer').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_risk_responses_assessment_question').on(t.assessmentId, t.questionId),
    index('idx_risk_responses_assessment').on(t.assessmentId),
  ],
);

export type AssessmentRow = typeof assessments.$inferSelect;
export type RiskResponseRow = typeof riskResponses.$inferSelect;
