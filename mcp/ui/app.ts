import { App } from '@modelcontextprotocol/ext-apps';
const app = new App({ name: 'PK Spot', version: '1.1.0' });
const frame = document.querySelector<HTMLIFrameElement>('#content')!;
const status = document.querySelector<HTMLElement>('#status')!;
const retry = document.querySelector<HTMLButtonElement>('#retry')!;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

// The host bridge selects records only. Angular owns all presentation and public reads.
app.ontoolresult = result => {
  frame.hidden = true;
  frame.removeAttribute('src');
  status.hidden = false;
  if (result.isError) { status.textContent = 'Could not load results. Ask PK Spot to try again.'; return; }
  const items = record(result.structuredContent).items;
  const refs = Array.isArray(items) ? items.slice(0, 10).flatMap(value => {
    const item = record(value);
    if (!['spot','event','community'].includes(String(item.kind))) return [];
    let id = typeof item.id === 'string' ? item.id : '';
    if (item.kind === 'community') {
      try {
        const url = new URL(String(item.url));
        if (url.origin !== 'https://pkspot.app' || !url.pathname.startsWith('/map/communities/')) return [];
        id = decodeURIComponent(url.pathname.split('/').at(-1)!);
      } catch { return []; }
    }
    return /^[\w:.-]{1,160}$/.test(id) ? [{kind:item.kind,id}] : [];
  }) : [];
  if (!refs.length) { status.textContent = 'No public results available. Ask for another search.'; return; }
  const url = new URL('https://pkspot.app/embedded/results');
  url.search = new URLSearchParams({refs:JSON.stringify(refs),showMap:'true'}).toString();
  frame.src = url.href;
  frame.hidden = false;
  status.hidden = true;
};
app.ontoolcancelled = () => { frame.hidden = true; frame.removeAttribute('src'); status.hidden = false; status.textContent = 'Search cancelled.'; };
async function connect() {
  retry.hidden = true;
  try { await app.connect(); }
  catch { status.hidden = false; status.textContent = 'Could not connect to the chat.'; retry.hidden = false; }
}
retry.onclick = () => void connect();
void connect();
