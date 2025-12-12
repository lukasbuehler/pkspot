#!/bin/bash
#
# Firebase Admin Script Runner
# This script helps run TypeScript admin scripts with proper Firebase authentication
#

SCRIPT_NAME="${1}"

if [ -z "$SCRIPT_NAME" ]; then
  echo "Usage: $0 <script.ts>"
  exit 1
fi

# Check if service account key exists
if [ ! -f "scripts/serviceAccountKey.json" ]; then
  echo "❌ Service account key not found at scripts/serviceAccountKey.json"
  echo ""
  echo "To fix this, follow these steps:"
  echo "1. Go to Firebase Console: https://console.firebase.google.com"
  echo "2. Select project 'parkour-base-project'"
  echo "3. Go to Project Settings → Service Accounts"
  echo "4. Click 'Generate new private key'"
  echo "5. Save the JSON file as 'scripts/serviceAccountKey.json'"
  echo ""
  echo "Then run: $0 $SCRIPT_NAME"
  exit 1
fi

# Run with ts-node using the service account key
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/scripts/serviceAccountKey.json"
npx ts-node "$SCRIPT_NAME"
