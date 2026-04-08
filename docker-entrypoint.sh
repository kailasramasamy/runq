#!/bin/sh
set -e

echo "Running pre-push SQL migrations..."
cd /app/packages/db
if [ -d migrations ] && ls migrations/*.sql >/dev/null 2>&1; then
  for f in migrations/*.sql; do
    echo "  applying $f"
    npx tsx scripts/run-sql.ts "$f"
  done
fi

echo "Running database setup (schema push + seeding)..."
npx drizzle-kit push --force && npx tsx seeds/setup.ts
echo "Database setup complete."

echo "Starting API server..."
cd /app/apps/api && exec npx tsx src/index.ts
