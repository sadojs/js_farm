# Gap Analysis: account-username-format

## 분석 결과

| 항목 | 점수 |
|------|------|
| Design Match | 98% → **100%** (수정 후) |
| Architecture Compliance | 100% |
| Convention Compliance | 100% |
| **Overall** | **100%** |

## 검증 항목 (52개)

### Database (5/5)
- schema.sql: `username VARCHAR(100) UNIQUE NOT NULL` ✅
- schema.sql: `idx_users_username` 인덱스 ✅
- migrate.sql: email→username 자동 마이그레이션 블록 ✅
- seed-local.sql: username 기반 INSERT ✅
- schema.sql 시드 데이터: ~~email~~ → username ✅ (수정됨)

### Backend (18/18)
- user.entity.ts: `@Column({ unique: true, length: 100 }) username` ✅
- login.dto.ts: `@Matches()` + `username` ✅
- user.dto.ts: CreateUserDto `username` ✅
- jwt.strategy.ts: JwtPayload `username` ✅
- auth.service.ts: login/refresh/getMe 모든 email→username ✅
- users.service.ts: create 중복체크 + 메시지 ✅
- `@IsEmail()` 완전 제거 확인 ✅

### Frontend (29/29)
- auth.types.ts: User/LoginRequest `username` ✅
- auth.api.ts: login 파라미터 `username` ✅
- user.api.ts: CreateUserRequest `username` ✅
- auth.store.ts: login(username, password) ✅
- useAuth.ts: login(username, password) ✅
- Login.vue: 라벨/input/placeholder/pattern/autocomplete ✅
- UserManagement.vue: 테이블/인터페이스/saveUser ✅
- UserFormModal.vue: 라벨/input/farmAdmins/초기값 ✅
- ProjectAssignModal.vue: 표시/인터페이스 ✅

## Gap 목록

| # | 심각도 | 파일 | 설명 | 상태 |
|---|--------|------|------|------|
| 1 | YELLOW | schema.sql L331-336 | 시드 데이터 email → username 미변경 | ✅ 수정 완료 |

## 결론

수정 후 **Match Rate 100%**. 모든 Design 항목이 구현에 반영됨.
