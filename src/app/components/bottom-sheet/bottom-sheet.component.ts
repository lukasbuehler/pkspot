import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  input,
  OnDestroy,
  Output,
  Renderer2,
  effect,
  inject,
  signal,
  ViewChild,
} from "@angular/core";

@Component({
  selector: "app-bottom-sheet",
  templateUrl: "./bottom-sheet.component.html",
  styleUrls: ["./bottom-sheet.component.scss"],
  standalone: true,
})
export class BottomSheetComponent implements AfterViewInit, OnDestroy {
  @Output() isAtTopChange = new EventEmitter<boolean>();
  @Output() openProgressChange = new EventEmitter<number>(); // 0 = bottom (closed), 1 = top (open)

  /**
   * Height of the visible portion when the sheet is closed.
   * This controls how much of the sheet "peeks" above the bottom.
   * Default: 140px
   */
  closedHeight = input<number>(90);

  private hostEl = inject(ElementRef);

  constructor() {
    // Keep the CSS custom property in sync with the input value
    effect(() => {
      this.hostEl.nativeElement.style.setProperty(
        "--bottom-sheet-closed-height",
        `${this.closedHeight()}px`
      );
    });
  }

  private readonly animationDurationMs = 500;
  private readonly minDragDistance = 10;
  // Velocity threshold in pixels per millisecond for flick gestures
  private readonly flickVelocityThreshold = 0.5;

  isContentAtTop = signal<boolean>(false);

  @ViewChild("bottomSheet", { static: true }) bottomSheet?:
    | ElementRef<HTMLElement>
    | undefined;
  @ViewChild("handleRegion", { static: true }) handleRegion?:
    | ElementRef<HTMLElement>
    | undefined;
  @ViewChild("contentEl", { static: true }) contentRef?:
    | ElementRef<HTMLElement>
    | undefined;

  private renderer = inject(Renderer2);
  private contentElement?: HTMLElement;
  private destroyListeners: (() => void)[] = [];
  private activePointerId: number | null = null;
  private activeTouchId: number | null = null;
  private lastEmittedProgress = Number.NaN;
  private lastIsAtTop: boolean | null = null;
  // Track current offset internally to avoid reading offsetTop (layout thrashing)
  private currentOffset = 0;
  private readonly dragExcludeSelector =
    "input, select, textarea, [contenteditable='true'], [data-drag-exclude], [data-sheet-drag='false']";
  private resizeObserver: ResizeObserver | null = null;
  private lastRecordedHeight = 0;
  private mutationObserver: MutationObserver | null = null;

  // ─── Shared drag helpers ───────────────────────────────────────────

  private getAlwaysVisible(sheetEl: HTMLElement): number {
    return Math.max(sheetEl.clientHeight - this.closedHeight(), 0);
  }

  /**
   * Recalculates the sheet's position after a layout change (e.g., auth state change affecting navbar).
   * This ensures the sheet stays properly positioned when the available space changes.
   */
  private recalculateSheetPosition(sheetEl: HTMLElement): void {
    const newHeight = sheetEl.clientHeight;
    const newAlwaysVisible = Math.max(newHeight - this.closedHeight(), 0);

    // If size hasn't changed, no need to recalculate
    if (newAlwaysVisible === this.lastRecordedHeight) {
      return;
    }

    const oldAlwaysVisible = this.lastRecordedHeight;
    this.lastRecordedHeight = newAlwaysVisible;

    // Calculate the offset change (difference in available space)
    const offsetDelta = newAlwaysVisible - oldAlwaysVisible;

    // If sheet is closed, update the offset by the delta
    // If sheet is open (currentOffset = 0), keep it open
    if (this.currentOffset > 0) {
      // Sheet is closed or partially open - shift by the delta
      const newOffset = Math.max(
        0,
        Math.min(this.currentOffset + offsetDelta, newAlwaysVisible)
      );
      this.currentOffset = newOffset;
      sheetEl.style.transform = `translateY(${newOffset}px)`;
      this.emitSheetState(newOffset, newAlwaysVisible);
    } else {
      // Sheet is fully open - keep it open
      sheetEl.style.transform = `translateY(0px)`;
      this.emitSheetState(0, newAlwaysVisible);
    }
  }

