type BlobUrlApi = Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;

/**
 * Cloudflare Workers expose `URL.createObjectURL()` but throw when it is called.
 * Some browser libraries create a blob URL while their module loads (for
 * example ngx-image-cropper's EXIF orientation probe), which fails the SSR
 * navigation for every route that imports them. A server render never loads
 * these URLs, so an inert URL is enough.
 */
export function installBlobUrlStubs(target: BlobUrlApi = URL): boolean {
  try {
    target.revokeObjectURL(target.createObjectURL(new Blob()));
    return false;
  } catch {
    let nextId = 0;
    target.createObjectURL = () => `blob:ssr-unavailable/${++nextId}`;
    target.revokeObjectURL = () => undefined;
    return true;
  }
}

installBlobUrlStubs();
