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

# Apply / re-apply RLS policies. Idempotent — drops + recreates each
# tenant_isolation_* policy from the RLS_TABLES list, so any new tables
# added in the latest deploy automatically get policies. Skipped if
# APP_ROLE_PASSWORD is unset (the script requires it to create the role
# on first run, but it's optional in dev/staging tiers that don't enforce RLS).
if [ -n "$APP_ROLE_PASSWORD" ]; then
  echo "Applying RLS policies..."
  npx tsx scripts/apply-rls.ts
else
  echo "Skipping RLS (APP_ROLE_PASSWORD not set)"
fi

echo "Starting API server..."
cd /app/apps/api && exec npx tsx src/index.ts
