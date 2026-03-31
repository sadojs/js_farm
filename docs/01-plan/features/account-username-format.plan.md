# Plan: 계정 형식 변경 (Email → Username)

## 개요

현재 email 형식(`test@farm.com`)으로 관리되는 계정 시스템을 일반 username 형식(`test`)으로 변경한다.
기존 계정들의 email에서 `@` 이전 부분을 username으로 마이그레이션하고, 신규 계정 생성/로그인도 username 기반으로 전환한다.

## 변경 범위

### 1. Database (schema.sql)

| 항목 | Before | After |
|------|--------|-------|
| 컬럼명 | `email VARCHAR(255) UNIQUE NOT NULL` | `username VARCHAR(100) UNIQUE NOT NULL` |
| 인덱스 | `idx_users_email` | `idx_users_username` |
| 제약조건 | 이메일 형식 | 영문소문자+숫자+하이픈+언더스코어, 3~50자 |

### 2. Backend 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `backend/database/schema.sql` | email → username 컬럼, 인덱스 변경 |
| `backend/src/modules/users/entities/user.entity.ts` | email 필드 → username, 데코레이터 변경 |
| `backend/src/modules/auth/dto/login.dto.ts` | `@IsEmail()` → `@IsString() @Matches()`, 필드명 변경 |
| `backend/src/modules/users/dto/user.dto.ts` | CreateUserDto, UpdateUserDto의 email → username |
| `backend/src/modules/auth/auth.service.ts` | login()에서 email → username 조회 |
| `backend/src/modules/auth/strategies/jwt.strategy.ts` | JWT payload의 email → username |
| `backend/src/modules/users/users.service.ts` | create/update에서 email → username, 중복 체크 메시지 |
| `backend/src/modules/users/users.controller.ts` | Swagger 문서 등 email 참조 변경 |

### 3. Frontend 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/views/Login.vue` | input type="email" → type="text", 라벨/placeholder 변경 |
| `frontend/src/api/auth.api.ts` | login 파라미터 email → username |
| `frontend/src/stores/auth.store.ts` | login() 파라미터, user 타입 |
| `frontend/src/types/auth.types.ts` | User 인터페이스 email → username |
| `frontend/src/views/UserManagement.vue` | 테이블 컬럼, 표시 텍스트 |
| `frontend/src/components/admin/UserFormModal.vue` | 입력 필드, 유효성 검사 |

### 4. 기존 데이터 마이그레이션

```sql
-- 기존 email에서 @ 앞 부분을 username으로 추출
-- test@farm.com → test
-- admin@smartfarm.io → admin
ALTER TABLE users ADD COLUMN username VARCHAR(100);
UPDATE users SET username = split_part(email, '@', 1);
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
CREATE INDEX idx_users_username ON users(username);
DROP INDEX IF EXISTS idx_users_email;
```

> **주의**: username 중복 가능성 확인 필요 (예: `test@a.com`, `test@b.com` → 둘 다 `test`)

## Username 규칙

- 3~50자
- 영문 소문자, 숫자, 하이픈(`-`), 언더스코어(`_`) 허용
- 첫 글자는 영문 소문자
- 정규식: `/^[a-z][a-z0-9_-]{2,49}$/`

## 구현 순서

1. DB 마이그레이션 SQL 작성 + 중복 username 체크
2. Backend Entity/DTO/Service 수정
3. Frontend 타입/API/Store 수정
4. Frontend 뷰 컴포넌트 수정
5. 통합 테스트 (로그인, 사용자 생성, 목록 조회)

## 영향 범위 확인

- JWT 토큰: payload에 email 대신 username 포함 → **기존 토큰 무효화됨** (재로그인 필요)
- i18n: 로그인 페이지 라벨 한/영 수정
- 다른 모듈에서 user.email 참조하는 곳 확인 필요

## 위험 요소

| 위험 | 대응 |
|------|------|
| 기존 email에서 추출한 username 중복 | 마이그레이션 전 중복 체크 쿼리 실행 |
| JWT 토큰 호환성 | 마이그레이션 후 모든 사용자 재로그인 필요 (기존 토큰 email 필드 없음) |
| 외부 시스템 연동 | email이 외부 서비스 식별자로 사용되는지 확인 |
