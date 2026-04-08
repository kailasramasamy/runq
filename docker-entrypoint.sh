#!/bin/sh
set -e

echo "Running database setup (schema push + seeding)..."
cd /app/packages/db && npx drizzle-kit push --force && npx tsx seeds/setup.ts
echo "Database setup complete."

echo "Starting API server..."
cd /app/apps/api && exec npx tsx src/index.ts
