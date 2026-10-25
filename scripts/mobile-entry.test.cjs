const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { redirectMobileEntry, restoreMobileRoute } = require('./mobile-entry.cjs');

for (const [path, saved, locale, expected] of [
  ['/de/events/jam?source=share#details', 'en', 'de', '/de/events/jam?source=share#details'],
  ['/map/spots/example', 'de-CH', 'de', '/de/map/spots/example'],
  ['/events/jam', null, 'fr', '/fr/events/jam'],
  ['/en/account?returnUrl=%2Fmap', 'de', 'en', '/en/account?returnUrl=%2Fmap'],
]) {
  test(`restores nested native link ${path}`, () => {
    let redirected;
    let restored;
    const context = {
      URL,
      navigator: { language: 'fr-CH' },
      localStorage: { getItem: () => saved },
      window: { location: { href: 'capacitor://pkspot.app' + path, replace: value => redirected = value },
        history: { replaceState: (_, __, value) => restored = value } },
    };
    vm.runInNewContext(`(${redirectMobileEntry.toString()})()`, context);
    assert.equal(new URL(redirected).pathname, `/${locale}/index.html`);
    context.window.location.href = redirected;
    vm.runInNewContext(`(${restoreMobileRoute.toString()})('${locale}')`, context);
    assert.equal(restored, 'capacitor://pkspot.app' + expected);
  });
}
test('plain launch works when storage is unavailable', () => {
  let redirected;
  vm.runInNewContext(`(${redirectMobileEntry.toString()})()`, {
    URL, navigator: { language: 'xx' }, localStorage: { getItem() { throw Error('unavailable'); } },
    window: { location: { href: 'capacitor://pkspot.app/', replace: value => redirected = value } },
  });
  assert.equal(redirected, 'capacitor://pkspot.app/en/index.html');
});
