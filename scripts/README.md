# Scripts Directory

This directory contains data import scripts for PK Spot.

## 📁 Structure

```
scripts/
├── README.md                    # This file
├── spots-data.example.json      # Generic spot data example
└── horizn-import/              # Horizn app import system
    ├── README.md               # Complete documentation
    ├── import.ts               # Main import script
    ├── validate.ts             # Data validator
    ├── types.ts                # Type definitions
    ├── importEngine.ts         # Core logic
    ├── spotTransformer.ts      # Data transformer
    ├── storageUploader.ts      # Storage handler
    ├── duplicateChecker.ts     # Duplicate detection
    ├── package.json            # Dependencies
    ├── tsconfig.json           # TypeScript config
    └── data/                   # Your data (gitignored)
        ├── horizn-spots-output.json
        └── spots_pics/
```

## 🎯 Quick Start

### Horizn Import

For importing Horizn parkour spot data:

```bash
# 1. Configure
# Edit scripts/horizn-import/import.ts and set your Firebase Storage bucket

# 2. Validate data
npm run import:horizn:validate

# 3. Test with 3 spots
npm run import:horizn:test

# 4. Import all spots
npm run import:horizn
```

**📖 Full documentation:** See [horizn-import/README.md](./horizn-import/README.md)

## 📋 Available Commands

From project root:

```bash
# Horizn Import
npm run import:horizn:validate   # Check data quality
npm run import:horizn:test        # Import 3 spots (test mode)
npm run import:horizn:dry         # Validate without writing
npm run import:horizn             # Full import
```

## 🔐 Security

**Never commit:**

- Service account keys (`serviceAccountKey.json`)
- Data folders (`data/`)
- Compiled output (`dist/`)

These are already in `.gitignore`.

## 🛠️ Adding New Import Sources

The Horizn import system is modular. To add a new data source:

1. Copy `horizn-import/` folder structure
2. Update `types.ts` with your data format
3. Create new transformer (like `spotTransformer.ts`)
4. Reuse `importEngine.ts`, `storageUploader.ts`, `duplicateChecker.ts`
5. Add npm scripts to root `package.json`

Core components (`importEngine`, `storageUploader`, `duplicateChecker`) work with any source!

## 📝 Notes

- All import scripts are TypeScript for type safety
- They use your actual schemas from `src/db/schemas/`
- Compiled output goes to `dist/` folder
- Duplicate detection prevents reimporting existing spots
- Images get proper Storage URLs (not just paths)

---

**For detailed Horizn import documentation, see:** [horizn-import/README.md](./horizn-import/README.md)
