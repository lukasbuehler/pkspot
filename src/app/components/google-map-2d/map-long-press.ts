/** Observe a hold without capturing pointers or interfering with normal map gestures. */
export function observeMapLongPress(
  element: HTMLElement,
  enabled: () => boolean,
  select: (x: number, y: number) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { id: number; x: number; y: number } | undefined;
  let suppressUntil = 0;
  let activated = false;
  const pointers = new Set<number>();
  const cancel = () => { clearTimeout(timer); start = undefined; };
  const interactive = (target: EventTarget | null) => target instanceof Element &&
    !!target.closest('button, a, input, [role="button"], [data-location-actions]');
  const down = (event: PointerEvent) => {
    pointers.add(event.pointerId);
    cancel();
    if (!enabled() || pointers.size !== 1 || event.button !== 0 || interactive(event.target)) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      if (!start || !enabled()) return;
      activated = true;
      suppressUntil = Date.now() + 1000;
      select(start.x, start.y);
      start = undefined;
    }, 550);
  };
  const move = (event: PointerEvent) => {
    if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancel();
  };
  const up = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    cancel();
    if (activated) suppressUntil = Date.now() + 1000;
    activated = false;
  };
  const blur = () => { cancel(); pointers.clear(); activated = false; };
  const click = (event: MouseEvent) => {
    if (Date.now() < suppressUntil && !interactive(event.target)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  };
  const context = (event: MouseEvent) => {
    if (!enabled() || interactive(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    cancel();
    if (Date.now() >= suppressUntil) select(event.clientX, event.clientY);
    suppressUntil = Date.now() + 1000;
  };
  window.addEventListener('blur', blur);
  element.addEventListener('pointerdown', down, true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  element.addEventListener('click', click, true);
  element.addEventListener('contextmenu', context, true);
  return () => {
    cancel();
    window.removeEventListener('blur', blur);
    element.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    element.removeEventListener('click', click, true);
    element.removeEventListener('contextmenu', context, true);
  };
}
