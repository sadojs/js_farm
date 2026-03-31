#!/bin/bash
# ==========================================
# 프로덕션 마이그레이션 실행 스크립트
# 날짜: 2026-03-31
#
# 사용법:
#   ./run-all.sh <DB호스트> [DB유저] [DB이름]
#
# 예시:
#   ./run-all.sh localhost                        # 로컬
#   ./run-all.sh prod-db.example.com              # 프로덕션
#   ./run-all.sh prod-db.example.com smartfarm smartfarm
# ==========================================

set -e

DB_HOST="${1:?DB 호스트를 입력하세요 (예: localhost, prod-db.example.com)}"
DB_USER="${2:-smartfarm}"
DB_NAME="${3:-smartfarm}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo "프로덕션 마이그레이션 시작"
echo "  호스트: $DB_HOST"
echo "  사용자: $DB_USER"
echo "  DB:     $DB_NAME"
echo "=========================================="
echo ""

# 백업 안내
echo "[!] 반드시 DB 백업을 먼저 수행하세요:"
echo "    pg_dump -U $DB_USER -d $DB_NAME -h $DB_HOST > backup_$(date +%Y%m%d_%H%M%S).sql"
echo ""
read -p "백업을 완료했습니까? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "마이그레이션을 취소합니다."
  exit 1
fi

echo ""
echo "---------- #1: email → username ----------"
psql -U "$DB_USER" -d "$DB_NAME" -h "$DB_HOST" -f "$SCRIPT_DIR/001_email_to_username.sql"

echo ""
echo "---------- #2: channel_mapping 추가 ----------"
psql -U "$DB_USER" -d "$DB_NAME" -h "$DB_HOST" -f "$SCRIPT_DIR/002_irrigation_channel_mapping.sql"

echo ""
echo "=========================================="
echo "모든 마이그레이션 완료!"
echo ""
echo "다음 단계:"
echo "  1. 소스 코드 배포"
echo "  2. 백엔드 서버 재시작"
echo "  3. 사용자 안내: 재로그인 필요"
echo "     - 기존 이메일 앞부분이 아이디"
echo "     - 예: admin@farm.com → admin"
echo "=========================================="
