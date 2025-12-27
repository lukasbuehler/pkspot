const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Configuration
const distPath = path.join(__dirname, "../dist/pkspot/browser");
const supportedLocales = ["en", "de", "de-CH", "it", "fr", "es", "nl"];
const defaultLocale = "en";

// 1. Run Angular Build
console.log("Building Angular application for production...");
try {
  execSync("ng build --configuration=production", { stdio: "inherit" });
} catch (error) {
  console.error("Build failed:", error);
  process.exit(1);
}

// 2. Post-process: Copy index.csr.html to index.html (if needed) and patch base href
console.log("Post-processing build artifacts for Capacitor...");

supportedLocales.forEach((locale) => {
  const localeDir = path.join(distPath, locale);
  const indexCsrPath = path.join(localeDir, "index.csr.html");
  const indexPath = path.join(localeDir, "index.html");

  if (fs.existsSync(indexCsrPath) && !fs.existsSync(indexPath)) {
    console.log(`[${locale}] Copying index.csr.html to index.html`);
    fs.copyFileSync(indexCsrPath, indexPath);
  }

  if (fs.existsSync(indexPath)) {
    console.log(`[${locale}] Patching base href in index.html`);
    let content = fs.readFileSync(indexPath, "utf8");

    // Replace existing base href or add one if missing
    if (content.includes('<base href="')) {
      content = content.replace(/<base href="[^"]*"/, '<base href="./"');
    } else {
      content = content.replace("<head>", '<head><base href="./">');
    }

    fs.writeFileSync(indexPath, content);
  } else {
    console.warn(`[${locale}] Warning: index.html not found!`);
  }
});

// 3. Generate Root index.html
console.log("Generating root index.html for language redirection...");

const indexHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PKSpot</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background-color: #121212;
      color: #ffffff;
    }
    .loader {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin-bottom: 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .lang-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 20px;
    }
    .lang-btn {
      padding: 10px 20px;
      background-color: #333;
      color: white;
      text-decoration: none;
      border-radius: 5px;
      text-align: center;
    }
  </style>
  <script>
    // Supported locales from configuration
    const supportedLocales = ${JSON.stringify(supportedLocales)};
    const defaultLocale = '${defaultLocale}';

    function getBestLocale() {
      try {
        const lang = navigator.language || navigator.userLanguage; 
        if (!lang) return defaultLocale;

        // Check for exact match first (e.g. 'de-CH')
        if (supportedLocales.includes(lang)) {
          return lang;
        }

        // Check for base language match (e.g. 'de' from 'de-AT')
        const baseLang = lang.split('-')[0];
        if (supportedLocales.includes(baseLang)) {
          return baseLang;
        }

        return defaultLocale;
      } catch (e) {
        return defaultLocale;
      }
    }

    function redirect() {
      const locale = getBestLocale();
      // Replace location so back button doesn't take user back here effectively
      window.location.replace('./' + locale + '/index.html');
    }

    // Attempt redirect immediately
    redirect();
  </script>
</head>
<body>
  <div class="loader"></div>
  <p>Redirecting to your language...</p>
  
  <div class="lang-list">
    <!-- Manual fallback links -->
    ${supportedLocales
      .map(
        (lang) =>
          `<a href="./${lang}/index.html" class="lang-btn">${lang.toUpperCase()}</a>`
      )
      .join("")}
  </div>
</body>
</html>`;

try {
  fs.writeFileSync(path.join(distPath, "index.html"), indexHtmlContent);
  console.log(`Successfully created ${path.join(distPath, "index.html")}`);
} catch (error) {
  console.error("Failed to write index.html:", error);
  process.exit(1);
}

console.log("Mobile build setup complete.");
