-- GMH Driver Recruiting CRM - Supabase Schema
-- Run this in your Supabase SQL Editor: https://app.supabase.com → SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DRIVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cdl_class TEXT CHECK (cdl_class IN ('A', 'B', 'C', 'None')),
  location TEXT,
  experience_years INTEGER DEFAULT 0,
  driver_type TEXT NOT NULL CHECK (driver_type IN ('company', 'owner_operator')),
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'contacted', 'docs_sent', 'offer_extended', 'hired', 'not_interested', 'inactive')),
  notes TEXT,
  checklist JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TOUCHPOINTS
-- ============================================================
CREATE TABLE IF NOT EXISTS touchpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL CHECK (method IN ('call', 'email', 'sms', 'in_person', 'other')),
  notes TEXT,
  created_by TEXT,
  follow_up_date DATE,
  follow_up_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS touchpoints_driver_id_idx ON touchpoints(driver_id);
CREATE INDEX IF NOT EXISTS touchpoints_follow_up_idx ON touchpoints(follow_up_date) WHERE follow_up_completed = FALSE;

-- ============================================================
-- SMS LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  template_name TEXT,
  sid TEXT
);

CREATE INDEX IF NOT EXISTS sms_log_driver_id_idx ON sms_log(driver_id);

-- ============================================================
-- SMS TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  driver_type TEXT CHECK (driver_type IN ('company', 'owner_operator', 'both')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  driver_type TEXT NOT NULL CHECK (driver_type IN ('company', 'owner_operator', 'both')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEFAULT SMS TEMPLATES
-- ============================================================
INSERT INTO sms_templates (name, message, driver_type) VALUES
(
  'Initial Outreach - Company Driver',
  'Hi {name}, this is {recruiter} with GMH Transportation! We''re hiring CDL-A Company Drivers with great pay and home time. Interested in learning more? Reply YES or call us at {phone}. Reply STOP to opt out.',
  'company'
),
(
  'Initial Outreach - Owner Operator',
  'Hi {name}, this is {recruiter} with GMH Transportation! We''re looking for Owner Operators — great rates, flexible lanes, and strong support. Interested? Reply YES or call {phone}. Reply STOP to opt out.',
  'owner_operator'
),
(
  'Follow-Up',
  'Hi {name}, just following up on our conversation about driving opportunities at GMH Transportation. We''d love to get you started! Any questions? Call or text us at {phone}.',
  'both'
),
(
  'Documents Request',
  'Hi {name}, great news — you''re moving forward! Please send us your CDL, medical card, and last 10 years of employment history. Reply with any questions or call {phone}.',
  'both'
),
(
  'Offer Extended',
  'Hi {name}, we''re excited to officially offer you a position with GMH Transportation! Please call {phone} to go over the details and next steps. Welcome aboard!',
  'both'
);

-- ============================================================
-- ROW LEVEL SECURITY (optional - enable if using auth)
-- ============================================================
-- ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE touchpoints ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
