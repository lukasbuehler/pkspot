import { describe, expect, it, vi } from 'vitest';
import { mapDiagnosticsSnapshot, observeMapGestures } from './map-diagnostics';

describe('Map diagnostics', () => {
  it('captures canvas backing dimensions separately from CSS dimensions without creating a context', () => {
    const div = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 2400;
    div.append(canvas);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({width:600,height:1200,x:0,y:0} as DOMRect);
    const getContext = vi.spyOn(canvas, 'getContext');
    const map = {getDiv:()=>div,getZoom:()=>2,getHeading:()=>0,getTilt:()=>0,getCenter:()=>undefined,getBounds:()=>undefined,getMapTypeId:()=> 'roadmap'} as unknown as google.maps.Map;
    expect(mapDiagnosticsSnapshot(map).canvases).toEqual([{width:1200,height:2400,cssWidth:600,cssHeight:1200,x:0,y:0}]);
    expect(getContext).not.toHaveBeenCalled();
  });
  it('observes multi-touch boundaries without preventing them and detaches cleanly', () => {
    const div = document.createElement('div');
    const record = vi.fn();
    const stop = observeMapGestures(div, record);
    const event = new Event('touchstart', {cancelable:true});
    Object.defineProperties(event, {touches:{value:[{},{}]},changedTouches:{value:[{}]}});
    div.dispatchEvent(event);
    expect(record).toHaveBeenCalledWith('touchstart', expect.objectContaining({touches:2}));
    expect(event.defaultPrevented).toBe(false);
    stop();
    div.dispatchEvent(event);
    expect(record).toHaveBeenCalledTimes(1);
  });
});
