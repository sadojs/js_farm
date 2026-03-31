-- ==========================================
-- 프로덕션 마이그레이션 #2: 관수 장비 채널 매핑
-- 날짜: 2026-03-31
-- 설명: devices 테이블에 channel_mapping JSONB 컬럼 추가
--       관수 장비의 릴레이 채널 커스텀 매핑 지원
--
-- 실행 방법:
--   psql -U smartfarm -d smartfarm -h <호스트> -f 002_irrigation_channel_mapping.sql
--
-- 롤백:
--   ALTER TABLE devices DROP COLUMN IF EXISTS channel_mapping;
--
-- 주의사항:
--   1. 001_email_to_username.sql 실행 후 실행
--   2. 기존 관수 장비는 channel_mapping = NULL → 코드에서 DEFAULT_CHANNEL_MAPPING 사용
--   3. 데이터 손실 없음 (신규 컬럼 추가만)
-- ==========================================

BEGIN;

-- ==========================================
-- STEP 1: channel_mapping 컬럼 추가
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'channel_mapping'
  ) THEN
    ALTER TABLE devices ADD COLUMN channel_mapping JSONB DEFAULT NULL;

    COMMENT ON COLUMN devices.channel_mapping IS
      '관수 장비 릴레이 채널 커스텀 매핑. NULL이면 시스템 기본값 사용. 형식: {"remote_control":"switch_1","zone_1":"switch_2",...}';

    RAISE NOTICE 'STEP 1 완료: channel_mapping 컬럼 추가됨';
  ELSE
    RAISE NOTICE 'STEP 1 스킵: channel_mapping 컬럼 이미 존재';
  END IF;
END $$;

-- ==========================================
-- STEP 2: 검증
-- ==========================================
DO $$
DECLARE
  irrigation_count INT;
BEGIN
  SELECT COUNT(*) INTO irrigation_count
  FROM devices WHERE equipment_type = 'irrigation';

  RAISE NOTICE '========================================';
  RAISE NOTICE '#2 마이그레이션 완료: channel_mapping';
  RAISE NOTICE '  관수 장비 수: %건', irrigation_count;
  RAISE NOTICE '  커스텀 매핑: 모두 NULL (기본값 사용)';
  RAISE NOTICE '========================================';
  RAISE NOTICE '기본 채널 매핑 (코드에서 적용):';
  RAISE NOTICE '  remote_control  → switch_1';
  RAISE NOTICE '  fert_b_contact  → switch_6';
  RAISE NOTICE '  zone_1~4        → switch_2~5';
  RAISE NOTICE '  mixer           → switch_usb1';
  RAISE NOTICE '  fertilizer_motor→ switch_usb2';
  RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ==========================================
-- ROLLBACK (문제 발생 시)
-- ==========================================
-- ALTER TABLE devices DROP COLUMN IF EXISTS channel_mapping;
