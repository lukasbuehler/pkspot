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

  it("releases horizontal scrollers before the drag threshold", () => {
    const scroller = document.createElement("div");
    scroller.setAttribute("data-horizontal-scroll", "");
    content.append(scroller);
    touch("touchstart", 550, { target: scroller });
    expect(touch("touchmove", 551, { target: scroller, x: 104 }).defaultPrevented).toBe(false);
    touch("touchmove", 500, { target: scroller, x: 150 });
    expect(sheet.style.transform).toBe("translateY(510px)");
  });

  it("does not cancel or take over an already native gesture", () => {
    touch("touchstart", 550);
    const preventDefault = vi.spyOn(Event.prototype, "preventDefault");
    touch("touchmove", 510, { cancelable: false });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe("translateY(510px)");
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
