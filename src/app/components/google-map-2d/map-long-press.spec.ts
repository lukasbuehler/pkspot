import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeMapLongPress } from './map-long-press';

describe('map long press', () => {
  let map: HTMLDivElement;
  let detach: () => void;
  const select = vi.fn();
  const pointer = (type: string, x = 20, id = 1, target: EventTarget = map) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: id, clientX: x, clientY: 30, button: 0 });
    target.dispatchEvent(event);
  };
  beforeEach(() => {
    vi.useFakeTimers(); select.mockClear();
    map = document.createElement('div'); document.body.append(map);
    detach = observeMapLongPress(map, () => true, select);
  });
  afterEach(() => { detach(); map.remove(); vi.useRealTimers(); });
  it('selects after a hold and suppresses its trailing click', () => {
    pointer('pointerdown'); vi.advanceTimersByTime(550);
    expect(select).toHaveBeenCalledWith(20, 30);
    vi.advanceTimersByTime(2000);
    pointer('pointerup');
    expect(map.dispatchEvent(new MouseEvent('click', { cancelable: true }))).toBe(false);
  });
  it('does not select during a drag or pinch', () => {
    pointer('pointerdown'); pointer('pointermove', 40);
    vi.advanceTimersByTime(600); expect(select).not.toHaveBeenCalled();
    pointer('pointerup'); pointer('pointerdown'); pointer('pointerdown', 20, 2);
    vi.advanceTimersByTime(600); expect(select).not.toHaveBeenCalled();
  });
  it('does not select on a quick tap or control', () => {
    pointer('pointerdown'); pointer('pointerup'); vi.advanceTimersByTime(600);
    const button = document.createElement('button'); map.append(button);
    pointer('pointerdown', 20, 1, button); vi.advanceTimersByTime(600);
    expect(select).not.toHaveBeenCalled();
  });
  it('supports desktop context menu and cleans up a pending hold', () => {
    map.dispatchEvent(new MouseEvent('contextmenu', { clientX: 42, clientY: 50 }));
    expect(select).toHaveBeenCalledWith(42, 50);
    select.mockClear(); pointer('pointerdown'); detach();
    vi.advanceTimersByTime(600); expect(select).not.toHaveBeenCalled();
  });
  it('checks whether the gesture is enabled', () => {
    detach(); detach = observeMapLongPress(map, () => false, select);
    pointer('pointerdown'); vi.advanceTimersByTime(600);
    map.dispatchEvent(new MouseEvent('contextmenu'));
    expect(select).not.toHaveBeenCalled();
  });
});
