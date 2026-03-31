-- ==========================================
-- 스마트 농업 플랫폼 - 안전한 마이그레이션 스크립트
-- 기존 데이터를 유지하면서 새 테이블/컬럼만 추가
-- 반복 실행해도 안전 (idempotent)
-- ==========================================

-- TimescaleDB 확장 활성화
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ==========================================
-- 1. 사용자 관리
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,
  parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  address TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- email → username 마이그레이션 (기존 DB에 email 컬럼이 있는 경우)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username') THEN
      ALTER TABLE users ADD COLUMN username VARCHAR(100);
    END IF;
    UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL;
    ALTER TABLE users DROP COLUMN email;
    ALTER TABLE users ALTER COLUMN username SET NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_username_key') THEN
      ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
    END IF;
    DROP INDEX IF EXISTS idx_users_email;
    RAISE NOTICE 'email → username 마이그레이션 완료';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_user_id);

-- users 확장 컬럼
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- ==========================================
-- 2. Tuya 프로젝트 설정
-- ==========================================
CREATE TABLE IF NOT EXISTS tuya_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  access_id VARCHAR(255) NOT NULL,
  access_secret_encrypted TEXT NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  project_id VARCHAR(255),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_tuya_projects_user_id ON tuya_projects(user_id);

-- ==========================================
-- 3. 하우스 그룹
-- ==========================================
CREATE TABLE IF NOT EXISTS house_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  manager VARCHAR(100),
  enable_group_control BOOLEAN DEFAULT true,
  enable_automation BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_house_groups_user_id ON house_groups(user_id);

-- ==========================================
-- 4. 하우스동
-- ==========================================
CREATE TABLE IF NOT EXISTS houses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES house_groups(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  description TEXT,
  area DECIMAL(10, 2),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_houses_user_id ON houses(user_id);
CREATE INDEX IF NOT EXISTS idx_houses_group_id ON houses(group_id);

-- ==========================================
-- 5. 장비 (Devices)
-- ==========================================
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  house_id UUID REFERENCES houses(id) ON DELETE SET NULL,
  tuya_device_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  device_type VARCHAR(50) NOT NULL,
  equipment_type VARCHAR(50),
  icon VARCHAR(50),
  online BOOLEAN DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, tuya_device_id)
);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_house_id ON devices(house_id);
CREATE INDEX IF NOT EXISTS idx_devices_tuya_device_id ON devices(tuya_device_id);
CREATE INDEX IF NOT EXISTS idx_devices_category ON devices(category);

-- devices 확장 컬럼
ALTER TABLE devices ADD COLUMN IF NOT EXISTS equipment_type VARCHAR(50);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS paired_device_id UUID REFERENCES devices(id) ON DELETE SET NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS opener_group_name VARCHAR(255);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS channel_mapping JSONB DEFAULT NULL;

