const byId = id => document.getElementById(id);
let fixtures = [], currentUrl, request;
const status = byId('status');
async function render() {
  request?.abort();
  request = new AbortController();
  const active = request;
  status.textContent = 'Rendering locally…';
  try {
    const values = Object.fromEntries(['title', 'subtitle', 'detail'].map(key => [key, byId(key).value]));
    const response = await fetch('/render', { method: 'POST', signal: active.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, rating: byId('rating').value === '' ? null : Number(byId('rating').value), fixture: byId('fixture').value, photoCount: Number(byId('photos').value) }) });
    if (!response.ok) throw new Error(await response.text());
    const blob = await response.blob();
    if (active !== request) return;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(blob);
    for (const id of ['preview', 'small']) { byId(id).src = currentUrl; byId(id).hidden = false; }
    byId('download').href = currentUrl; byId('download').hidden = false;
    byId('chat-title').textContent = values.title;
    byId('chat-description').textContent = values.subtitle;
    byId('size').textContent = `${Math.round(blob.size / 1024)} KB · PNG`;
    status.textContent = 'Ready. Nothing uploaded or stored.';
  } catch (error) {
    if (error.name !== 'AbortError') status.textContent = `Could not render: ${error.message}. Adjust the input and try again.`;
  }
}
function chooseFixture() {
  const fixture = fixtures.find(item => item.id === byId('fixture').value);
  for (const key of ['title', 'subtitle', 'detail']) byId(key).value = fixture[key] ?? '';
  byId('rating-field').hidden = fixture.kind !== 'spot';
  byId('rating').value = fixture.rating ?? '';
  byId('photos').replaceChildren(...Array.from({ length: fixture.photoCount + 1 }, (_, count) => new Option(String(count), String(count))));
  byId('photos').value = fixture.photoCount;
  void render();
}
byId('entity-form').addEventListener('submit', async event => {
  event.preventDefault();
  request?.abort();
  byId('load-entity').disabled = true;
  byId('render').disabled = true;
  byId('fixture').disabled = true;
  byId('photos').disabled = true;
  status.textContent = 'Loading public entity and photos…';
  try {
    const response = await fetch('/entity', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: byId('kind').value, id: byId('entity-id').value.trim() }) });
    if (!response.ok) throw new Error(await response.text());
    const source = await response.json();
    fixtures = fixtures.filter(item => !item.id.startsWith('live:'));
    fixtures.push(source);
    for (const option of [...byId('fixture').options]) if (option.value.startsWith('live:')) option.remove();
    byId('fixture').add(new Option(`${source.kind} · ${source.title}`, source.id));
    byId('fixture').value = source.id;
    chooseFixture();
  } catch (error) { status.textContent = `Could not load: ${error.message}`; }
  finally {
    for (const id of ['load-entity', 'render', 'fixture', 'photos']) byId(id).disabled = false;
  }
});
byId('render').addEventListener('click', render);
byId('fixture').addEventListener('change', chooseFixture);
byId('photos').addEventListener('change', render);
try {
  const response = await fetch('/fixtures');
  if (!response.ok) throw new Error('Examples unavailable');
  fixtures = await response.json();
  byId('fixture').replaceChildren(...fixtures.map(item => new Option(`${item.kind} · ${item.id}`, item.id)));
  chooseFixture();
} catch (error) { status.textContent = error.message; }
