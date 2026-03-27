#!/bin/bash
# ==========================================
# Smart Farm Platform 관리 스크립트
# ==========================================

PROJECT_DIR="/Users/jeongseok/Projects/smart-farm-platform"
cd "$PROJECT_DIR" || { echo "❌ 프로젝트 디렉토리를 찾을 수 없습니다."; exit 1; }

# Docker 데몬 실행 확인 및 시작
ensure_docker() {
  if docker info &>/dev/null; then
    return 0
  fi

  echo "🐳 Docker가 실행되어 있지 않습니다. Docker Desktop을 시작합니다..."
  open -a Docker

  local max_wait=60
  local waited=0
  while ! docker info &>/dev/null; do
    if [ $waited -ge $max_wait ]; then
      echo "❌ Docker 시작 시간 초과 (${max_wait}초). Docker Desktop을 수동으로 실행해주세요."
      exit 1
    fi
    sleep 2
    waited=$((waited + 2))
    printf "\r   대기 중... %d초" "$waited"
  done
  echo ""
  echo "✅ Docker가 시작되었습니다."
}

# 모든 서비스가 실행 중인지 확인하고, 중지된 서비스 시작
ensure_services() {
  local stopped
  stopped=$(docker compose ps -a --format '{{.Service}} {{.State}}' 2>/dev/null | grep -v "running" | awk '{print $1}')

  if [ -n "$stopped" ]; then
    echo "🔄 중지된 서비스를 시작합니다: $stopped"
    docker compose up -d $stopped
  fi
}

case "$1" in
  start)
    echo "🚀 Smart Farm 서비스 시작..."
    ensure_docker
    ensure_services
    docker compose up -d --build
    echo ""
    docker compose ps
    echo ""
    echo "✅ 서비스 시작 완료"
    echo "   프론트엔드: http://localhost"
    echo "   백엔드 API: http://localhost:3000"
    ;;

  stop)
    echo "🛑 Smart Farm 서비스 중지..."
    docker compose down
    echo "✅ 서비스 중지 완료"
    ;;

  restart)
    echo "🔄 Smart Farm 서비스 재시작..."
    ensure_docker
    docker compose down
    docker compose up -d --build
    echo ""
    docker compose ps
    echo ""
    echo "✅ 서비스 재시작 완료"
    ;;

  status)
    docker compose ps
    ;;

  logs)
    SERVICE="${2:-backend}"
    docker compose logs -f --tail 50 "$SERVICE"
    ;;

  update)
    echo "📥 최신 코드 가져오기..."
    git pull
    echo ""
    echo "🔄 서비스 재빌드 및 재시작..."
    ensure_docker
    docker compose build --no-cache
    docker compose up -d
    echo ""
    docker compose ps
    echo ""
    echo "✅ 업데이트 완료"
    ;;

  *)
    echo "Smart Farm Platform 관리 스크립트"
    echo ""
    echo "사용법: farm <명령어>"
    echo ""
    echo "  start     서비스 시작 (빌드 포함)"
    echo "  stop      서비스 중지"
    echo "  restart   서비스 재시작 (빌드 포함)"
    echo "  status    서비스 상태 확인"
    echo "  logs      로그 보기 (기본: backend, 예: farm logs frontend)"
    echo "  update    git pull + 재빌드 + 재시작"
    ;;
esac
