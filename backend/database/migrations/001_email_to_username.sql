-- ==========================================
-- 프로덕션 마이그레이션 #1: email → username
-- 날짜: 2026-03-31
-- 설명: 계정 식별자를 email 형식에서 일반 username 형식으로 변경
--
-- 실행 방법:
--   psql -U smartfarm -d smartfarm -h <호스트> -f 001_email_to_username.sql
--
-- 롤백:
--   파일 하단 ROLLBACK 섹션 참고
--
-- 주의사항:
--   1. 반드시 백업 후 실행
--   2. 실행 후 백엔드 재시작 필요 (TypeORM 엔티티가 username 컬럼 참조)
--   3. 기존 JWT 토큰 무효화됨 → 모든 사용자 재로그인 필요
-- ==========================================

BEGIN;

-- ==========================================
-- STEP 0: 사전 검증 — email 컬럼 존재 확인
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    RAISE NOTICE '이미 마이그레이션 완료됨 (email 컬럼 없음). 스킵합니다.';
    RETURN;
  END IF;
END $$;

-- ==========================================
-- STEP 1: 중복 검사 — email @ 앞부분이 겹치는 계정이 있는지 확인
-- ==========================================
DO $$
DECLARE
  dup_count INT;
  dup_list TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT split_part(email, '@', 1) AS uname
    FROM users
    GROUP BY uname
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    SELECT string_agg(uname || ' (' || cnt || '건)', ', ') INTO dup_list
    FROM (
      SELECT split_part(email, '@', 1) AS uname, COUNT(*) AS cnt
      FROM users
      GROUP BY uname
      HAVING COUNT(*) > 1
    ) dups;

    RAISE EXCEPTION '중복 username 발견: %. 수동 해결 후 다시 실행하세요.', dup_list;
  END IF;

  RAISE NOTICE 'STEP 1 완료: 중복 없음 (%건 검사)', (SELECT COUNT(*) FROM users);
END $$;

-- ==========================================
-- STEP 2: username 컬럼 추가 + 데이터 마이그레이션
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'username'
  ) THEN
    ALTER TABLE users ADD COLUMN username VARCHAR(100);
  END IF;

  UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL;

  RAISE NOTICE 'STEP 2 완료: username 데이터 마이그레이션됨';
END $$;

-- ==========================================
-- STEP 3: username NOT NULL + UNIQUE 제약조건 + 인덱스
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE users ALTER COLUMN username SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_username_key' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;

  RAISE NOTICE 'STEP 3 완료: NOT NULL + UNIQUE 제약조건 설정됨';
END $$;

-- ==========================================
-- STEP 4: email 컬럼 및 관련 인덱스 삭제
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE users DROP COLUMN email;
  DROP INDEX IF EXISTS idx_users_email;
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

  RAISE NOTICE 'STEP 4 완료: email 컬럼 삭제, username 인덱스 생성';
END $$;

-- ==========================================
-- STEP 5: 결과 검증
-- ==========================================
DO $$
DECLARE
  user_count INT;
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM users;
  SELECT COUNT(*) INTO null_count FROM users WHERE username IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION '검증 실패: username이 NULL인 레코드 %건 발견', null_count;
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE '#1 마이그레이션 완료: email → username';
  RAISE NOTICE '  총 사용자: %건', user_count;
  RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ==========================================
-- ROLLBACK (문제 발생 시 수동 실행)
-- ==========================================
-- BEGIN;
-- ALTER TABLE users ADD COLUMN email VARCHAR(255);
-- UPDATE users SET email = username || '@farm.com';
-- ALTER TABLE users ALTER COLUMN email SET NOT NULL;
-- ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
-- CREATE INDEX idx_users_email ON users(email);
-- ALTER TABLE users DROP COLUMN username;
-- DROP INDEX IF EXISTS idx_users_username;
-- COMMIT;
