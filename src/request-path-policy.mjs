/** These server/configuration paths are never public app routes or assets. */
export function isSensitiveProbePath(pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname).toLowerCase();
  } catch {
    return true;
  }
  return /(?:^|\/)\.(?:env(?:[./]|$)|git(?:\/|$)|svn(?:\/|$)|hg(?:\/|$)|aws(?:\/|$)|ssh(?:\/|$)|npmrc$|yarnrc(?:\.|$))/u.test(path)
    || /\.(?:php\d?|phtml|asp|aspx|cgi)(?:\/|$)/u.test(path)
    || /^\/(?:[a-z]{2}\/)?(?:dockerfile|composer\.(?:json|lock)|package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|credentials|env(?:\.txt)?|env-config\.js|runtime-config\.js|_profiler(?:\/.*)?|wp-(?:admin|includes|content)(?:\/.*)?)\/?$/u.test(path);
}
