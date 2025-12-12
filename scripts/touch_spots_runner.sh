#!/bin/bash

# Get Firebase token from local Firebase CLI configuration
FIREBASE_TOKEN=$(cat ~/.config/configstore/firebase-tools.json 2>/dev/null | grep -o '"refresh_token":"[^"]*' | sed 's/"refresh_token":"//' || echo "")

if [ -z "$FIREBASE_TOKEN" ]; then
  echo "❌ No Firebase token found. Please run 'firebase login' first."
  exit 1
fi

# Run the ts-node script with GOOGLE_APPLICATION_CREDENTIALS pointing to Firebase CLI
export GOOGLE_APPLICATION_CREDENTIALS="${HOME}/.config/gcloud/application_default_credentials.json"

cd "$(dirname "$0")/.."
npx ts-node scripts/touch_spots.ts
