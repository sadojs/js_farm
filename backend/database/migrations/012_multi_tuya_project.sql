-- 다중 Tuya 프로젝트 지원: 유저당 복수 API 계정 연동

-- 1. tuya_projects: user_id UNIQUE 제약 제거, label 컬럼 추가
ALTER TABLE tuya_projects
  DROP CONSTRAINT IF EXISTS tuya_projects_user_id_key;

ALTER TABLE tuya_projects
  ADD COLUMN IF NOT EXISTS label VARCHAR(100);

-- 기존 레코드 label 기본값 채우기
UPDATE tuya_projects SET label = name WHERE label IS NULL;

-- 2. devices: tuya_project_id FK 추가 (nullable, ON DELETE SET NULL)
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS tuya_project_id UUID
    REFERENCES tuya_projects(id) ON DELETE SET NULL;
