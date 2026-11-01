const profiles = {
  staging: {
    workerName: "pkspot-web",
    configuration: "cloudflare",
    outputDirectory: "dist/pkspot-cloudflare-worker",
    firebaseConfigPath: "src/environments/firebase.staging.json",
    publicUrls: true,
    noindex: true,
  },
  production: {
    workerName: "pkspot-web-production",
    configuration: "cloudflare,cloudflare-production",
    outputDirectory: "dist/pkspot-cloudflare-production-worker",
    firebaseConfigPath: "src/environments/firebase.production.json",
    // Domain attachment is a separately approved cutover. Keep this Worker
    // private until then, including its production analytics configuration.
    publicUrls: false,
    noindex: false,
  },
};

export function getCloudflareBuildProfile(target = "staging") {
  if (!Object.hasOwn(profiles, target)) {
    throw new Error(`Unknown Cloudflare target: ${target}. Use staging or production.`);
  }
  return { ...profiles[target] };
}

export function createWranglerConfig(profile) {
  return {
    $schema: "../../node_modules/wrangler/config-schema.json",
    name: profile.workerName,
    main: "worker.mjs",
    minify: true,
    compatibility_date: "2026-08-20",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: profile.publicUrls,
    preview_urls: profile.publicUrls,
    assets: { binding: "ASSETS", directory: "browser" },
    observability: { enabled: true },
    // Routes are intentionally absent. The staging domain remains managed in
    // Cloudflare; building/deploying production must not take over pkspot.app.
  };
}

export function createAssetHeaders(baseHeaders, profile) {
  return profile.noindex
    ? `${baseHeaders.trimEnd()}\n\n/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n`
    : baseHeaders;
}
