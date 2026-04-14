#!/bin/sh
set -e

echo "Running prisma migrate deploy..."
# Attempt to run migrations (non-interactive)
npx prisma migrate deploy --schema=prisma/schema.prisma || true

echo "Starting app..."
exec "$@"
