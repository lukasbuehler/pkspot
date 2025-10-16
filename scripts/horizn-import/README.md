# Horizn Spot Import

Complete TypeScript-based import system for migrating parkour spots from the Horizn app into PK Spot.

## 🎯 What This Does

Imports parkour spot data from Horizn app's JSON export into your PK Spot Firestore database:

- ✅ **Type-safe**: Uses your actual TypeScript schemas
- ✅ **Duplicate detection**: Checks location + name before importing
- ✅ **Full Storage URLs**: Gets download URLs with tokens (not just paths)
- ✅ **Proper metadata**: Sets `uid`, `isInStorage`, `origin` fields correctly
- ✅ **Test mode**: Import 1-3 spots first to verify everything works
- ✅ **Dry run**: Validate without writing any data
- ✅ **Schema compliant**: Matches your `SpotSchema` exactly

## 📋 Prerequisites

1. **Firebase service account key**

   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save as `scripts/horizn-import/serviceAccountKey.json`

2. **Horizn data** (already in place)

   - `data/horizn-spots-output.json` - Spot data
   - `data/spots_pics/` - Image files

3. **Firebase Storage bucket name**
   - Find in Firebase Console → Storage
   - Format: `your-project-id.appspot.com`

## 🚀 Quick Start

### Step 1: Configure

Edit `scripts/horizn-import/import.ts` and change:

```typescript
storageBucket: 'YOUR-PROJECT-ID.appspot.com', // Line 30
```

### Step 2: Compile TypeScript

```bash
cd scripts/horizn-import
npx tsc
├── upload-images.ts       # Upload media after spots are created
├── config.ts              # Shared config factory
```

### Step 3: Validate Data

```bash
npm run import:horizn:validate
```

├── data/ # Horizn data (gitignored)

### Optional: Test with 3 spots first

└── output/ # Spot ID mapping (gitignored)

```bash
npm run import:horizn:test
```

Creates three spot documents without images so you can verify duplicates,
mapping output, and schema before the full run.

### Step 4: Import spots (no media yet)

```bash
npm run import:horizn:spots
```

Creates all spot documents without uploading images. This run generates
`scripts/horizn-import/output/spot-id-map.json`, which records the Firestore ID
for each Horizn entry so you can upload images later.

### Step 5: Upload images when ready

```bash
npm run import:horizn:images
```

Reads the mapping file and uploads images for every spot that has a Firestore
ID. You can run this multiple times; it skips entries that already have media.

### Optional: One-shot import (spots + media)

```bash
npm run import:horizn
```

Runs the legacy behaviour and uploads images immediately after creating each
spot. Use this only if you really need a single-pass import.

## 🛠️ Available Commands

```bash
# Validate Horizn data
npm run import:horizn:validate

# Test with 3 spots only
npm run import:horizn:test

# Dry run (validate without writing)
npm run import:horizn:dry

# Full import
npm run import:horizn
```

## 📁 Project Structure

```
scripts/horizn-import/
├── import.ts              # Main entry point
├── validate.ts            # Data validator
├── types.ts               # TypeScript type definitions
├── importEngine.ts        # Core orchestration logic
├── spotTransformer.ts     # Horizn → SpotSchema converter
├── storageUploader.ts     # Firebase Storage uploader
├── duplicateChecker.ts    # Duplicate detection
├── tsconfig.json          # TypeScript configuration
├── serviceAccountKey.json # ⚠️ You provide this (gitignored)
└── data/                  # Horizn data (gitignored)
    ├── horizn-spots-output.json
    └── spots_pics/
```

## 🔍 How It Works

### 1. Duplicate Detection

Before importing, checks if a spot already exists by:

- Finding spots within 50 meters
- Comparing normalized names
- Skips if duplicate found

### 2. Image Upload Process

The import now works in two phases:

1. **Spots run (`--spots-only`)** – creates the Firestore documents and writes
   `output/spot-id-map.json` with the Horizn index → Spot ID mapping plus the
   expected image filenames.
2. **Image run (`upload-images.ts`)** – reads the mapping file, uploads each
   image to `spot_pictures/`, and patches the corresponding document once the
   uploads succeed.

During the image run every file is uploaded with metadata `{ uid: importerId }`
and we request a signed URL so `StorageMedia` immediately works in the app.
Cloud functions still process the uploaded images automatically (thumbnails,
etc.).

### 3. Schema Transformation

Converts Horizn format to your `SpotSchema`:

| Horizn Field            | PK Spot Field                     | Notes                                              |
| ----------------------- | --------------------------------- | -------------------------------------------------- |
| `name`                  | `name.en`                         | As LocaleMap                                       |
| `latitude`, `longitude` | `location`                        | As GeoPoint                                        |
| `description` + tags    | `description.en`                  | Combined with moves/area/warnings                  |
| `pictures[]`            | `media[]`                         | Added during image run (upload step)               |
| `tags_*`                | `external_references.horizn_tags` | Preserved for reference                            |
| —                       | `address`                         | Populated later via reverse geocode Cloud Function |

### 4. Tile Coordinates

Auto-calculates tile coordinates for zoom levels 2-16 for map clustering.

### 5. Spot Type Detection

Infers type from tags:

- `parkour_gym` → `parkour-gym`
- `parkour_park` → `parkour-park`
- Default: `urban-landscape`

## ⚙️ Configuration Options

Edit `CONFIG` in `import.ts`:

