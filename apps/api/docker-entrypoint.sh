#!/bin/sh
set -e
cd "$(dirname "$0")"
npx prisma migrate deploy
exec node dist/index.js
