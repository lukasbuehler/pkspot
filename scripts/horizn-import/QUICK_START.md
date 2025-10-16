# 🚀 QUICK START - Horizn Import

## Before You Start

1. ✅ Have Horizn data in `scripts/horizn-import/data/`
2. ✅ Downloaded Firebase service account key
3. ✅ Know your Storage bucket name

## 3-Step Setup

### 1️⃣ Install Dependencies

```bash
cd scripts/horizn-import
npm install
```

### 2️⃣ Add Service Account Key

- Download from Firebase Console → Project Settings → Service Accounts
- Save as `scripts/horizn-import/serviceAccountKey.json`

### 3️⃣ Configure Storage Bucket

Edit `scripts/horizn-import/import.ts` line 30:

```typescript
storageBucket: 'pkfrspot.appspot.com', // Your actual bucket
```

## Import Process

### Step 1: Validate

```bash
npm run import:horizn:validate
```

Checks for missing images, bad coordinates, etc.

### Step 2: Test with 3 Spots

```bash
npm run import:horizn:test
```

**⚠️ DO THIS FIRST!** Imports only 3 spots to verify everything works.

### Step 3: Check Your App

- Do the 3 spots appear on the map?
- Do images display correctly?
- Is metadata present?

### Step 4: Full Import (if test worked)

```bash
npm run import:horizn
```

Imports all spots. Takes 2-4 hours.

## Troubleshooting

| Problem                          | Solution                                                 |
| -------------------------------- | -------------------------------------------------------- |
| "Service account key not found"  | Add `serviceAccountKey.json` to `scripts/horizn-import/` |
| "Please configure storageBucket" | Edit `import.ts` line 30 with your bucket                |
| "Invalid src format"             | This shouldn't happen anymore - contact dev              |
| TypeScript errors                | Run `cd scripts/horizn-import && npx tsc` to see details |
| Images not displaying            | Check Storage bucket name is correct                     |

## Safety Features

- ✅ Duplicate detection (safe to run multiple times)
- ✅ Test mode (try 3 spots first)
- ✅ Dry run available (`npm run import:horizn:dry`)
- ✅ Batch processing (won't overwhelm Firebase)

## What Gets Created

For each spot:

- ✅ Firestore document in `spots` collection
- ✅ Images uploaded to `spot_pictures/` in Storage
- ✅ Full URLs with access tokens
- ✅ Proper metadata (uid, isInStorage, origin)
- ✅ Tile coordinates for map clustering
- ✅ Address, type, tags preserved

## Expected Results

- **Time**: 2-4 hours for full import
- **Spots**: 500-1000+
- **Images**: 2,000-5,000+
- **Success rate**: >95%

## Commands Cheat Sheet

```bash
# Validate data
npm run import:horizn:validate

# Test with 3 spots (ALWAYS DO THIS FIRST!)
npm run import:horizn:test

# Dry run (no changes)
npm run import:horizn:dry

# Full import
npm run import:horizn

# Compile TypeScript manually
cd scripts/horizn-import && npx tsc
```

## Need More Info?

📖 Full documentation: `scripts/horizn-import/README.md`
