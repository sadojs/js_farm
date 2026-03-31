# Design: 계정 형식 변경 (Email → Username)

> Plan 문서: `docs/01-plan/features/account-username-format.plan.md`

## 1. 변경 개요

모든 계정의 식별자를 email(`test@farm.com`) → username(`test`) 형식으로 변경.

**Username 규칙**: `/^[a-z][a-z0-9_-]{2,49}$/` (영문소문자 시작, 3~50자)

## 2. Database 변경

### 2-1. schema.sql 수정

**파일**: `backend/database/schema.sql`

```sql
-- Before
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  ...
);
CREATE INDEX idx_users_email ON users(email);

-- After
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  ...
);
CREATE INDEX idx_users_username ON users(username);
```

### 2-2. 마이그레이션 SQL (기존 데이터)

```sql
-- 1단계: 중복 확인
SELECT split_part(email, '@', 1) AS uname, COUNT(*)
FROM users GROUP BY uname HAVING COUNT(*) > 1;

-- 2단계: 컬럼 변환 (중복 없을 때)
ALTER TABLE users RENAME COLUMN email TO username;
ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(100);
UPDATE users SET username = split_part(username, '@', 1);
DROP INDEX IF EXISTS idx_users_email;
CREATE INDEX idx_users_username ON users(username);
```

## 3. Backend 변경 (7개 파일)

### 3-1. User Entity

**파일**: `backend/src/modules/users/entities/user.entity.ts`

```typescript
// Before
@Column({ unique: true })
email: string;

// After
@Column({ unique: true, length: 100 })
username: string;
```

### 3-2. Login DTO

**파일**: `backend/src/modules/auth/dto/login.dto.ts`

```typescript
// Before
import { IsEmail, IsString, MinLength } from 'class-validator';
export class LoginDto {
  @IsEmail()
  email: string;

// After
import { IsString, MinLength, Matches } from 'class-validator';
export class LoginDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{2,49}$/, { message: '아이디는 영문 소문자로 시작하며 3~50자여야 합니다.' })
  username: string;
```

### 3-3. User DTO (CreateUserDto)

**파일**: `backend/src/modules/users/dto/user.dto.ts`

```typescript
// Before
import { IsEmail, IsString, MinLength, IsOptional, IsIn, IsBoolean } from 'class-validator';
export class CreateUserDto {
  @IsEmail()
  email: string;

// After
import { IsString, MinLength, Matches, IsOptional, IsIn, IsBoolean } from 'class-validator';
export class CreateUserDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{2,49}$/, { message: '아이디는 영문 소문자로 시작하며 3~50자여야 합니다.' })
  username: string;
```

### 3-4. Auth Service

**파일**: `backend/src/modules/auth/auth.service.ts`

모든 `email` 참조를 `username`으로 변경:

| 라인 | Before | After |
|------|--------|-------|
| 22 | `{ where: { email: dto.email } }` | `{ where: { username: dto.username } }` |
| 24 | `'이메일 또는 비밀번호가 올바르지 않습니다.'` | `'아이디 또는 비밀번호가 올바르지 않습니다.'` |
| 29 | (동일 메시지) | `'아이디 또는 비밀번호가 올바르지 않습니다.'` |
| 40 | `email: user.email` | `username: user.username` |
| 50 | `email: user.email` | `username: user.username` |
| 73 | `email: payload.email` | `username: payload.username` |
| 94 | `email: user.email` | `username: user.username` |

### 3-5. JWT Strategy

**파일**: `backend/src/modules/auth/strategies/jwt.strategy.ts`

```typescript
// Before
export interface JwtPayload {
  sub: string;
  email: string;
  role: 'admin' | 'farm_admin' | 'farm_user';
  parentUserId?: string | null;
}
// validate() 반환:
return { id: payload.sub, email: payload.email, role: payload.role, parentUserId: ... };

// After
export interface JwtPayload {
  sub: string;
  username: string;
  role: 'admin' | 'farm_admin' | 'farm_user';
  parentUserId?: string | null;
}
// validate() 반환:
return { id: payload.sub, username: payload.username, role: payload.role, parentUserId: ... };
```

### 3-6. Users Service

**파일**: `backend/src/modules/users/users.service.ts`

| 라인 | Before | After |
|------|--------|-------|
| 68 | `{ where: { email: dto.email } }` | `{ where: { username: dto.username } }` |
| 69 | `'이미 등록된 이메일입니다.'` | `'이미 등록된 아이디입니다.'` |
| 72 | `email: dto.email` | `username: dto.username` |

### 3-7. Users Controller

**파일**: `backend/src/modules/users/users.controller.ts`

email 참조가 있다면 username으로 변경 (현재 코드에서 직접적 email 참조 없음 — DTO 통해 처리)

## 4. Frontend 변경 (9개 파일)

### 4-1. Auth Types

**파일**: `frontend/src/types/auth.types.ts`

