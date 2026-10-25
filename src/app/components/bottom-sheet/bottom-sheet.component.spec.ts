import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomSheetComponent } from "./bottom-sheet.component";

describe("BottomSheetComponent touch gestures", () => {
  let fixture: ComponentFixture<BottomSheetComponent>;
  let sheet: HTMLElement;
  let content: HTMLElement;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  function frame(time: number): void {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(time));
  }

  function touch(
    type: string,
    y: number,
    options: { target?: HTMLElement; x?: number; cancelable?: boolean } = {},
  ): TouchEvent {
    const target = options.target ?? content;
    const point = {
      identifier: 1, target, clientX: options.x ?? 100,
      clientY: y, pageX: options.x ?? 100, pageY: y,
    };
    const event = new Event(type, {
      bubbles: true, cancelable: options.cancelable ?? true,
    }) as TouchEvent;
    Object.defineProperties(event, {
      touches: { value: type === "touchend" ? [] : [point] },
      changedTouches: { value: [point] },
    });
    target.dispatchEvent(event);
    return event;
  }

  function openSheet(): void {
    fixture.componentInstance.maximize();
    frame(1);
    frame(501);
    expect(sheet.style.transform).toBe("translateY(0px)");
  }

  beforeEach(async () => {
    frames = new Map();
    nextFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1200);
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(BottomSheetComponent);
    await fixture.whenStable();
    sheet = fixture.nativeElement.querySelector(".sheet");
    content = fixture.nativeElement.querySelector(".content");
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("reserves vertical pans for the sheet until it is fully open", () => {
    // Closed: a fast flick must reach the sheet, horizontal rows still scroll.
    expect(sheet.style.touchAction).toBe("pan-x");
    openSheet();
    // Fully open: the content scrolls natively again.
    expect(sheet.style.touchAction).toBe("");
  });

  it("lets the content scroll as soon as an opening sheet nearly reaches the top", () => {
    fixture.componentInstance.maximize();
    frame(1);
    // Opening already allows native vertical panning for the next touch.
    expect(sheet.style.touchAction).toBe("");
    frame(301);
    const offset = Number(sheet.style.transform.match(/[\d.]+/)![0]);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(48);

    touch("touchstart", 300);
    expect(sheet.style.transform).toBe("translateY(0px)");
    expect(content.style.overflowY).toBe("scroll");
    // An upward swipe scrolls the content natively.
    expect(touch("touchmove", 297).defaultPrevented).toBe(false);
    touch("touchmove", 240);
    expect(sheet.style.transform).toBe("translateY(0px)");
    // The finished animation does not move the sheet afterwards.
    frame(501);
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("keeps dragging a sheet that is still far from the top", () => {
    fixture.componentInstance.maximize();
    frame(1);
    frame(51);
    const offset = Number(sheet.style.transform.match(/[\d.]+/)![0]);
    expect(offset).toBeGreaterThan(48);
    touch("touchstart", 400);
    expect(sheet.style.transform).toBe(`translateY(${offset}px)`);
    expect(touch("touchmove", 397).defaultPrevented).toBe(true);
  });

  it("reserves the first small move before Android commits native scrolling", () => {
    touch("touchstart", 550);
    expect(touch("touchmove", 547).defaultPrevented).toBe(true);
    expect(sheet.style.transform).toBe("translateY(510px)");
    touch("touchmove", 510);
    expect(sheet.style.transform).toBe("translateY(470px)");
  });

  it("leaves upward swipes native when open content can scroll down", () => {
    openSheet();
    touch("touchstart", 300);
    expect(touch("touchmove", 297).defaultPrevented).toBe(false);
    touch("touchmove", 240);
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("leaves downward swipes native when content is scrolled", () => {
    openSheet();
    content.scrollTop = 100;
    touch("touchstart", 300);
    expect(touch("touchmove", 303).defaultPrevented).toBe(false);
    touch("touchmove", 360);
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("reserves downward swipes at the top of open content", () => {
    openSheet();
    touch("touchstart", 300);
    expect(touch("touchmove", 303).defaultPrevented).toBe(true);
    touch("touchmove", 340);
    expect(sheet.style.transform).toBe("translateY(40px)");
  });

  it("scrolls the content itself when a reserved jitter turns into a scroll", () => {
    // A resting finger jitters downward first; reserving that move cancels
    // native scrolling, so the upward swipe that follows must not freeze.
    openSheet();
    touch("touchstart", 300);
    expect(touch("touchmove", 302).defaultPrevented).toBe(true);
    expect(touch("touchmove", 280).defaultPrevented).toBe(true);
    expect(content.scrollTop).toBe(22);
    touch("touchmove", 240);
    expect(content.scrollTop).toBe(62);
    expect(sheet.style.transform).toBe("translateY(0px)");

    // Releasing continues with a short momentum glide.
    touch("touchend", 240);
    frame(1000);
    frame(1016);
    expect(content.scrollTop).toBeGreaterThan(62);
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("stops a momentum glide when a new touch starts", () => {
    openSheet();
    touch("touchstart", 300);
    touch("touchmove", 302);
    touch("touchmove", 240);
    touch("touchend", 240);
    touch("touchstart", 300);
    const scrolled = content.scrollTop;
    frame(1000);
    frame(1016);
    expect(content.scrollTop).toBe(scrolled);
  });

  it.each([-12, 0.4, 1])("accepts a fresh pull at a WebKit top offset of %s", async (offset) => {
    openSheet();
    content.scrollTop = offset;
    content.dispatchEvent(new Event("scroll"));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector(".handle-region").classList.contains("content-at-top")).toBe(true);
    touch("touchstart", 300);
    expect(touch("touchmove", 303).defaultPrevented).toBe(true);
    touch("touchmove", 340);
    expect(sheet.style.transform).toBe("translateY(40px)");
  });

  it("hands a cancellable scroll to dragging without counting earlier movement", () => {
    openSheet();
    content.scrollTop = 100;
    touch("touchstart", 200);
    expect(touch("touchmove", 250).defaultPrevented).toBe(false);
    content.scrollTop = 0;
    expect(touch("touchmove", 300).defaultPrevented).toBe(true);
    expect(sheet.style.transform).toBe("translateY(0px)");
    touch("touchmove", 320);
    expect(sheet.style.transform).toBe("translateY(20px)");
  });

  it("does not use the preceding scroll velocity to dismiss a small pull", () => {
    openSheet();
    vi.spyOn(performance, "now").mockReturnValue(0);
    content.scrollTop = 200;
    touch("touchstart", 100);
    touch("touchmove", 300);
    content.scrollTop = 0;
    vi.mocked(performance.now).mockReturnValue(100);
    touch("touchmove", 400);
    vi.mocked(performance.now).mockReturnValue(300);
    touch("touchmove", 420);
    touch("touchend", 420);
    frame(301);
    frame(901);
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("keeps native scrolling when the finger reverses before reaching the top", () => {
    openSheet();
    content.scrollTop = 100;
    touch("touchstart", 200);
    touch("touchmove", 250);
    expect(touch("touchmove", 240).defaultPrevented).toBe(false);
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("does not interrupt native scrolling on a move with no vertical delta", () => {
    openSheet();
    content.scrollTop = 100;
    touch("touchstart", 200);
    touch("touchmove", 250);
    expect(touch("touchmove", 250).defaultPrevented).toBe(false);
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("waits for nested content to reach the top too", () => {
    openSheet();
    const nested = document.createElement("div");
    content.append(nested);
    nested.scrollTop = 50;
    touch("touchstart", 200, { target: nested });
    expect(touch("touchmove", 230, { target: nested }).defaultPrevented).toBe(false);
    expect(sheet.style.transform).toBe("translateY(0px)");
    nested.scrollTop = 0;
    touch("touchmove", 250, { target: nested });
    touch("touchmove", 270, { target: nested });
    expect(sheet.style.transform).toBe("translateY(20px)");
  });

  it("allows a fresh pull immediately after an uncancellable native scroll", () => {
    openSheet();
    content.scrollTop = 100;
    touch("touchstart", 200);
    touch("touchmove", 250, { cancelable: false });
    content.scrollTop = 0;
    expect(touch("touchmove", 300, { cancelable: false }).defaultPrevented).toBe(false);
    expect(sheet.style.transform).toBe("translateY(0px)");
    touch("touchend", 300);
    touch("touchstart", 300);
    expect(touch("touchmove", 303).defaultPrevented).toBe(true);
    touch("touchmove", 330);
    expect(sheet.style.transform).toBe("translateY(30px)");
  });

  it("does not turn momentum scroll events into a sheet drag", () => {
    openSheet();
    content.scrollTop = 100;
    touch("touchstart", 200);
    touch("touchmove", 250);
    touch("touchend", 250);
    content.scrollTop = -10;
    content.dispatchEvent(new Event("scroll"));
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("lets the handle drag while the content is still scrolled", () => {
    openSheet();
    content.scrollTop = 100;
    const handle = fixture.nativeElement.querySelector(".handle-region");
    touch("touchstart", 100, { target: handle });
    expect(touch("touchmove", 103, { target: handle }).defaultPrevented).toBe(true);
    touch("touchmove", 140, { target: handle });
    expect(sheet.style.transform).toBe("translateY(40px)");
  });

  it("snaps a cancelled small drag back without treating cancellation as a flick", () => {
    openSheet();
    touch("touchstart", 300);
    touch("touchmove", 320);
    touch("touchcancel", 320);
    frame(1);
    frame(601);
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("releases horizontal scrollers before the drag threshold", () => {
    const scroller = document.createElement("div");
    scroller.setAttribute("data-horizontal-scroll", "");
    content.append(scroller);
    touch("touchstart", 550, { target: scroller });
    expect(touch("touchmove", 551, { target: scroller, x: 104 }).defaultPrevented).toBe(false);
    touch("touchmove", 500, { target: scroller, x: 150 });
    expect(sheet.style.transform).toBe("translateY(510px)");
  });

  it("follows a WebKit fast flick whose first move cannot be cancelled", () => {
    // iOS sends the first move of a fast flick as non-cancelable and the rest
    // as cancelable; the sheet must not give up the gesture on that first move.
    touch("touchstart", 550);
    expect(touch("touchmove", 538, { cancelable: false }).defaultPrevented).toBe(false);
    expect(touch("touchmove", 515).defaultPrevented).toBe(true);
    touch("touchmove", 480);
    expect(sheet.style.transform).not.toBe("translateY(510px)");
  });

  it("closes from the top of open content even when iOS owns the gesture", () => {
    openSheet();
    content.scrollTop = 0;
    // iOS gives the content's scroller the whole gesture: nothing is cancelable.
    touch("touchstart", 100);
    touch("touchmove", 112, { cancelable: false });
    touch("touchmove", 160, { cancelable: false });
    expect(sheet.style.transform).not.toBe("translateY(0px)");
  });

  it("leaves real content scrolling to iOS", () => {
    openSheet();
    content.scrollTop = 100;
    touch("touchstart", 100);
    touch("touchmove", 112, { cancelable: false });
    touch("touchmove", 160, { cancelable: false });
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("does not cancel or take over an already native gesture", () => {
    touch("touchstart", 550);
    const preventDefault = vi.spyOn(Event.prototype, "preventDefault");
    touch("touchmove", 510, { cancelable: false });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe("translateY(510px)");
  });

  it("reports progress only when a threshold is crossed", () => {
    const progress: number[] = [];
    fixture.componentInstance.openProgressChange.subscribe((value) => progress.push(value));

    touch("touchstart", 550);
    for (let y = 545; y >= 50; y -= 5) touch("touchmove", y);

    // 100 moves across the whole sheet, but only one report per band.
    expect(progress.length).toBeLessThanOrEqual(5);
    expect(progress.at(-1)).toBeGreaterThan(0.95);
  });

  it("stops a snap animation when a new drag starts", () => {
    fixture.componentInstance.maximize();
    frame(1);
    frame(101);
    touch("touchstart", 400);
    touch("touchmove", 360);
    const draggedPosition = sheet.style.transform;
    frame(601);
    expect(sheet.style.transform).toBe(draggedPosition);
  });

  it("lets a snap finish when a touch remains a tap", () => {
    fixture.componentInstance.maximize();
    frame(1);
    frame(101);
    touch("touchstart", 400);
    touch("touchend", 400);
    frame(601);
    expect(sheet.style.transform).toBe("translateY(0px)");
  });

  it("removes active touch handlers and animation frames on destruction", () => {
    touch("touchstart", 550);
    fixture.destroy();
    const event = touch("touchmove", 510, { target: document.documentElement });
    expect(event.defaultPrevented).toBe(false);
    expect(frames.size).toBe(0);
  });
});
