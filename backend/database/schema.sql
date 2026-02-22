-- ==========================================
-- 스마트 농업 플랫폼 데이터베이스 스키마
-- ==========================================

-- TimescaleDB 확장 활성화
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ==========================================
-- 1. 사용자 관리
-- ==========================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'farm_admin', 'farm_user')),
  parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  address TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_parent ON users(parent_user_id);

-- ==========================================
-- 2. Tuya 프로젝트 설정
-- ==========================================

CREATE TABLE tuya_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  access_id VARCHAR(255) NOT NULL,
  access_secret_encrypted TEXT NOT NULL, -- AES-256 암호화
  endpoint VARCHAR(255) NOT NULL,
  project_id VARCHAR(255),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_tuya_projects_user_id ON tuya_projects(user_id);

-- ==========================================
-- 3. 하우스 그룹
-- ==========================================

CREATE TABLE house_groups (
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

CREATE INDEX idx_house_groups_user_id ON house_groups(user_id);

-- ==========================================
-- 4. 하우스동
-- ==========================================

CREATE TABLE houses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES house_groups(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  description TEXT,
  area DECIMAL(10, 2), -- 평수
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_houses_user_id ON houses(user_id);
CREATE INDEX idx_houses_group_id ON houses(group_id);

-- ==========================================
-- 5. 장비 (Devices)
-- ==========================================

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  house_id UUID REFERENCES houses(id) ON DELETE SET NULL,
  tuya_device_id VARCHAR(255) NOT NULL, -- Tuya Cloud의 실제 장비 ID
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL, -- '온도 센서', '환풍기', '개폐기' 등
  device_type VARCHAR(50) NOT NULL, -- 'sensor', 'actuator'
  equipment_type VARCHAR(50), -- 'opener', 'fan', 'irrigation', 'other' (액추에이터용)
  icon VARCHAR(50),
  online BOOLEAN DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, tuya_device_id)
);

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_house_id ON devices(house_id);
CREATE INDEX idx_devices_tuya_device_id ON devices(tuya_device_id);
CREATE INDEX idx_devices_category ON devices(category);

-- ==========================================
-- 5-1. 그룹-장비 연결 (다대다)
-- ==========================================

CREATE TABLE group_devices (
  group_id UUID NOT NULL REFERENCES house_groups(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, device_id)
);

CREATE INDEX idx_group_devices_group_id ON group_devices(group_id);
CREATE INDEX idx_group_devices_device_id ON group_devices(device_id);

-- ==========================================
-- 6. 센서 데이터 (시계열 데이터) - TimescaleDB Hypertable
-- ==========================================

CREATE TABLE sensor_data (
  time TIMESTAMP WITH TIME ZONE NOT NULL,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sensor_type VARCHAR(50) NOT NULL, -- 'temperature', 'humidity', 'co2', 'light', 'soil_moisture', 'ph', 'ec'
  value DECIMAL(10, 4) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'normal' CHECK (status IN ('normal', 'warning', 'critical')),
  metadata JSONB -- 추가 메타데이터
);

-- TimescaleDB Hypertable로 변환
SELECT create_hypertable('sensor_data', 'time');

-- 인덱스 생성
CREATE INDEX idx_sensor_data_device_id ON sensor_data(device_id, time DESC);
CREATE INDEX idx_sensor_data_user_id ON sensor_data(user_id, time DESC);
CREATE INDEX idx_sensor_data_sensor_type ON sensor_data(sensor_type, time DESC);

-- ==========================================
-- 7. 연속 집계 (Continuous Aggregates) - 성능 최적화
-- ==========================================

-- 1시간 단위 집계
CREATE MATERIALIZED VIEW sensor_data_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  device_id,
  user_id,
  sensor_type,
  AVG(value) as avg_value,
  MIN(value) as min_value,
  MAX(value) as max_value,
  COUNT(*) as sample_count
FROM sensor_data
GROUP BY bucket, device_id, user_id, sensor_type
WITH NO DATA;

-- 1일 단위 집계
CREATE MATERIALIZED VIEW sensor_data_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  device_id,
  user_id,
  sensor_type,
  AVG(value) as avg_value,
  MIN(value) as min_value,
  MAX(value) as max_value,
  COUNT(*) as sample_count
FROM sensor_data
GROUP BY bucket, device_id, user_id, sensor_type
WITH NO DATA;

-- 집계 정책 설정 (자동 업데이트)
SELECT add_continuous_aggregate_policy('sensor_data_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

SELECT add_continuous_aggregate_policy('sensor_data_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day');

-- ==========================================
-- 8. 데이터 보존 정책 (Retention Policy)
-- ==========================================

-- 원시 데이터는 3개월 보관
SELECT add_retention_policy('sensor_data', INTERVAL '3 months');

-- ==========================================
-- 8-1. 날씨 데이터 (시계열 데이터) - TimescaleDB Hypertable
-- ==========================================

CREATE TABLE weather_data (
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

SELECT create_hypertable('weather_data', 'time');
CREATE INDEX idx_weather_data_user ON weather_data(user_id, time DESC);

-- ==========================================
-- 9. 자동화 룰
-- ==========================================

CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES house_groups(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  rule_type VARCHAR(50) NOT NULL, -- 'weather', 'time', 'hybrid'
  enabled BOOLEAN DEFAULT true,
  conditions JSONB NOT NULL, -- 조건들 (JSON 형태)
  actions JSONB NOT NULL, -- 액션들 (JSON 형태)
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_automation_rules_user_id ON automation_rules(user_id);
CREATE INDEX idx_automation_rules_enabled ON automation_rules(enabled);

-- ==========================================
-- 10. 자동화 실행 로그
-- ==========================================

CREATE TABLE automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  conditions_met JSONB,
  actions_executed JSONB,
  error_message TEXT
);

CREATE INDEX idx_automation_logs_rule_id ON automation_logs(rule_id, executed_at DESC);
CREATE INDEX idx_automation_logs_user_id ON automation_logs(user_id, executed_at DESC);

-- ==========================================
-- 11. 알림
-- ==========================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'alert', 'warning', 'info'
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_read ON notifications(read);

-- ==========================================
-- 12. 사용자 설정
-- ==========================================

CREATE TABLE user_settings (
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

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tuya_projects_updated_at BEFORE UPDATE ON tuya_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_house_groups_updated_at BEFORE UPDATE ON house_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_houses_updated_at BEFORE UPDATE ON houses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 샘플 데이터 (개발/테스트용)
-- ==========================================

-- 관리자 계정 (비밀번호: admin123)
INSERT INTO users (email, password_hash, name, role, address)
VALUES ('admin@farm.com', '$2b$10$placeholder_hash', '관리자', 'admin', '서울시 강남구');

-- 테스트 농장 관리자 (비밀번호: user123)
INSERT INTO users (email, password_hash, name, role, address)
VALUES ('user@farm.com', '$2b$10$placeholder_hash', '김농부', 'farm_admin', '경기도 화성시 농업로 123');

-- 코멘트
COMMENT ON TABLE sensor_data IS '센서 시계열 데이터 (TimescaleDB Hypertable)';
COMMENT ON TABLE sensor_data_hourly IS '1시간 단위 센서 데이터 집계';
COMMENT ON TABLE sensor_data_daily IS '1일 단위 센서 데이터 집계';
COMMENT ON TABLE devices IS 'IoT 장비 정보 (센서, 액추에이터)';
COMMENT ON TABLE automation_rules IS '자동화 규칙';
COMMENT ON TABLE automation_logs IS '자동화 실행 로그';
