# PK Spot - GitHub Copilot Instructions

PK Spot is an Angular 20 application for Parkour and Freerunning that helps users discover spots, challenges, and share their experiences. The application uses Firebase for backend services and supports 7 languages with internationalization.

**ALWAYS reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Bootstrap and Build the Repository
**CRITICAL: NEVER CANCEL builds or long-running commands. Set timeouts of 120+ minutes for build commands.**

1. **Install dependencies:**
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```
   - Main project: ~22 seconds
   - Functions: ~18 seconds (Node.js 18 engine requirement, but works with Node.js 20)

2. **Create development environment files (first-time setup):**
   - Copy and configure `src/environments/environment.development.ts` (if missing)
   - Copy and configure `keys.development.ts` in root directory (if missing)
   - Add your Google Maps API key to these files for local development

3. **Build commands:**
   ```bash
   npm run build:dev     # Development build: ~30 seconds. NEVER CANCEL. Set timeout to 5+ minutes.
   npm run build:prod    # Production build: ~78 seconds. NEVER CANCEL. Set timeout to 10+ minutes.
   npm run build         # Standard build: Same as production
   ```

4. **Firebase Functions build:**
   ```bash
   cd functions && npm run build  # ~6 seconds
   ```

### Development Server
```bash
npm run dev  # Development server: ~33 seconds initial build. NEVER CANCEL. Set timeout to 5+ minutes.
```
- Runs on `http://localhost:4200/de` (German locale by default for dev)
- Watch mode enabled for file changes
- Requires Google Maps API key in development environment files

### SSR (Server-Side Rendering)
```bash
npm run build        # Build first (required)
npm run serve:ssr    # SSR server: instant start after build
```
- Runs on `http://localhost:8080`
- Loads all 7 language variants (en, de, de-CH, it, fr, es, nl)

### Internationalization (i18n)
```bash
npx ng extract-i18n  # Extract i18n messages: ~20 seconds. NEVER CANCEL. Set timeout to 5+ minutes.
```
- Updates all language files in `src/locale/`
- Supported languages: English (source), German, Swiss-German, Italian, French, Spanish, Dutch

### Tests and Linting
- **Tests:** Not configured (no test files exist, `npm run test` fails)
- **Linting:** Not configured (`npm run lint` fails - needs angular-eslint setup)

## Validation

### Manual Testing Requirements
**ALWAYS manually validate changes using these scenarios:**

1. **Basic Application Functionality:**
   - Start development server: `npm run dev`
   - Navigate to `http://localhost:4200/de`
   - Verify the application loads without console errors
   - Test spot discovery and map functionality (requires Google Maps API key)

2. **SSR Functionality:**
   - Build: `npm run build`
   - Start SSR: `npm run serve:ssr`
   - Navigate to `http://localhost:8080`
   - Verify server-side rendering works for different language routes

3. **Multi-language Support:**
   - Test routes: `/en`, `/de`, `/de-CH`, `/it`, `/fr`, `/es`, `/nl`
   - Verify language switching functionality
   - Check i18n extraction after adding new translatable text

### Build Validation
- **ALWAYS** run development build (`npm run build:dev`) before committing changes
- Test SSR functionality after any server-side changes
- Validate Firebase Functions build if modifying backend code

## Common Tasks

### Required Environment Setup
1. **Google Maps API Key** (mandatory for local development):
   - Generate key from: https://developers.google.com/maps/documentation/javascript/get-api-key
   - Add to `src/environments/environment.development.ts`
   - Add to `keys.development.ts` (if using that pattern)

2. **Firebase Configuration** (optional for local development):
   - Configure in `src/environments/environment.development.ts`
   - Used for authentication, database, and storage features

### Key Project Structure
```
├── src/
│   ├── app/                    # Angular application components
│   ├── environments/           # Environment configurations
│   ├── locale/                 # i18n translation files
│   └── assets/                 # Static assets
├── functions/                  # Firebase Cloud Functions
│   ├── src/                    # Function source code
│   └── package.json            # Functions dependencies
├── dist/pkspot/               # Build output
├── angular.json               # Angular configuration with i18n setup
├── firebase.json              # Firebase project configuration
└── package.json               # Main project dependencies
```

### Firebase Functions Development
```bash
cd functions
npm run build        # Build functions: ~6 seconds
npm run build:watch  # Watch mode for development
npm run serve        # Local emulator (requires Firebase CLI setup)
```

### Important Files
- `angular.json` - Contains build configurations and i18n setup
- `package.json` - Main project scripts and dependencies
- `functions/package.json` - Firebase Functions configuration
- `copy-proxy-server.js` - Post-build script for SSR setup
- `firebase.json` - Firebase configuration and deployment rules

## Known Issues and Limitations

1. **Build Warnings:** The build shows Angular warnings about optional chaining and Sass imports - these are non-breaking
2. **Browser Support:** Some older iOS Safari and Samsung browsers are unsupported (see build output)
3. **No Tests:** Test suite is not configured - tests will fail if attempted
4. **No Linting:** ESLint is not configured - linting will fail if attempted
5. **Node.js Version:** Functions specify Node.js 18 but work with Node.js 20

## Deployment Commands
```bash
# Firebase Rules
npm run deploy:rules:firestore
npm run deploy:rules:storage

# Firebase Functions
npm run deploy:functions         # Deploy to current project
npm run deploy:test:functions    # Deploy to test environment
npm run deploy:prod:functions    # Deploy to production
```

## Quick Commands Reference
```bash
# Daily development workflow
npm install                      # Install dependencies (~22s)
npm run build:dev               # Development build (~30s, timeout: 5min)
npm run dev                     # Start dev server (~33s, timeout: 5min)
npm run serve:ssr               # Start SSR server (after build)

# Build and deployment
npm run build:prod              # Production build (~78s, timeout: 10min)
cd functions && npm run build   # Build functions (~6s)
npx ng extract-i18n            # Update translations (~20s, timeout: 5min)
```

**Remember: NEVER CANCEL long-running builds. Angular builds can take several minutes. Always set appropriate timeouts and wait for completion.**