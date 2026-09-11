-- DPDP Risk Assessment - initial schema (SQLite / Cloudflare D1 compatible)

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  assessed_by TEXT NOT NULL,
  designation TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  started_at TEXT NOT NULL,
  last_saved_at TEXT NOT NULL,
  submitted_at TEXT,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  overall_score INTEGER,
  overall_rating TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assessments_session_id ON assessments (session_id);
CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments (status);
CREATE INDEX IF NOT EXISTS idx_assessments_company ON assessments (company_name);
CREATE INDEX IF NOT EXISTS idx_assessments_started_at ON assessments (started_at);

CREATE TABLE IF NOT EXISTS risk_responses (
  id TEXT PRIMARY KEY NOT NULL,
  assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_responses_assessment_question ON risk_responses (assessment_id, question_id);
CREATE INDEX IF NOT EXISTS idx_risk_responses_assessment ON risk_responses (assessment_id);