```typescript
// Before
export interface User {
  id: string
  email: string
  ...
}
export interface LoginRequest {
  email: string
  password: string
}

// After
export interface User {
  id: string
  username: string
  ...
}
export interface LoginRequest {
  username: string
  password: string
}
```

### 4-2. Auth API

**파일**: `frontend/src/api/auth.api.ts`

```typescript
// Before
login: (email: string, password: string) =>
  apiClient.post<LoginResponse>('/auth/login', { email, password }),

// After
login: (username: string, password: string) =>
  apiClient.post<LoginResponse>('/auth/login', { username, password }),
```

### 4-3. User API

**파일**: `frontend/src/api/user.api.ts`

```typescript
// Before
export interface CreateUserRequest {
  email: string
  ...
}

// After
export interface CreateUserRequest {
  username: string
  ...
}
```

### 4-4. Auth Store

**파일**: `frontend/src/stores/auth.store.ts`

```typescript
// Before
async function login(email: string, password: string) {
  const { data } = await authApi.login(email, password)

// After
async function login(username: string, password: string) {
  const { data } = await authApi.login(username, password)
```

### 4-5. useAuth Composable

**파일**: `frontend/src/composables/useAuth.ts`

```typescript
// Before
async function login(email: string, password: string) {
  await authStore.login(email, password)

// After
async function login(username: string, password: string) {
  await authStore.login(username, password)
```

### 4-6. Login Page

**파일**: `frontend/src/views/Login.vue`

| 위치 | Before | After |
|------|--------|-------|
| template label | `이메일` | `아이디` |
| input id/name | `email` | `username` |
| input type | `type="email"` | `type="text"` |
| input autocomplete | `autocomplete="email"` | `autocomplete="username"` |
| input v-model | `loginData.email` | `loginData.username` |
| placeholder | `your@email.com` | `아이디를 입력하세요` |
| interface LoginData | `email: string` | `username: string` |
| ref 초기값 | `email: ''` | `username: ''` |
| handleLogin | `loginData.value.email` | `loginData.value.username` |
| errorMessage | `이메일 또는 비밀번호` | `아이디 또는 비밀번호` |

### 4-7. UserManagement Page

**파일**: `frontend/src/views/UserManagement.vue`

| 위치 | Before | After |
|------|--------|-------|
| thead th | `이메일` | `아이디` |
| tbody td | `{{ user.email }}` | `{{ user.username }}` |
| interface User | `email: string` | `username: string` |
| saveUser (신규) | `email: userData.email` | `username: userData.username` |

### 4-8. UserFormModal

**파일**: `frontend/src/components/admin/UserFormModal.vue`

| 위치 | Before | After |
|------|--------|-------|
| label | `이메일 *` | `아이디 *` |
| input type | `type="email"` | `type="text"` |
| input v-model | `formData.email` | `formData.username` |
| placeholder | `user@example.com` | `영문 소문자로 시작 (3~50자)` |
| farmAdmins option | `{{ admin.email }}` | `{{ admin.username }}` |
| interface UserFormData | `email: string` | `username: string` |
| formData 초기값 | `email: ''` | `username: ''` |
| farmAdmins 타입 | `email: string` | `username: string` |
| pattern 속성 추가 | (없음) | `pattern="[a-z][a-z0-9_-]{2,49}"` |

### 4-9. ProjectAssignModal

**파일**: `frontend/src/components/admin/ProjectAssignModal.vue`

| 위치 | Before | After |
|------|--------|-------|
| template | `{{ user.email }}` | `{{ user.username }}` |
| interface | `email: string` | `username: string` |

## 5. 구현 순서

```
1. DB: schema.sql 수정 + 마이그레이션 SQL 실행
2. Backend: user.entity.ts (username 컬럼)
3. Backend: login.dto.ts, user.dto.ts (유효성 검사)
4. Backend: jwt.strategy.ts (JwtPayload 인터페이스)
5. Backend: auth.service.ts (로그인/토큰/me 로직)
6. Backend: users.service.ts (생성/중복체크)
7. Frontend: auth.types.ts (User, LoginRequest 인터페이스)
8. Frontend: auth.api.ts, user.api.ts (API 파라미터)
9. Frontend: auth.store.ts, useAuth.ts (store/composable)
10. Frontend: Login.vue (로그인 UI)
11. Frontend: UserFormModal.vue (사용자 생성/수정 UI)
12. Frontend: UserManagement.vue (사용자 목록 UI)
13. Frontend: ProjectAssignModal.vue (프로젝트 할당 모달)
```

## 6. 체크리스트

- [ ] DB 마이그레이션 전 username 중복 확인
- [ ] backend `@IsEmail()` 완전 제거 확인
- [ ] JWT payload `email` → `username` 변경 확인
- [ ] 에러 메시지 "이메일" → "아이디" 변경 확인
- [ ] 프론트엔드 input type="email" → type="text" 변경 확인
- [ ] 프론트엔드 autocomplete="email" → "username" 변경 확인
- [ ] farmAdmins 드롭다운에서 email → username 표시 확인
- [ ] 기존 토큰 무효화로 인한 재로그인 정상 동작 확인