  private checkScrollableUp(
    target: HTMLElement | null,
    sheetEl: HTMLElement
  ): boolean {
    // Use tracked offset instead of reading offsetTop
    if (this.currentOffset !== 0) return false;
    let el = target;
    while (el) {
      if (el === sheetEl) break;
      if (
        el.clientHeight !== 0 &&
        el.scrollHeight > el.clientHeight + 2 &&
        el.scrollTop !== 0
      ) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Checks if any scrollable ancestor can scroll down (content below viewport)
   */
  private checkScrollableDown(
    target: HTMLElement | null,
    sheetEl: HTMLElement
  ): boolean {
    if (this.currentOffset !== 0) return false;
    let el = target;
    while (el) {
      if (el === sheetEl) break;
      if (
        el.clientHeight !== 0 &&
        el.scrollHeight > el.clientHeight + 2 &&
        el.scrollTop < el.scrollHeight - el.clientHeight - 2
      ) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Determines the target position based on velocity or distance.
   * @param velocity - Velocity in pixels per millisecond (positive = down, negative = up)
   * @param currentOffset - Current top offset of the sheet
   * @param alwaysVisible - The height that remains visible when sheet is "closed"
   */
  private calculateTargetOffset(
    velocity: number,
    currentOffset: number,
    alwaysVisible: number
  ): { targetOffset: number; overflowY: "scroll" | "hidden" } {
    const middlePoint = alwaysVisible / 2;

    // Check if velocity exceeds flick threshold
    if (Math.abs(velocity) > this.flickVelocityThreshold) {
      // Flick gesture - use velocity direction
      // Positive velocity = dragging down = close sheet
      // Negative velocity = dragging up = open sheet
      return velocity > 0
        ? { targetOffset: alwaysVisible, overflowY: "hidden" }
        : { targetOffset: 0, overflowY: "scroll" };
    } else {
      // Slow drag - snap to nearest position based on current offset
      return currentOffset > middlePoint
        ? { targetOffset: alwaysVisible, overflowY: "hidden" }
        : { targetOffset: 0, overflowY: "scroll" };
    }
  }

  private animateToPosition(
    sheetEl: HTMLElement,
    fromOffset: number,
    targetOffset: number,
    alwaysVisible: number
  ): void {
    const distance = targetOffset - fromOffset;
    let start = 0;

    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const timeProgress = timestamp - start;

      const current = this.easeOutCubic(
        timeProgress,
        fromOffset,
        distance,
        this.animationDurationMs
      );

      this.currentOffset = current;
      sheetEl.style.transform = `translateY(${current}px)`;
      this.emitSheetState(current, alwaysVisible);

      if (timeProgress < this.animationDurationMs) {
        window.requestAnimationFrame(step);
      } else {
        this.currentOffset = targetOffset;
        sheetEl.style.transform = `translateY(${targetOffset}px)`;
        this.emitSheetState(targetOffset, alwaysVisible);
      }
    };
    window.requestAnimationFrame(step);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    const sheetEl = this.bottomSheet?.nativeElement;
    if (!sheetEl) {
      return;
    }

    this.addListener(sheetEl, "dragstart", (event: Event) => {
      (event as DragEvent).preventDefault();
    });

    if (this.handleRegion) {
      this.renderer.setStyle(
        this.handleRegion.nativeElement,
        "touch-action",
        "none"
      );
    }

    this.contentElement =
      (this.contentRef?.nativeElement as HTMLElement | undefined) ??
      (sheetEl.lastElementChild as HTMLElement | undefined);

    if (this.contentElement) {
      // Start with scroll disabled since sheet is closed
      this.contentElement.style.overflowY = "hidden";
      this.addListener(this.contentElement, "scroll", () => {
        if (!this.contentElement) return;
        this.isContentAtTop.set(this.contentElement.scrollTop === 0);
      });
      this.isContentAtTop.set(this.contentElement.scrollTop === 0);
    }

    // Defer height calculation to next microtask to ensure layout is fully computed
    // This prevents the sheet from starting 10px too high due to incomplete measurements at init
    Promise.resolve().then(() => {
      const height = sheetEl.clientHeight;
      const alwaysVisibleHeight = Math.max(height - this.closedHeight(), 0);
      this.lastRecordedHeight = alwaysVisibleHeight;
      // Initialize to closed position (offset by alwaysVisible)
      this.currentOffset = alwaysVisibleHeight;
      sheetEl.style.transform = `translateY(${alwaysVisibleHeight}px)`;
      this.emitSheetState(alwaysVisibleHeight, alwaysVisibleHeight);
    });

    // Set up ResizeObserver to handle layout changes (e.g., when nav bar appears/disappears)
    // This handles cases where the page layout changes after initial render (e.g., auth state changes)
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.recalculateSheetPosition(sheetEl);
      });
      this.resizeObserver.observe(sheetEl, { box: "border-box" });
    }

    // Also listen to window resize in case ResizeObserver doesn't catch it
    // (e.g., when parent layout changes due to CSS or nav bar appearance)
    const handleWindowResize = () => {
      this.recalculateSheetPosition(sheetEl);
    };
    this.addListener(window as any, "resize", handleWindowResize);

    // Also set up a MutationObserver to detect DOM changes in the parent that might affect layout
    // (e.g., nav bar being added/removed)
    if (typeof MutationObserver !== "undefined" && sheetEl.parentElement) {
      this.mutationObserver = new MutationObserver(() => {
        // Use a small delay to allow layout to settle
        setTimeout(() => {
          this.recalculateSheetPosition(sheetEl);
        }, 50);
      });
      this.mutationObserver.observe(sheetEl.parentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }

    const startDrag = (event: PointerEvent) => {
      if (typeof window === "undefined") return;
      if (!this.contentElement) return;
      if (this.activePointerId !== null) return;

      this.activePointerId = event.pointerId;

      let lastY = event.pageY;
      const alwaysVisible = this.getAlwaysVisible(sheetEl);
      let hasPointerCapture = false;
      const isScrollableUp = this.checkScrollableUp(
        event.target as HTMLElement,
        sheetEl
      );

      const shiftY = event.clientY - this.currentOffset;
      const initialY = event.clientY;
      const startTime = performance.now();
      const startY = event.pageY;
      let hasDragged = false;

      // Prevent content scrolling during drag if sheet is not fully open
      if (this.currentOffset !== 0) {
        this.contentElement!.style.overflowY = "hidden";
      }

      const moveAt = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== this.activePointerId) return;

        const pageY = moveEvent.pageY;

        if (!hasDragged) {
          if (Math.abs(pageY - initialY) <= this.minDragDistance) return;

          hasDragged = true;
          if (!hasPointerCapture) {
            try {
              sheetEl.setPointerCapture(this.activePointerId!);
              hasPointerCapture = true;
            } catch {
              /* ignore */
            }
          }
        }

        moveEvent.preventDefault();

        if (pageY - shiftY >= 0 && isScrollableUp) {
          this.contentElement!.style.overflowY = "scroll";
          return;
        }

        lastY = pageY;

        let newTop = Math.max(0, Math.min(pageY - shiftY, alwaysVisible));
        this.currentOffset = newTop;
        this.contentElement!.style.overflowY =
          newTop === 0 ? "scroll" : "hidden";
        sheetEl.style.transform = `translateY(${newTop}px)`;
        this.emitSheetState(newTop, alwaysVisible);
      };

      const stopDrag = (stopEvent: PointerEvent) => {
        if (stopEvent.pointerId !== this.activePointerId) return;

        removePointerMove();
        removePointerUp();
        removePointerCancel();

        if (hasPointerCapture) {
          try {
            sheetEl.releasePointerCapture(this.activePointerId);
          } catch {
            /* ignore */
          }
        }

        if (!hasDragged) {
          this.activePointerId = null;
          return;
        }

        // Calculate velocity based on total distance and time
        const endTime = performance.now();
        const endY = stopEvent.pageY;
        const deltaTime = endTime - startTime;
        const deltaY = endY - startY;
        // Velocity in px/ms (positive = down, negative = up)
        const velocity = deltaTime > 0 ? deltaY / deltaTime : 0;

        const offset = this.currentOffset;
        const { targetOffset, overflowY } = this.calculateTargetOffset(
          velocity,
          offset,
          alwaysVisible
        );
        this.contentElement!.style.overflowY = overflowY;
        this.animateToPosition(sheetEl, offset, targetOffset, alwaysVisible);
        this.activePointerId = null;
      };

      const removePointerMove = this.renderer.listen(
        sheetEl,
        "pointermove",
        moveAt
      );
      const removePointerUp = this.renderer.listen(
        sheetEl,
        "pointerup",
        stopDrag
      );
      const removePointerCancel = this.renderer.listen(
        sheetEl,
        "pointercancel",
        stopDrag
      );
    };

