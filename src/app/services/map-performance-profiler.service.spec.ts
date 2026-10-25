import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapPerformanceProfilerService } from './map-performance-profiler.service';

const KEY = 'pkspotMapProfileBreadcrumbs';
describe('Map performance capture', () => {
  let service: MapPerformanceProfilerService;
  afterEach(() => {
    service?.disable();
    localStorage.clear();
    vi.restoreAllMocks();
  });
  function create() {
    service = new MapPerformanceProfilerService('browser');
    vi.spyOn(service as unknown as { _getBrowserSnapshot: () => object }, '_getBrowserSnapshot').mockReturnValue({});
    return service;
  }
  it('records only with explicit opt-in and preserves the previous capture', () => {
    localStorage.setItem(KEY, JSON.stringify([{label:'map-health:sample',payload:{camera:{zoom:2}},timestampMs:42,wallTimeMs:100}]));
    create();
    expect(service.enabled()).toBe(false);
    expect(service.record('disabled')).toBeNull();
    expect(JSON.parse(service.exportCapture()).previous[0].payload.camera.zoom).toBe(2);
    service.enable();
    for (let i=0;i<30;i++) service.record('sample', {i});
    const capture = JSON.parse(service.exportCapture());
    expect(capture.current).toHaveLength(31);
    expect(capture.previous).toHaveLength(1);
    service.disable();
    expect(service.record('disabled-again')).toBeNull();
    service.clearBreadcrumbs();
    expect(JSON.parse(service.exportCapture())).toEqual({previous:[],current:[]});
  });
  it('bounds the persisted capture and retains its newest events', () => {
    create().enable();
    for (let i=0;i<150;i++) service.record('sample', {i});
    const events = JSON.parse(service.exportCapture()).current;
    expect(events).toHaveLength(100);
    expect(events.at(-1).payload.i).toBe(149);
  });
});