```typescript
{
  // Required
  serviceAccountKeyPath: string,  // Path to service account JSON
  storageBucket: string,          // Firebase Storage bucket

  // Data sources
  jsonFilePath: string,           // Horizn JSON file
  imagesFolderPath: string,       // Horizn images folder

  // Firebase destinations
  storageBucketFolder: string,    // 'spot_pictures' (matches your enum)
  collectionName: string,         // 'spots'

  // Import settings
  defaultLocale: string,          // 'en'
  importerUserId: string,         // Shows in media metadata
  batchSize: number,              // 3 (Horizn has many images per spot)

  // Optional
  maxSpots?: number,              // For testing (e.g., 3)
  dryRun?: boolean,               // Validate without writing
  uploadImages?: boolean,         // Overridden by CLI flags (default true)
  spotIdMapPath?: string,         // Where to write the mapping file
}
```

## 🎛️ Command Line Flags

```bash
# Test mode (overrides maxSpots)
node dist/import.js --test

# Dry run mode (overrides dryRun)
node dist/import.js --dry-run

# Skip image upload (spots-only)
node dist/import.js --spots-only

# Combine flags
node dist/import.js --test --dry-run --spots-only
```

## ⚠️ Important Notes

### Storage URLs vs Paths

**DO NOT** store just the storage path! Your `StorageMedia` class expects full URLs:

❌ Wrong: `spot_pictures/image123.jpg`  
✅ Correct: `https://firebasestorage.googleapis.com/v0/b/...?token=...`

The script uses `getSignedUrl()` to get the proper URL.

### Duplicate Prevention

The script automatically detects duplicates. If you run it twice:

- Existing spots are skipped (not duplicated)
- Only new spots are imported
- Summary shows how many were skipped

### Spot ID Mapping & Resume Support

- Every spots-only run writes `output/spot-id-map.json` with the assigned
  Firestore IDs and image filenames.
- The mapping lets you resume uploads or re-run the image step safely – entries
  that already have media won't be touched.

### Address Handling

- The importer intentionally leaves `address` empty.
- Your reverse geocode Cloud Function populates it after the spot is created.

### Rate Limiting

Processes spots in batches of 3 with 1-second delays to avoid Firebase rate limits.

### Cloud Function Processing

After uploading images:

1. Your `processVideoUpload` cloud function may trigger (if you upload videos in future)
2. For images, they're immediately usable
3. The storage service handles thumbnail generation automatically

## 🐛 Troubleshooting

### Error: "Invalid src format for StorageMedia"

- Means the URL format is wrong
- Check that `uploadImage()` is returning the full download URL
- Should include `firebasestorage.googleapis.com` and token

### Error: "Duplicate found"

- Good! The duplicate checker is working
- The spot already exists in your database
- Check the output to see which spots were skipped

### Error: "Service account key not found"

- Download from Firebase Console
- Save as `scripts/horizn-import/serviceAccountKey.json`
- Make sure path is correct in import.ts

### TypeScript compilation errors

```bash
cd scripts/horizn-import
npx tsc --noEmit  # Check for errors without compiling
```

### Missing images

Run the validator first:

```bash
npm run import:horizn:validate
```

It shows exactly which images are missing.

## 📊 Expected Results

For ~500-1000 Horizn spots:

- Import time: 2-4 hours
- Images uploaded: 2,000-5,000+
- Duplicates skipped: Varies based on existing data
- Success rate: Should be >95%

## 🔒 Security

**Never commit these files:**

- `serviceAccountKey.json` - Full Firebase admin access
- `data/` folder - Contains spot data and images

Already gitignored in `.gitignore`:

```
scripts/horizn-import/serviceAccountKey.json
scripts/horizn-import/data/
```

## 🎓 For Future Imports

This system is designed for Horizn data, but you can adapt it for other sources:

1. Create new types in `types.ts`
2. Create new transformer (like `spotTransformer.ts`)
3. Update `import.ts` to use new transformer
4. All other code stays the same!

The core engine (`importEngine.ts`, `storageUploader.ts`, `duplicateChecker.ts`) works with any data source.

## 📝 Example Output

```
🚀 Horizn Spot Import for PK Spot
============================================================
✓ Firebase Admin initialized
✓ Collection: spots
✓ Storage folder: spot_pictures
✓ Importer user ID: horizn-import-script
🧪 Testing mode: Only importing first 3 spots

📦 Loaded 3 spots from Horizn data

============================================================
Batch 1: Processing spots 1-3 of 3
============================================================

[1/3] Parkour Park Berlin
  ✓ Uploaded: berlin_park_01.jpg
  ✓ Uploaded: berlin_park_02.jpg
  ✓ Created spot ID: abc123xyz with 2 images

[2/3] Urban Spot London
  ↷ Skipped: Duplicate found (ID: existing456, 23m away)

[3/3] Rooftop Paris
  ✓ Uploaded: paris_roof_01.jpg
  ✓ Created spot ID: def789uvw with 1 images

============================================================
📊 IMPORT SUMMARY
============================================================
✓ Successfully imported: 2 spots
↷ Skipped (duplicates): 1 spots
✗ Failed: 0 spots
📸 Total images uploaded: 3

✨ Import complete!
```

## 🚦 Production Checklist

Before running on production:

- [ ] Tested with 3 spots (`npm run import:horizn:test`)
- [ ] Verified spots appear correctly in your app
- [ ] Checked that images display properly
- [ ] Ran validation (`npm run import:horizn:validate`)
- [ ] Configured correct Storage bucket
- [ ] Service account key has proper permissions
- [ ] Backed up your Firestore database (if possible)
- [ ] Ready to monitor the import process

## 📞 Support

If something goes wrong:

1. Check the detailed output - it shows exactly what failed
2. Run validation to check data quality
3. Test with 3 spots first, always
4. Check TypeScript compilation errors
5. Verify Storage URLs are full URLs (not paths)

---

**Last Updated**: October 2025  
**Version**: 2.0.0 (TypeScript rewrite)