    const handlePointerDown = (event: PointerEvent) => {
      // Skip touch - handled separately with native touch events for smooth dragging
      if (event.pointerType === "touch") {
        return;
      }
      if (!this.shouldStartDrag(event, sheetEl)) {
        return;
      }
      startDrag(event);
    };

    this.addListener(sheetEl, "pointerdown", (event) => {
      handlePointerDown(event as PointerEvent);
    });

    if (this.handleRegion) {
      this.addListener(
        this.handleRegion.nativeElement,
        "pointerdown",
        (event) => {
          event.stopPropagation();
          handlePointerDown(event as PointerEvent);
        }
      );
    }

    // Touch events - use native events with {passive: false} to enable preventDefault
    this.setupTouchHandling(sheetEl);
  }

  private setupTouchHandling(sheetEl: HTMLElement): void {
    let lastY = 0;
    let shiftY = 0;
    let initialY = 0;
    let startTime = 0;
    let startY = 0;
    let hasDragged = false;
    let isScrollableUp = false;
    let isScrollableDown = false;
    let alwaysVisible = 0;
    let removeTouchMove: (() => void) | null = null;
    let removeTouchEnd: (() => void) | null = null;
    let removeTouchCancel: (() => void) | null = null;

    const handleTouchStart = (event: TouchEvent) => {
      if (this.activeTouchId !== null) return;
      if (!this.contentElement) return;

      const touch = event.touches[0];
      if (!touch) return;

      const target = event.target as HTMLElement | null;
      if (target && this.isDragExcludedTarget(target)) return;
      if (target && !sheetEl.contains(target)) return;

      this.activeTouchId = touch.identifier;
      lastY = touch.pageY;
      initialY = touch.clientY;
      startTime = performance.now();
      startY = touch.pageY;
      shiftY = touch.clientY - this.currentOffset;
      hasDragged = false;
      alwaysVisible = this.getAlwaysVisible(sheetEl);
      isScrollableUp = this.checkScrollableUp(target, sheetEl);
      isScrollableDown = this.checkScrollableDown(target, sheetEl);

      // Prevent content scrolling during drag if sheet is not fully open
      if (this.currentOffset !== 0) {
        this.contentElement!.style.overflowY = "hidden";
      }

      // Attach move/end listeners to document so we receive events even if
      // touch started on a button or other interactive element
      removeTouchMove = this.addTouchListener(
        document.documentElement,
        "touchmove",
        handleTouchMove,
        { passive: false }
      );
      removeTouchEnd = this.addTouchListener(
        document.documentElement,
        "touchend",
        handleTouchEnd,
        { passive: true }
      );
      removeTouchCancel = this.addTouchListener(
        document.documentElement,
        "touchcancel",
        handleTouchEnd,
        { passive: true }
      );
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = this.findTouch(event.changedTouches, this.activeTouchId);
      if (!touch) return;

      const pageY = touch.pageY;

      if (!hasDragged) {
        if (Math.abs(pageY - initialY) <= this.minDragDistance) return;

        // If sheet is fully open and content is scrollable, allow native scroll
        // pageY > initialY means swiping down (scrolling up in content)
        // pageY < initialY means swiping up (scrolling down in content)
        if (this.currentOffset === 0) {
          if (
            (isScrollableUp && pageY > initialY) ||
            (isScrollableDown && pageY < initialY)
          ) {
            this.cleanupTouchListeners(
              removeTouchMove,
              removeTouchEnd,
              removeTouchCancel
            );
            this.activeTouchId = null;
            return;
          }
        }

        hasDragged = true;
      }

      event.preventDefault();

      if (pageY - shiftY >= 0 && isScrollableUp) {
        this.contentElement!.style.overflowY = "scroll";
        return;
      }

      lastY = pageY;

      let newTop = Math.max(0, Math.min(pageY - shiftY, alwaysVisible));
      this.currentOffset = newTop;
      this.contentElement!.style.overflowY = newTop === 0 ? "scroll" : "hidden";
      sheetEl.style.transform = `translateY(${newTop}px)`;
      this.emitSheetState(newTop, alwaysVisible);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const touch = this.findTouch(event.changedTouches, this.activeTouchId);
      if (!touch) return;

      this.cleanupTouchListeners(
        removeTouchMove,
        removeTouchEnd,
        removeTouchCancel
      );

      if (!hasDragged) {
        this.activeTouchId = null;
        return;
      }

      // Calculate velocity based on total distance and time
      const endTime = performance.now();
      const endY = touch.pageY;
      const deltaTime = endTime - startTime;
      const deltaY = endY - startY;
      // Velocity in px/ms (positive = down, negative = up)
      const velocity = deltaTime > 0 ? deltaY / deltaTime : 0;

      const offset = this.currentOffset;
      const { targetOffset, overflowY } = this.calculateTargetOffset(
        velocity,
        offset,
        alwaysVisible
      );
      this.contentElement!.style.overflowY = overflowY;
      this.animateToPosition(sheetEl, offset, targetOffset, alwaysVisible);
      this.activeTouchId = null;
    };

    this.addTouchListener(sheetEl, "touchstart", handleTouchStart, {
      passive: true,
    });

    if (this.handleRegion) {
      this.addTouchListener(
        this.handleRegion.nativeElement,
        "touchstart",
        (event: TouchEvent) => {
          event.stopPropagation();
          handleTouchStart(event);
        },
        { passive: true }
      );
    }
  }

  private findTouch(touches: TouchList, id: number | null): Touch | null {
    if (id === null) return null;
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === id) {
        return touches[i];
      }
    }
    return null;
  }

  private cleanupTouchListeners(
    removeTouchMove: (() => void) | null,
    removeTouchEnd: (() => void) | null,
    removeTouchCancel: (() => void) | null
  ): void {
    removeTouchMove?.();
    removeTouchEnd?.();
    removeTouchCancel?.();
  }

  private addTouchListener(
    target: HTMLElement,
    eventName: string,
    handler: (event: TouchEvent) => void,
    options: AddEventListenerOptions
  ): () => void {
    target.addEventListener(eventName, handler as EventListener, options);
    const remove = () =>
      target.removeEventListener(eventName, handler as EventListener, options);
    if (eventName === "touchstart") {
      this.destroyListeners.push(remove);
    }
    return remove;
  }

  ngOnDestroy(): void {
    this.destroyListeners.forEach((fn) => fn());
    this.destroyListeners = [];
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  private shouldStartDrag(event: PointerEvent, sheetEl: HTMLElement): boolean {
    if (this.activePointerId !== null) {
      return false;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return false;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;

    if (target && this.isHandleTarget(target)) {
      return true;
    }

    if (target && this.isDragExcludedTarget(target)) {
      return false;
    }

    if (target && !sheetEl.contains(target)) {
      return false;
    }

    return true;
  }

  private isHandleTarget(target: HTMLElement): boolean {
    return !!this.handleRegion?.nativeElement.contains(target);
  }

  private isDragExcludedTarget(target: HTMLElement): boolean {
    return target.closest(this.dragExcludeSelector) !== null;
  }

  private easeOutCubic(t: number, b: number, c: number, d: number): number {
    t /= d;
    t--;
    return c * (t * t * t + 1) + b;
  }

  private addListener(
    target: HTMLElement,
    eventName: string,
    handler: (event: Event) => void
  ) {
    const remove = this.renderer.listen(target, eventName, handler);
    this.destroyListeners.push(remove);
    return remove;
  }

  private emitSheetState(top: number, alwaysVisibleHeight: number) {
    const clampedTop = Math.max(0, Math.min(alwaysVisibleHeight, top));
    const atTop = Math.abs(clampedTop) < 0.5;
    if (this.lastIsAtTop !== atTop) {
      this.lastIsAtTop = atTop;
      this.isAtTopChange.emit(atTop);
    }

    const progress =
      alwaysVisibleHeight > 0
        ? 1 - Math.min(Math.max(clampedTop / alwaysVisibleHeight, 0), 1)
        : 0;

    const isTerminalProgress = progress <= 0.001 || progress >= 0.999;

    if (
      Number.isNaN(this.lastEmittedProgress) ||
      Math.abs(progress - this.lastEmittedProgress) > 0.01 ||
      isTerminalProgress
    ) {
      this.lastEmittedProgress = progress;
      this.openProgressChange.emit(progress);
    }
  }
}
