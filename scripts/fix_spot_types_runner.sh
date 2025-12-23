#!/bin/bash

export GOOGLE_APPLICATION_CREDENTIALS="$(dirname "$0")/serviceAccountKey.json"

if [ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  echo "❌ serviceAccountKey.json not found in scripts directory"
  exit 1
fi

cd "$(dirname "$0")/.."
npx ts-node scripts/fix_spot_types.ts "$@"
