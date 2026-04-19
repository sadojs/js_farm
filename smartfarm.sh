#!/bin/bash
# ==========================================
# Smart Farm Platform 관리 스크립트 (로컬)
# ==========================================

PROJECT_DIR="/Users/ohjeongseok/Projects/smart-farm-platform"
BACKEND_PLIST="com.smartfarm.backend"
FRONTEND_PLIST="com.smartfarm.frontend"

status_service() {
  local label="$1"
  local info
  info=$(launchctl list "$label" 2>/dev/null)
  if [ $? -eq 0 ]; then
    local pid
    pid=$(echo "$info" | grep '"PID"' | awk '{print $3}' | tr -d ';')
    if [ -n "$pid" ] && [ "$pid" != "-" ]; then
      echo "  ✅ $label (PID: $pid)"
    else
      echo "  ⚠️  $label (등록됨, 실행 안됨)"
    fi
  else
    echo "  ❌ $label (중지)"
  fi
}

case "$1" in
  start)
    echo "🚀 Smart Farm 서비스 시작..."
    launchctl load ~/Library/LaunchAgents/${BACKEND_PLIST}.plist 2>/dev/null || \
      launchctl kickstart -k "gui/$(id -u)/${BACKEND_PLIST}" 2>/dev/null
    launchctl load ~/Library/LaunchAgents/${FRONTEND_PLIST}.plist 2>/dev/null || \
      launchctl kickstart -k "gui/$(id -u)/${FRONTEND_PLIST}" 2>/dev/null
    sleep 2
    echo ""
    echo "📊 서비스 상태:"
    status_service "$BACKEND_PLIST"
    status_service "$FRONTEND_PLIST"
    echo ""
    echo "✅ 서비스 시작 완료"
    echo "   백엔드 API: http://localhost:3000"
    echo "   프론트엔드: http://localhost:4173"
    echo "   로그: smartfarm logs [backend|frontend]"
    ;;

  stop)
    echo "🛑 Smart Farm 서비스 중지..."
    launchctl unload ~/Library/LaunchAgents/${BACKEND_PLIST}.plist 2>/dev/null
    launchctl unload ~/Library/LaunchAgents/${FRONTEND_PLIST}.plist 2>/dev/null
    echo "✅ 서비스 중지 완료"
    ;;

  restart)
    echo "🔄 Smart Farm 서비스 재시작..."
    launchctl unload ~/Library/LaunchAgents/${BACKEND_PLIST}.plist 2>/dev/null
    launchctl unload ~/Library/LaunchAgents/${FRONTEND_PLIST}.plist 2>/dev/null
    sleep 1
    launchctl load ~/Library/LaunchAgents/${BACKEND_PLIST}.plist
    launchctl load ~/Library/LaunchAgents/${FRONTEND_PLIST}.plist
    sleep 2
    echo ""
    echo "📊 서비스 상태:"
    status_service "$BACKEND_PLIST"
    status_service "$FRONTEND_PLIST"
    echo ""
    echo "✅ 재시작 완료"
    ;;

  status)
    echo "📊 Smart Farm 서비스 상태:"
    status_service "$BACKEND_PLIST"
    status_service "$FRONTEND_PLIST"
    ;;

  logs)
    SERVICE="${2:-backend}"
    LOG_FILE="${PROJECT_DIR}/logs/${SERVICE}.stdout.log"
    ERR_FILE="${PROJECT_DIR}/logs/${SERVICE}.stderr.log"
    if [ ! -f "$LOG_FILE" ]; then
      echo "❌ 로그 파일 없음: $LOG_FILE"
      exit 1
    fi
    echo "📄 ${SERVICE} 로그 (Ctrl+C로 종료):"
    tail -f "$LOG_FILE" "$ERR_FILE" 2>/dev/null
    ;;

  build)
    echo "🔨 Smart Farm 빌드 (백엔드 + 프론트엔드)..."
    echo ""
    echo "▶ 백엔드 빌드..."
    cd "${PROJECT_DIR}/backend" && npm run build
    echo ""
    echo "▶ 프론트엔드 빌드..."
    cd "${PROJECT_DIR}/frontend" && npm run build
    echo ""
    echo "✅ 빌드 완료. 'smartfarm restart' 로 서비스 재시작하세요."
    ;;

  update)
    echo "📥 Smart Farm 업데이트..."
    cd "$PROJECT_DIR"
    git pull
    echo ""
    "$0" build
    echo ""
    "$0" restart
    ;;

  *)
    echo "Smart Farm Platform 관리 명령어"
    echo ""
    echo "사용법: smartfarm <명령어>"
    echo ""
    echo "  start           서비스 시작"
    echo "  stop            서비스 중지"
    echo "  restart         서비스 재시작"
    echo "  status          서비스 상태 확인"
    echo "  logs [service]  로그 보기 (backend|frontend, 기본: backend)"
    echo "  build           백엔드 + 프론트엔드 빌드"
    echo "  update          git pull + 빌드 + 재시작"
    ;;
esac
