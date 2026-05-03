#!/bin/sh
set -e

echo "⏳ Waiting for PostgreSQL..."
until node -e "
const net = require('net');
const s = new net.Socket();
s.connect(5432, 'postgres', () => { s.destroy(); process.exit(0); });
s.on('error', () => { process.exit(1); });
" 2>/dev/null; do
  sleep 1
done
echo "✅ PostgreSQL is ready"

echo "⏳ Running database migration..."
PGPASSWORD="${POSTGRES_PASSWORD}" psql -h postgres -U smartfarm -d smartfarm -f /app/database/migrate.sql 2>&1 | tail -5
echo "✅ Migration complete"

echo "🚀 Starting application..."
exec node dist/main
