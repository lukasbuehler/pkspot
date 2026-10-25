// These functions are embedded in the native entry HTML before Angular loads.
function redirectMobileEntry() {
  const locales = ['en', 'de', 'it', 'fr', 'es', 'nl'];
  const url = new URL(window.location.href);
  const segments = url.pathname.split('/');
  const routeLocale = locales.includes(segments[1]) ? segments.splice(1, 1)[0] : null;
  let saved;
  try { saved = localStorage.getItem('language'); } catch { /* Storage may be unavailable. */ }
  const preferred = (saved || navigator.language || 'en').toLowerCase().split('-')[0];
  const locale = routeLocale || (locales.includes(preferred) ? preferred : 'en');
  let route = segments.join('/');
  if (route === '/index.html' || !route) route = '/';
  const destination = new URL('/' + locale + '/index.html', url);
  if (route !== '/' || url.search || url.hash) {
    destination.searchParams.set('__pkspot_route', route + url.search + url.hash);
  }
  // Absolute paths are essential: Capacitor serves this entry for nested SPA routes.
  window.location.replace(destination.href);
}

function restoreMobileRoute(locale) {
  const url = new URL(window.location.href);
  const route = url.searchParams.get('__pkspot_route');
  if (!route || !route.startsWith('/') || route.startsWith('//')) return;
  // Restore the route before Angular starts without requesting another local file.
  const destination = new URL('/' + locale + route, url);
  if (destination.protocol !== url.protocol || destination.host !== url.host ||
      !destination.pathname.startsWith('/' + locale + '/')) return;
  window.history.replaceState(null, '', destination.href);
}

module.exports = { redirectMobileEntry, restoreMobileRoute };
