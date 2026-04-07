#!/bin/bash
set -e

echo "=== runQ Deployment ==="

# Build
echo "Building..."
pnpm turbo build

# Run migrations BEFORE restarting API (schema must be ready for new code)
echo "Running migrations..."
cd packages/db
pnpm db:migrate
cd ../..

# Copy frontend build
echo "Deploying frontend..."
sudo cp -r apps/web/dist/* /var/www/runq/web/

# Deploy API (after migrations are applied)
echo "Deploying API..."
cd apps/api
pm2 reload ecosystem.config.js --env production

echo "=== Deployment complete ==="
