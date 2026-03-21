#!/bin/bash
set -e

echo "=== runQ Deployment ==="

# Build
echo "Building..."
pnpm turbo build

# Copy frontend build
echo "Deploying frontend..."
sudo cp -r apps/web/dist/* /var/www/runq/web/

# Deploy API
echo "Deploying API..."
cd apps/api
pm2 reload ecosystem.config.js --env production

# Run migrations
echo "Running migrations..."
cd ../../packages/db
pnpm db:migrate

echo "=== Deployment complete ==="
