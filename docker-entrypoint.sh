#!/bin/sh
set -e

echo "Running database setup (schema push + seeding)..."
cd /app/packages/db && npx drizzle-kit push && npx tsx seeds/setup.ts
echo "Database setup complete."

echo "Starting API server..."
exec node /app/dist/index.js
