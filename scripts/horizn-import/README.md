# Horizn Spot Import

TypeScript-based import system for migrating parkour spots from the Horizn app into PK Spot.

## Features

- ✅ **Type-safe**: Uses your actual TypeScript schemas (`SpotSchema`)
- ✅ **Duplicate detection**: Checks location-based duplicates (50m threshold) before importing
- ✅ **Interactive resolution**: Manually decide skip/import for each duplicate found
- ✅ **Resume capability**: Saves resolution decisions to continue after interruption
- ✅ **Test mode**: Test with 3 spots first to verify everything works
- ✅ **Dry run**: Validate without writing any data
- ✅ **Spots only**: Media upload disabled due to copyright constraints

## Prerequisites

1. **Firebase service account key**

   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save as `scripts/horizn-import/serviceAccountKey.json`

2. **Horizn data**

   - `data/horizn-spots-output.json` - Spot data export

3. **Firebase configuration**
   - Update `config.ts` with your `storageBucket` value
   - Format: `your-project-id.appspot.com`

## Quick Start

### 1. Validate Data (Optional)

```bash
npm run validate
```

Checks for missing required fields, invalid coordinates, etc.

### 2. Test Import (Recommended)

```bash
npm run import:test
```

Imports only 3 spots to verify schema compliance and duplicate detection.

### 3. Production Import

```bash
npm run import
```

**Two-Phase Process:**

**Phase 1: Duplicate Detection**

- Checks all 1,009 spots against existing database
- Prompts for each duplicate: `[s]kip` or `[i]mport`
- Saves decisions to `output/duplicate-resolutions.json`

**Phase 2: Automatic Import**

- Imports all non-skipped spots in batches of 3
- Shows progress with spot names and IDs
- Creates `output/spot-id-map.json` with results

### 4. Resume After Interruption

If you abort mid-import (Ctrl+C), just run again:

```bash
npm run import
```

The script will:

- Load previous resolution decisions
- Ask if you want to use them (say `yes`)
- Continue importing remaining spots

**To start fresh:** Delete `output/duplicate-resolutions.json`

The **interactive import** mode provides the best workflow for production databases:

### Test First (DRY RUN - ALWAYS DO THIS FIRST!)

```bash
npm run import:interactive:dry
```

This tests with 3 spots in dry-run mode - **no data is written to the database**.

### Production Import

```bash
npm run import:interactive
```

This command:

1. **Phase 1: Duplicate Detection** - Checks all spots for duplicates and lets you resolve each one interactively
2. **Phase 2: Automatic Import** - Imports all non-duplicate spots in one go

For testing with 3 spots (actual import):

```bash
npm run import:interactive:test
```

## Available Commands

```bash
npm run validate      # Validate Horizn data quality
npm run import        # Production import (interactive, with duplicate resolution)
npm run import:test   # Test with 3 spots
npm run import:dry    # Dry run (no database writes)
```

## Project Structure

```
scripts/horizn-import/
├── interactive-import.ts  # Main: Interactive import with duplicate resolution
├── importEngine.ts        # Core import orchestration
├── spotService.ts         # Type-safe Firestore adapter
├── spotTransformer.ts     # Horizn → SpotSchema converter
├── duplicateChecker.ts    # Location-based duplicate detection (50m)
├── validate.ts            # Data quality validator
├── config.ts              # Configuration factory
├── types.ts               # TypeScript definitions
├── tsconfig.json          # TypeScript compiler config
├── package.json           # NPM scripts
├── serviceAccountKey.json # Firebase credentials (gitignored, you provide)
├── data/                  # Horizn source data (gitignored)
│   └── horizn-spots-output.json
└── output/                # Generated during import (gitignored)
    ├── spot-id-map.json           # Import results
    └── duplicate-resolutions.json # Your skip/import decisions
```

## How It Works

### 1. Type-Safe Service Layer

Uses `SpotServiceAdapter` - a Node.js wrapper around Firebase Admin that:

- Enforces the same `SpotSchema` as your Angular app
- Provides type-safe methods: `addSpot()`, `getSpotById()`, `getSpotsInBounds()`
- Catches type errors at compile time

