BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version varchar(50) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id bigserial PRIMARY KEY,
  username varchar(50) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  role_code varchar(30) NOT NULL CHECK (role_code IN ('EMPLOYEE','HR','FINANCE','ADMIN')),
  employee_id bigint,
  enabled boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id bigserial PRIMARY KEY,
  employee_no varchar(50) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  gender char(1) NOT NULL CHECK (gender IN ('M','F')),
  department varchar(100),
  hire_date date NOT NULL,
  leave_date date,
  employment_status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (employment_status IN ('ACTIVE','RESIGNED','RETIRED')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CHECK (leave_date IS NULL OR leave_date >= hire_date)
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_employee;
ALTER TABLE users ADD CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS employee_children (
  id bigserial PRIMARY KEY,
  employee_id bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  child_name varchar(100) NOT NULL,
  gender char(1) CHECK (gender IN ('M','F')),
  birth_date date,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reimbursement_years (
  id bigserial PRIMARY KEY,
  year_no integer NOT NULL UNIQUE CHECK (year_no BETWEEN 2000 AND 2100),
  annual_limit numeric(14,2) NOT NULL DEFAULT 0 CHECK (annual_limit >= 0),
  invoice_start_date date NOT NULL,
  invoice_end_date date NOT NULL,
  allow_backfill boolean NOT NULL DEFAULT false,
  male_child_year_rule varchar(10) NOT NULL DEFAULT 'ODD' CHECK (male_child_year_rule IN ('ODD','EVEN')),
  female_child_year_rule varchar(10) NOT NULL DEFAULT 'EVEN' CHECK (female_child_year_rule IN ('ODD','EVEN')),
  status varchar(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','CLOSED')),
  is_default boolean NOT NULL DEFAULT false,
  initialized_from_year_id bigint REFERENCES reimbursement_years(id) ON DELETE SET NULL,
  remark varchar(500),
  updated_by bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CHECK (invoice_end_date >= invoice_start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reimbursement_year_default
ON reimbursement_years (is_default) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS reimbursement_categories (
  id bigserial PRIMARY KEY,
  code varchar(50) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_no integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reimbursement_types (
  id bigserial PRIMARY KEY,
  category_id bigint NOT NULL REFERENCES reimbursement_categories(id) ON DELETE RESTRICT,
  code varchar(50) NOT NULL,
  name varchar(100) NOT NULL,
  reimbursement_rate numeric(5,4) NOT NULL CHECK (reimbursement_rate > 0 AND reimbursement_rate <= 1),
  enabled boolean NOT NULL DEFAULT true,
  sort_no integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, code)
);

CREATE TABLE IF NOT EXISTS employee_year_quota (
  id bigserial PRIMARY KEY,
  employee_id bigint NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year_id bigint NOT NULL REFERENCES reimbursement_years(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, year_id)
);

CREATE TABLE IF NOT EXISTS reimbursement_applications (
  id bigserial PRIMARY KEY,
  application_no varchar(50) NOT NULL UNIQUE,
  employee_id bigint NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  year_id bigint NOT NULL REFERENCES reimbursement_years(id) ON DELETE RESTRICT,
  apply_date date NOT NULL,
  status smallint NOT NULL DEFAULT 0 CHECK (status IN (0,1,2)),
  total_invoice_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_invoice_amount >= 0),
  total_self_paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_self_paid >= 0),
  total_reimburse_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_reimburse_amount >= 0),
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reimbursement_details (
  id bigserial PRIMARY KEY,
  application_id bigint NOT NULL REFERENCES reimbursement_applications(id) ON DELETE RESTRICT,
  beneficiary_type varchar(20) NOT NULL CHECK (beneficiary_type IN ('EMPLOYEE','CHILD','RETIREE')),
  beneficiary_employee_id bigint NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  child_id bigint REFERENCES employee_children(id) ON DELETE RESTRICT,
  reimbursement_type_id bigint NOT NULL REFERENCES reimbursement_types(id) ON DELETE RESTRICT,
  invoice_name varchar(100) NOT NULL,
  invoice_no varchar(100) NOT NULL,
  invoice_date date NOT NULL,
  total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  self_paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (self_paid >= 0),
  reimbursement_rate numeric(5,4) NOT NULL CHECK (reimbursement_rate > 0 AND reimbursement_rate <= 1),
  reimbursement_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (reimbursement_amount >= 0),
  status smallint NOT NULL DEFAULT 0 CHECK (status IN (0,1,2)),
  source_type varchar(20) NOT NULL DEFAULT 'MANUAL' CHECK (source_type IN ('MANUAL','OCR','PDF','OFD','TEXT','URL')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reimbursement_details_application ON reimbursement_details(application_id);
CREATE INDEX IF NOT EXISTS idx_reimbursement_details_pending ON reimbursement_details(status) WHERE status = 0;
CREATE INDEX IF NOT EXISTS idx_reimbursement_applications_employee_year ON reimbursement_applications(employee_id, year_id);
CREATE INDEX IF NOT EXISTS idx_reimbursement_applications_status ON reimbursement_applications(status);

CREATE TABLE IF NOT EXISTS invoice_registry (
  id bigserial PRIMARY KEY,
  invoice_no varchar(100) NOT NULL UNIQUE,
  detail_id bigint NOT NULL REFERENCES reimbursement_details(id) ON DELETE RESTRICT,
  application_id bigint NOT NULL REFERENCES reimbursement_applications(id) ON DELETE RESTRICT,
  registered_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_registry_application ON invoice_registry(application_id);

CREATE TABLE IF NOT EXISTS approval_records (
  id bigserial PRIMARY KEY,
  detail_id bigint NOT NULL REFERENCES reimbursement_details(id) ON DELETE RESTRICT,
  application_id bigint NOT NULL REFERENCES reimbursement_applications(id) ON DELETE RESTRICT,
  operator_user_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(30) NOT NULL CHECK (action IN ('APPROVE','REJECT','EDIT')),
  before_data jsonb,
  after_data jsonb,
  remark varchar(500),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_records_detail ON approval_records(detail_id);
CREATE INDEX IF NOT EXISTS idx_approval_records_application ON approval_records(application_id);

CREATE TABLE IF NOT EXISTS file_records (
  id bigserial PRIMARY KEY,
  application_id bigint REFERENCES reimbursement_applications(id) ON DELETE RESTRICT,
  detail_id bigint REFERENCES reimbursement_details(id) ON DELETE RESTRICT,
  original_name varchar(255) NOT NULL,
  storage_name varchar(255) NOT NULL,
  relative_path varchar(500) NOT NULL,
  file_type varchar(20) NOT NULL CHECK (file_type IN ('PDF','OFD','JPG','JPEG','PNG','WEBP','OTHER')),
  file_size bigint NOT NULL CHECK (file_size >= 0),
  sha256 char(64),
  source_url text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_records_application ON file_records(application_id);
CREATE INDEX IF NOT EXISTS idx_file_records_detail ON file_records(detail_id);

CREATE TABLE IF NOT EXISTS system_parameters (
  id bigserial PRIMARY KEY,
  param_key varchar(100) NOT NULL UNIQUE,
  param_value text NOT NULL,
  param_type varchar(20) NOT NULL CHECK (param_type IN ('STRING','BOOLEAN','NUMBER','JSON')),
  description varchar(500),
  updated_by bigint REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id bigserial PRIMARY KEY,
  user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  module varchar(50) NOT NULL,
  action varchar(50) NOT NULL,
  target_type varchar(50),
  target_id varchar(100),
  request_ip inet,
  user_agent text,
  detail_json jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_user_created ON operation_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_logs_target ON operation_logs(target_type, target_id);

INSERT INTO schema_migrations(version) VALUES ('001_init') ON CONFLICT (version) DO NOTHING;

COMMIT;
