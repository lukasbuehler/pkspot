const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Configuration map
const CONFIGS = {
  iosdev: "ios-dev",
  androiddev: "android-dev",
  android: "android",
  ios: "ios",
};

// Get configuration from arguments (default to 'mobile')
const args = process.argv.slice(2);
const targetConfig = args[0] || "ios-dev";

if (!CONFIGS[targetConfig]) {
  console.error(`Invalid configuration: ${targetConfig}`);
  console.error(`Available configurations: ${Object.keys(CONFIGS).join(", ")}`);
  process.exit(1);
}

const buildConfig = CONFIGS[targetConfig];

// 1. Run Angular Build
console.log(`Building Angular application for ${targetConfig}...`);
try {
  execSync(`ng build --configuration=${buildConfig}`, { stdio: "inherit" });
} catch (error) {
  console.error("Build failed:", error);
  process.exit(1);
}

// 2. Post-processing for Capacitor (Base HREF and index.html)
console.log("Post-processing build artifacts for Capacitor...");

const distPath = path.join(__dirname, "../dist/pkspot/browser");
const languages = ["en", "de", "de-CH", "it", "fr", "es", "nl"]; // List all your languages

languages.forEach((lang) => {
  const langPath = path.join(distPath, lang);
  const indexHtmlPath = path.join(langPath, "index.html");
  const indexCsrPath = path.join(langPath, "index.csr.html");

  // Check if index.html exists, if not, try to copy index.csr.html
  if (!fs.existsSync(indexHtmlPath)) {
    if (fs.existsSync(indexCsrPath)) {
      console.log(`[${lang}] Copying index.csr.html to index.html`);
      fs.copyFileSync(indexCsrPath, indexHtmlPath);
    } else {
      console.warn(`[${lang}] Warning: No index.html or index.csr.html found.`);
      return; // Skip this language
    }
  }

  // Patch base href
  let content = fs.readFileSync(indexHtmlPath, "utf8");
  if (
    content.includes('<base href="/">') ||
    content.includes('<base href="">')
  ) {
    console.log(`[${lang}] Patching base href in index.html`);
    // Replace both / and empty string with ./
    // Replace both / and empty string with ./
    content = content.replace(/<base href="\/">/g, '<base href="./">');
    content = content.replace(/<base href="">/g, '<base href="./">');

    // NOTE: Do NOT change asset paths to ../assets/ because Angular copies assets to EACH language folder.
    // So assets/fonts/fonts.css is correct relative to en/index.html when base href is ./

    fs.writeFileSync(indexHtmlPath, content);

    fs.writeFileSync(indexHtmlPath, content);
  }
});

// 3. Generate Root index.html for Language Redirection
console.log("Generating root index.html for language redirection...");
const rootIndexPath = path.join(distPath, "index.html");

const redirectionScript = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Swarms</title>
    <style>
        body {
            background-color: #000;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-family: sans-serif;
            padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
        }
        .loader {
            border: 4px solid #333;
            border-top: 4px solid #fff;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
    <script>
        function redirect() {
            var lang = navigator.language || navigator.userLanguage;
            var supportedLangs = ['en', 'de', 'it', 'fr', 'es', 'nl']; // de-CH is handled via de usually or explicit check
            
            // Simple mapping logic
            var targetLang = 'en';
            
            if (lang.startsWith('de')) {
                // Check specific regions if needed, else default to de
                if (lang === 'de-CH') targetLang = 'de-CH';
                else targetLang = 'de';
            } else {
                var shortLang = lang.split('-')[0];
                if (supportedLangs.includes(shortLang)) {
                    targetLang = shortLang;
                }
            }

            // Redirect to the language directory
            // Use replace to not keep this intermediate page in history (optional)
            window.location.replace('./' + targetLang + '/index.html');
        }
        
        // Wait for device ready if needed, or run immediately
        window.onload = redirect;
    </script>
</head>
<body>
    <div class="loader"></div>
    <!-- Fallback manual selection if JS fails or redirect is slow -->
    <noscript>
        <p>Select Language:</p>
        <ul>
            <li><a href="./en/index.html">English</a></li>
            <li><a href="./de/index.html">Deutsch</a></li>
            <!-- Add others -->
        </ul>
    </noscript>
</body>
</html>
`;

fs.writeFileSync(rootIndexPath, redirectionScript);
console.log(`Successfully created ${rootIndexPath}`);
console.log("Mobile build setup complete.");