### 2. Duplicate Detection

Checks for existing spots within 50 meters using:

- Geographic bounding box queries (`getSpotsInBounds()`)
- Haversine distance calculation
- Interactive prompt to skip or import each duplicate

### 3. Schema Transformation

Converts Horizn format to your `SpotSchema`:

| Horizn Field            | PK Spot Field                     | Notes                                |
| ----------------------- | --------------------------------- | ------------------------------------ |
| `name`                  | `name.en`                         | LocaleMap format                     |
| `latitude`, `longitude` | `location`                        | GeoPoint                             |
| `description` + tags    | `description.en`                  | Combined with moves/area/warnings    |
| `tags_*`                | `external_references.horizn_tags` | Preserved for reference              |
| `pictures[]`            | _(skipped)_                       | Copyright issue - no media imported  |
| —                       | `media`                           | Empty array `[]`                     |
| —                       | `source`                          | Set to `"horizn-app"`                |
| —                       | `tile_coordinates`                | Auto-calculated for zoom levels 2-16 |

### 4. Spot Type Detection

Infers type from tags:

- `parkour_gym` → `parkour-gym`
- `parkour_park` → `parkour-park`
- Default: `urban-landscape`

## Configuration

Edit `config.ts` (`createBaseConfig()`):

```typescript
{
  serviceAccountKeyPath: string,  // Firebase service account key
  storageBucket: string,          // e.g., "parkour-base-project.appspot.com"
  jsonFilePath: string,           // Horizn JSON data file
  collectionName: string,         // "spots"
  defaultLocale: string,          // "en" (all imports use English)
  importerUserId: string,         // "horizn-import-script"
  batchSize: number,              // 3 (concurrent imports)
  spotIdMapPath: string,          // Output file path

  // Optional (set via CLI flags)
  maxSpots?: number,              // For testing (e.g., 3)
  dryRun?: boolean,               // Validate without writing
}
```

### CLI Flags

```bash
--test      # Import only 3 spots
--dry-run   # Validate without database writes
```

## Important Notes

### Media Import Disabled

**Copyright issue**: All Horizn images are skipped. Every spot imports with `media: []`.

### Duplicate Prevention

- Interactive mode prompts for each duplicate found
- Resolution decisions saved to `output/duplicate-resolutions.json`
- Can resume after interruption by reusing previous resolutions

### Rate Limiting

Processes 3 spots concurrently with 1-second delays between batches

## Troubleshooting

### "Service account key not found"

- Download from Firebase Console → Project Settings → Service Accounts
- Save as `scripts/horizn-import/serviceAccountKey.json`

### TypeScript errors

```bash
npm run build  # Check compilation
```

### Missing data

```bash
npm run validate  # Check data quality
```

## Expected Results

For 1,009 Horizn spots:

- Import time: ~45-60 minutes (3 spots/batch with delays)
- Duplicates: ~10-20 spots (varies by existing data)
- Success rate: >99%
- Media imported: 0 (copyright issue)

## Security

**Never commit:**

- `serviceAccountKey.json` - Full Firebase admin access
- `data/` folder - Source data

(Already in `.gitignored`)

## Example Output

```
🚀 Horizn Spot Import - Interactive Mode
==================================================
📋 Found previous duplicate resolutions
Use previous resolutions? (y/n): y
✓ Using previous resolutions

==================================================
📦 PHASE 2: IMPORTING SPOTS
==================================================
Total spots: 1009
To import: 962
To skip: 47

Proceed with importing 962 spots? (y/n): y

============================================================
Batch 1: Processing spots 31-33 of 962
============================================================

[31/962] Parkour Park Berlin
  ✓ Created spot ID: abc123xyz

[32/962] Urban Spot London
  ✓ Created spot ID: def456uvw

[33/962] Rooftop Paris
  ✓ Created spot ID: ghi789rst

============================================================
📊 IMPORT SUMMARY
============================================================
✓ Successfully imported: 962 spots
↷ Skipped (duplicates): 47 spots

✨ Import complete!
```

---

**Last Updated**: November 2025  
**Version**: 2.0 (Interactive mode, media disabled)