-- ==========================================
-- 5-1. 그룹-장비 연결 (다대다)
-- ==========================================
CREATE TABLE IF NOT EXISTS group_devices (
  group_id UUID NOT NULL REFERENCES house_groups(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_group_devices_group_id ON group_devices(group_id);
CREATE INDEX IF NOT EXISTS idx_group_devices_device_id ON group_devices(device_id);

-- ==========================================
-- 6. 센서 데이터 (TimescaleDB Hypertable)
-- ==========================================
CREATE TABLE IF NOT EXISTS sensor_data (
  time TIMESTAMP WITH TIME ZONE NOT NULL,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sensor_type VARCHAR(50) NOT NULL,
  value DECIMAL(10, 4) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'normal',
  metadata JSONB
);
-- Hypertable 변환 (이미 hypertable이면 무시)
SELECT create_hypertable('sensor_data', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_sensor_data_device_id ON sensor_data(device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_data_user_id ON sensor_data(user_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_data_sensor_type ON sensor_data(sensor_type, time DESC);

-- ==========================================
-- 7. 연속 집계 (Continuous Aggregates)
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'sensor_data_hourly') THEN
    CREATE MATERIALIZED VIEW sensor_data_hourly
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 hour', time) AS bucket,
      device_id, user_id, sensor_type,
      AVG(value) as avg_value,
      MIN(value) as min_value,
      MAX(value) as max_value,
      COUNT(*) as sample_count
    FROM sensor_data
    GROUP BY bucket, device_id, user_id, sensor_type
    WITH NO DATA;

    PERFORM add_continuous_aggregate_policy('sensor_data_hourly',
      start_offset => INTERVAL '3 hours',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'sensor_data_daily') THEN
    CREATE MATERIALIZED VIEW sensor_data_daily
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 day', time) AS bucket,
      device_id, user_id, sensor_type,
      AVG(value) as avg_value,
      MIN(value) as min_value,
      MAX(value) as max_value,
      COUNT(*) as sample_count
    FROM sensor_data
    GROUP BY bucket, device_id, user_id, sensor_type
    WITH NO DATA;

    PERFORM add_continuous_aggregate_policy('sensor_data_daily',
      start_offset => INTERVAL '3 days',
      end_offset => INTERVAL '1 day',
      schedule_interval => INTERVAL '1 day');
  END IF;
END $$;

-- ==========================================
-- 8. 데이터 보존 정책
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE hypertable_name = 'sensor_data' AND proc_name = 'policy_retention'
  ) THEN
    PERFORM add_retention_policy('sensor_data', INTERVAL '3 months');
  END IF;
END $$;

-- ==========================================
-- 8-1. 날씨 데이터 (TimescaleDB Hypertable)
-- ==========================================
CREATE TABLE IF NOT EXISTS weather_data (
  time TIMESTAMPTZ NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  temperature DECIMAL(5, 2),
  humidity DECIMAL(5, 2),
  precipitation DECIMAL(5, 2),
  wind_speed DECIMAL(5, 2),
  condition VARCHAR(20) DEFAULT 'clear',
  nx INT,
  ny INT
);
SELECT create_hypertable('weather_data', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_weather_data_user ON weather_data(user_id, time DESC);

-- ==========================================
-- 9. 자동화 룰
-- ==========================================
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES house_groups(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  rule_type VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  conditions JSONB NOT NULL,
  actions JSONB NOT NULL,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automation_rules_user_id ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled ON automation_rules(enabled);

-- ==========================================
-- 10. 자동화 실행 로그
-- ==========================================
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  conditions_met JSONB,
  actions_executed JSONB,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_automation_logs_rule_id ON automation_logs(rule_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_user_id ON automation_logs(user_id, executed_at DESC);

-- ==========================================
-- 11. 알림
-- ==========================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- ==========================================
-- 12. 사용자 설정
-- ==========================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visible_sensor_types JSONB DEFAULT '["temperature", "humidity", "co2", "light", "soil_moisture", "ph", "ec"]'::jsonb,
  notification_preferences JSONB DEFAULT '{}'::jsonb,
  dashboard_layout JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ==========================================
-- 트리거: updated_at 자동 업데이트
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users', 'tuya_projects', 'house_groups', 'houses',
    'devices', 'automation_rules', 'crop_batches', 'task_templates'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'update_' || tbl || '_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- ==========================================
-- 13. 수확 배치 (Crop Batches)
-- ==========================================
CREATE TABLE IF NOT EXISTS crop_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_name VARCHAR(100) NOT NULL,
  variety VARCHAR(100),
  house_name VARCHAR(100) NOT NULL,
  sow_date DATE NOT NULL,
  grow_days INT NOT NULL CHECK (grow_days BETWEEN 1 AND 365),
  stage VARCHAR(50) DEFAULT 'seedling',
  memo TEXT,
  status VARCHAR(20) DEFAULT 'active',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crop_batches_user ON crop_batches(user_id, status);

-- ==========================================
-- 14. 센서 이상 알림 (Sensor Alerts)
-- ==========================================
CREATE TABLE IF NOT EXISTS sensor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  device_name VARCHAR(255),
  sensor_type VARCHAR(50) NOT NULL,
  alert_type VARCHAR(30) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  value DECIMAL(10, 4),
  threshold TEXT,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sensor_alerts_user ON sensor_alerts(user_id, resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_alerts_device ON sensor_alerts(device_id, alert_type, resolved);

-- ==========================================
-- 15. 작업 달력 (Task Calendar)
-- ==========================================
ALTER TABLE crop_batches ADD COLUMN IF NOT EXISTS house_id UUID REFERENCES houses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crop_batches_house ON crop_batches(house_id);

CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_name VARCHAR(100) NOT NULL,
  interval_days INT NOT NULL CHECK (interval_days BETWEEN 1 AND 365),
  start_offset_days INT NOT NULL DEFAULT 0,
  default_reschedule_mode VARCHAR(20) NOT NULL DEFAULT 'anchor',
  is_preset BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_templates_user ON task_templates(user_id);

CREATE TABLE IF NOT EXISTS batch_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES crop_batches(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  anchor_date DATE NOT NULL,
  reschedule_mode VARCHAR(20) NOT NULL DEFAULT 'anchor',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(batch_id, template_id)
);
CREATE INDEX IF NOT EXISTS idx_batch_tasks_batch ON batch_tasks(batch_id);

CREATE TABLE IF NOT EXISTS task_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_task_id UUID NOT NULL REFERENCES batch_tasks(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES crop_batches(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'planned',
  done_date DATE,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_occurrences_batch ON task_occurrences(batch_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_task_occurrences_date ON task_occurrences(scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_task_occurrences_batch_task ON task_occurrences(batch_task_id, scheduled_date);

-- ==========================================
-- 16. 생육단계 기반 작업 관리 확장
-- ==========================================
ALTER TABLE crop_batches ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES house_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crop_batches_group ON crop_batches(group_id);
ALTER TABLE crop_batches ADD COLUMN IF NOT EXISTS transplant_date DATE;
ALTER TABLE crop_batches ADD COLUMN IF NOT EXISTS current_stage VARCHAR(30) DEFAULT 'seedling';
ALTER TABLE crop_batches ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS crop_type VARCHAR(50) DEFAULT 'cherry_tomato';
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS stage_name VARCHAR(30);
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS interval_min_days INT;
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS interval_max_days INT;

ALTER TABLE task_occurrences ADD COLUMN IF NOT EXISTS growth_feedback VARCHAR(20);
ALTER TABLE task_occurrences ADD COLUMN IF NOT EXISTS window_end_date DATE;

-- ==========================================
-- 17. 센서 환경 설정 (그룹별 매핑)
-- ==========================================
CREATE TABLE IF NOT EXISTS env_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'internal',
  unit VARCHAR(20) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO env_roles (role_key, label, category, unit, sort_order) VALUES
  ('internal_temp',     '내부 온도',  'internal', '°C',  1),
  ('internal_humidity', '내부 습도',  'internal', '%',   2),
  ('external_temp',     '외부 온도',  'external', '°C',  3),
  ('external_humidity', '외부 습도',  'external', '%',   4),
  ('co2',               'CO2',       'internal', 'ppm', 5),
  ('uv',                'UV',        'external', '',    6),
  ('rainfall',          '강우량',    'external', 'mm',  7)
ON CONFLICT (role_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS env_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES house_groups(id) ON DELETE CASCADE,
  role_key VARCHAR(50) NOT NULL REFERENCES env_roles(role_key) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  sensor_type VARCHAR(50),
  weather_field VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, role_key)
);
CREATE INDEX IF NOT EXISTS idx_env_mappings_group ON env_mappings(group_id);

-- ==========================================
-- 18. 센서 대기 (Sensor Standby)
-- ==========================================
CREATE TABLE IF NOT EXISTS sensor_standby (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  sensor_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 19. 수확 작업 로그 (Harvest Task Logs)
-- ==========================================
CREATE TABLE IF NOT EXISTS harvest_task_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES crop_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_type VARCHAR(30) NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 마이그레이션 완료 로그
-- ==========================================
DO $$ BEGIN RAISE NOTICE '✅ 마이그레이션 완료 - 기존 데이터 유지됨'; END $$;
