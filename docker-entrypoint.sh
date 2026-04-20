#!/bin/sh
set -e

echo "Running prisma migrate deploy..."
# Run migrations by default. Set MIGRATE_ON_START=false to skip in dev.
if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
	attempts=0
	max_attempts=30
	until npx prisma migrate deploy --schema=prisma/schema.prisma
	do
		attempts=$((attempts+1))
		echo "Prisma migrate attempt $attempts/$max_attempts failed, retrying in 2s..."
		if [ "$attempts" -ge "$max_attempts" ]; then
			echo "Prisma migrations failed after $max_attempts attempts"
			exit 1
		fi
		sleep 2
	done
else
	echo "MIGRATE_ON_START=false, skipping migrations"
fi

echo "Starting app..."
exec "$@"
