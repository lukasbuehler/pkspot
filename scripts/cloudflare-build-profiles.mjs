const profiles = {
  staging: {
    workerName: "pkspot-web-staging",
    rendererName: "pkspot-ssr-staging",
    configuration: "cloudflare",
    outputDirectory: "dist/pkspot-cloudflare-worker",
    firebaseConfigPath: "src/environments/firebase.staging.json",
    publicUrls: true,
    noindex: true,
  },
  production: {
    workerName: "pkspot-web-production",
    rendererName: "pkspot-ssr-production",
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

/**
 * The front Worker keeps the public name, domain and assets. It serves
 * redirects, assets and cached HTML from a small bundle without Angular, so
 * cold starts are fast, and passes cache misses to the renderer Worker.
 */
export function createWranglerConfig(profile) {
  return {
    $schema: "../../node_modules/wrangler/config-schema.json",
    name: profile.workerName,
    main: "front/worker.mjs",
    no_bundle: true,
    rules: [{ type: "ESModule", globs: ["**/*.mjs"] }],
    compatibility_date: "2026-08-20",
    workers_dev: profile.publicUrls,
    preview_urls: profile.publicUrls,
    assets: { binding: "ASSETS", directory: "browser" },
    services: [{ binding: "SSR", service: profile.rendererName }],
    observability: { enabled: true },
    // Keys the Worker's SSR HTML cache, so a deploy never serves pages that
    // reference bundles from the previous version.
    version_metadata: { binding: "CF_VERSION_METADATA" },
    // Routes are intentionally absent. The staging domain remains managed in
    // Cloudflare; building/deploying production must not take over pkspot.app.
  };
}

/**
 * The renderer Worker runs Angular SSR. It has no public URL; only the front
 * Worker reaches it, through its `SSR` service binding.
 */
export function createRendererWranglerConfig(profile) {
  return {
    $schema: "../../node_modules/wrangler/config-schema.json",
    name: profile.rendererName,
    main: "server/worker.mjs",
    // Upload Angular's server output as separate modules instead of one
    // bundle, so a render loads only its own language. Angular already
    // minifies these modules.
    no_bundle: true,
    rules: [{ type: "ESModule", globs: ["**/*.mjs"] }],
    compatibility_date: "2026-08-20",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    // The same assets as the front Worker, so pages it renders can load their
    // bundles while the front Worker still runs another build. The Worker
    // decides, so only the front Worker's asset requests reach them.
    assets: { binding: "ASSETS", directory: "browser", run_worker_first: true },
    observability: { enabled: true },
  };
}

export function createAssetHeaders(baseHeaders, profile) {
  return profile.noindex
    ? `${baseHeaders.trimEnd()}\n\n/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n`
    : baseHeaders;
}
