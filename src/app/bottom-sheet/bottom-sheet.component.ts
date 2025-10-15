import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  Renderer2,
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
  @Input() title = "";
  @Output() isAtTopChange = new EventEmitter<boolean>();
  @Output() openProgressChange = new EventEmitter<number>(); // 0 = bottom (closed), 1 = top (open)

  headerHeight = 140;
  minimumSpeedToSlide = 5;

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
  private lastEmittedProgress = Number.NaN;
  private lastIsAtTop: boolean | null = null;
  private readonly dragExcludeSelector =
    "input, select, textarea, [contenteditable='true'], [data-drag-exclude], [data-sheet-drag='false']";

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

    const height = sheetEl.clientHeight;
    const alwaysVisibleHeight = Math.max(height - this.headerHeight, 0);
    const top = sheetEl.offsetTop;
    this.emitSheetState(top, alwaysVisibleHeight);

    if (this.contentElement) {
      this.addListener(this.contentElement, "scroll", () => {
        if (!this.contentElement) return;
        this.isContentAtTop.set(this.contentElement.scrollTop === 0);
      });
      this.isContentAtTop.set(this.contentElement.scrollTop === 0);
    }

    const startDrag = (event: PointerEvent) => {
      if (typeof window === "undefined") return;
      if (!this.contentElement) return;
      if (this.activePointerId !== null) return;

      this.activePointerId = event.pointerId;

      let lastY = event.pageY;
      let speed = 0;
      const animationDurationMs = 500;
      const alwaysVisible = Math.max(
        sheetEl.clientHeight - this.headerHeight,
        0
      );
      const topHeightOffset = 0;
      const bottomHeightOffset = alwaysVisible;
      let hasPointerCapture = false;

      let isScrollableUp = false;
      let target: HTMLElement | null = event.target as HTMLElement | null;

      const isAtTop = sheetEl.offsetTop === 0;
      if (isAtTop) {
        while (target) {
          if (target === sheetEl) break;
          if (
            target.clientHeight !== 0 &&
            target.scrollHeight > target.clientHeight + 2
          ) {
            if (target.scrollTop !== 0) {
              isScrollableUp = true;
              break;
            }
          }
          target = target.parentElement;
        }
      }

      const clientY = event.clientY;
      const shiftY = clientY - sheetEl.offsetTop;
      const initialY = clientY;
      let hasDragged = false;
      const minDragDistance = 10;

      const moveAt = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== this.activePointerId) {
          return;
        }

        const pageY = moveEvent.pageY;

        if (!hasDragged) {
          const distance = Math.abs(pageY - initialY);
          if (distance <= minDragDistance) {
            return;
          }

          hasDragged = true;

          if (!hasPointerCapture) {
            try {
              sheetEl.setPointerCapture(this.activePointerId!);
              hasPointerCapture = true;
            } catch {
              // ignore
            }
          }
        }

        moveEvent.preventDefault();

        const isScrollingUp = pageY - shiftY >= 0;
        if (isScrollingUp && isScrollableUp) {
          this.contentElement!.style.overflowY = "scroll";
          return;
        }

        speed = pageY - lastY;
        lastY = pageY;

        let newTop = pageY - shiftY;
        if (newTop < 0) newTop = 0;
        if (newTop > alwaysVisible) newTop = alwaysVisible;

        if (newTop === 0) {
          this.contentElement!.style.overflowY = "scroll";
        } else {
          this.contentElement!.style.overflowY = "hidden";
        }

        sheetEl.style.top = `${newTop}px`;
        this.emitSheetState(newTop, alwaysVisible);
      };

      const stopDrag = (stopEvent: PointerEvent) => {
        if (stopEvent.pointerId !== this.activePointerId) {
          return;
        }

        removePointerMove();
        removePointerUp();
        removePointerCancel();

        if (hasPointerCapture) {
          try {
            sheetEl.releasePointerCapture(this.activePointerId);
          } catch {
            // ignore failures
          }
        }

        const offset = sheetEl.offsetTop;
        const middlePoint = (bottomHeightOffset - topHeightOffset) / 2;

        if (!hasDragged) {
          this.activePointerId = null;
          return;
        }

        let targetOffset = bottomHeightOffset;

        if (Math.abs(speed) > this.minimumSpeedToSlide) {
          if (speed > 0) {
            targetOffset = bottomHeightOffset;
            this.contentElement!.style.overflowY = "hidden";
          } else {
            targetOffset = topHeightOffset;
            this.contentElement!.style.overflowY = "scroll";
          }
        } else {
          if (offset > middlePoint) {
            targetOffset = bottomHeightOffset;
            this.contentElement!.style.overflowY = "hidden";
          } else {
            targetOffset = topHeightOffset;
            this.contentElement!.style.overflowY = "scroll";
          }
        }

        const distance = targetOffset - offset;

        let start = 0;
        const step = (timestamp: number) => {
          if (!start) start = timestamp;
          const timeProgress = timestamp - start;

          const current = this.easeOutCubic(
            timeProgress,
            offset,
            distance,
            animationDurationMs
          );

          sheetEl.style.top = `${current}px`;
          this.emitSheetState(current, alwaysVisible);

          if (timeProgress < animationDurationMs) {
            window.requestAnimationFrame(step);
          } else {
            sheetEl.style.top = `${targetOffset}px`;
            this.emitSheetState(targetOffset, alwaysVisible);
          }
        };
        window.requestAnimationFrame(step);

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
  }

  ngOnDestroy(): void {
    this.destroyListeners.forEach((fn) => fn());
    this.destroyListeners = [];
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

  easeOutCubic(t: number, b: number, c: number, d: number): number {
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
