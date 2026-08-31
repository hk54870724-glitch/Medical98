BEGIN;

-- Business-safe deletion is implemented in the service layer. Keep all existing
-- foreign keys RESTRICT so a year with quota or business data cannot be deleted.
-- Add an index to make the pre-delete business-data check inexpensive.
CREATE INDEX IF NOT EXISTS idx_employee_year_quota_year_id ON employee_year_quota(year_id);
CREATE INDEX IF NOT EXISTS idx_reimbursement_applications_year_id ON reimbursement_applications(year_id);

-- Ensure an existing installation has both the current and previous account sets.
INSERT INTO reimbursement_years(year_no, annual_limit, invoice_start_date, invoice_end_date, allow_backfill, male_child_year_rule, female_child_year_rule, status, is_default, remark)
SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int - 1, COALESCE((SELECT annual_limit FROM reimbursement_years WHERE is_default=true LIMIT 1),10000),
       make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int - 1,1,1), make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int - 1,12,31), true,'ODD','EVEN','ACTIVE',false,'系统升级补建上年度账套'
WHERE NOT EXISTS (SELECT 1 FROM reimbursement_years WHERE year_no=EXTRACT(YEAR FROM CURRENT_DATE)::int - 1);

COMMIT;
