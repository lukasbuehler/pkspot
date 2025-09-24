import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  Renderer2,
  signal,
  ViewChild,
} from "@angular/core";

@Component({
  selector: "app-bottom-sheet",
  templateUrl: "./bottom-sheet.component.html",
  styleUrls: ["./bottom-sheet.component.scss"],
  standalone: true,
})
export class BottomSheetComponent {
  @Input() title: string = "";
  @Output() isAtTopChange = new EventEmitter<boolean>();
  @Output() openProgressChange = new EventEmitter<number>(); // 0 = bottom (closed), 1 = top (open)

  headerHeight: number = 140;
  minimumSpeedToSlide: number = 5;

  isContentAtTop = signal<boolean>(false);

  @ViewChild("bottomSheet", { static: true }) bottomSheet:
    | ElementRef
    | undefined;

  contentElement: HTMLElement | undefined;

  constructor(private renderer: Renderer2) {}

  ngAfterViewInit() {
    this.renderer.listen(
      this.bottomSheet?.nativeElement,
      "dragstart",
      (event: DragEvent) => {
        event.preventDefault();
      }
    );

    console.log("bottomSheet", this.bottomSheet);
    console.log("bottomSheet.nativeElement", this.bottomSheet?.nativeElement);

    this.contentElement = this.bottomSheet?.nativeElement
      .lastChild as HTMLElement;
    console.log("contentElement", this.contentElement);

    // Emit initial open/closed state and progress to parent
    if (this.bottomSheet) {
      const el = this.bottomSheet.nativeElement as HTMLElement;
      const height = el.clientHeight;
      const alwaysVisibleHeight = height - this.headerHeight;
      const top = el.offsetTop;
      const atTop = top === 0;
      const progress =
        alwaysVisibleHeight > 0
          ? 1 - Math.min(Math.max(top / alwaysVisibleHeight, 0), 1)
          : 0;
      this.isAtTopChange.emit(atTop);
      this.openProgressChange.emit(progress);
    }

    // Set up scroll listener for content to update signal
    if (this.contentElement) {
      this.renderer.listen(this.contentElement, "scroll", () => {
        if (this.contentElement) {
          this.isContentAtTop.set(this.contentElement.scrollTop === 0);
        }
      });

      // Initial check
      this.isContentAtTop.set(this.contentElement.scrollTop === 0);
    }

    const startDrag = (event: MouseEvent | TouchEvent) => {
      if (typeof window === "undefined") return; // abort if not in browser
      if (!this.bottomSheet || !this.contentElement) return;

      let lastY = 0;
      let speed = 0;
      let height = this.bottomSheet.nativeElement.clientHeight;
      let alwaysVisibleHeight = height - this.headerHeight;

      let animationSteps = 500;

      let topHeightOffset = 0;
      let bottomHeightOffset = alwaysVisibleHeight;

      let isScrollableUp = false;
      let target: HTMLElement = event.target as HTMLElement;

      let isAtTop: boolean = this.bottomSheet.nativeElement.offsetTop === 0;

      if (isAtTop) {
        while (target) {
          if (target === this.bottomSheet.nativeElement) break;
          if (
            target.clientHeight !== 0 &&
            target.scrollHeight > target.clientHeight + 2
          ) {
            // the + 2 is for borders i assume, had to put it in

            // now check if a scrollable element is at the top
            const scrollOffsetToTop = target.scrollTop;

            if (scrollOffsetToTop !== 0) {
              isScrollableUp = true;
              break;
            }
          }
          target = target.parentElement as HTMLElement;
        }
      }

      let clientY =
        event.type === "touchstart"
          ? (event as TouchEvent).touches[0].clientY
          : (event as MouseEvent).clientY;
      let shiftY = clientY - this.bottomSheet.nativeElement.offsetTop;

      // Track initial Y for minimum drag distance
      let initialY = clientY;
      let hasDragged = false;
      const minDragDistance = 10; // px

      const moveAt = (moveEvent: TouchEvent | MouseEvent) => {
        if (!this.bottomSheet || !this.contentElement) return;

        let pageY =
          window.TouchEvent && moveEvent instanceof TouchEvent
            ? moveEvent.touches[0].pageY
            : (moveEvent as MouseEvent).pageY;

        // Check if drag distance exceeded threshold
        if (!hasDragged && Math.abs(pageY - initialY) > minDragDistance) {
          hasDragged = true;
        }

        const isScrollingUp = pageY - shiftY >= 0;
        if (isScrollingUp && isScrollableUp) {
          // don't move the sheet when the user is scrolling up, and the content can scroll up
          this.contentElement.style.overflowY = "scroll";
          return;
        }

        // Calculate speed
        speed = pageY - lastY;
        lastY = pageY;

        let newTop = pageY - shiftY;

        if (newTop < 0) newTop = 0;
        if (newTop > alwaysVisibleHeight) newTop = alwaysVisibleHeight;

        if (newTop === 0) {
          this.contentElement.style.overflowY = "scroll";
        } else {
          this.contentElement.style.overflowY = "hidden";
        }

        this.bottomSheet.nativeElement.style.top = newTop + "px";
        this.isAtTopChange.emit(newTop === 0);
        const progress =
          alwaysVisibleHeight > 0
            ? 1 - Math.min(Math.max(newTop / alwaysVisibleHeight, 0), 1)
            : 0;
        this.openProgressChange.emit(progress);
      };

      const mouseMoveListener = this.renderer.listen(
        "document",
        "mousemove",
        moveAt
      );
      const touchMoveListener = this.renderer.listen(
        "document",
        "touchmove",
        moveAt
      );

      const stopDrag = (event: MouseEvent | TouchEvent) => {
        if (!this.bottomSheet || !this.contentElement) return;

        mouseMoveListener();
        touchMoveListener();

        let pageY =
          event.type === "touchend"
            ? (event as TouchEvent).changedTouches[0].pageY
            : (event as MouseEvent).pageY;

        let targetOffset = bottomHeightOffset; // default closed

        // Calculate the distance to the target position
        let offset = this.bottomSheet.nativeElement.offsetTop;

        let middlePoint = (bottomHeightOffset - topHeightOffset) / 2;

        // Only trigger slide if drag distance exceeded threshold
        if (!hasDragged) {
          // Not a real drag, do nothing (don't close/open)
          return;
        }

        // the user let go, decide where to slide the sheet to
        if (Math.abs(speed) > this.minimumSpeedToSlide) {
          if (speed > 0) {
            targetOffset = bottomHeightOffset;
            this.contentElement.style.overflowY = "hidden";
          } else {
            targetOffset = topHeightOffset;
            this.contentElement.style.overflowY = "scroll";
          }
        } else {
          // decide the next sheet position based on the offset
          if (offset > middlePoint) {
            targetOffset = bottomHeightOffset;
            this.contentElement.style.overflowY = "hidden";
          } else {
            targetOffset = topHeightOffset;
            this.contentElement.style.overflowY = "scroll";
          }
        }

        let distance = targetOffset - offset;

        // Start the easing
        let start: number = 0;
        const step = (timestamp: number) => {
          if (!start) start = timestamp;
          let timeProgress = timestamp - start;

          // Calculate the current position
          let current = this.easeOutCubic(
            timeProgress,
            offset,
            distance,
            animationSteps
          );

          this.bottomSheet!.nativeElement.style.top = current + "px";
          // consider near-zero as top to avoid off-by-fractional pixels
          this.isAtTopChange.emit(Math.abs(current) < 0.5);
          const progress =
            alwaysVisibleHeight > 0
              ? 1 - Math.min(Math.max(current / alwaysVisibleHeight, 0), 1)
              : 0;
          this.openProgressChange.emit(progress);

          // Continue the easing if not at the target position
          if (timeProgress < animationSteps) {
            window.requestAnimationFrame(step);
          }
        };
        window.requestAnimationFrame(step);
      };

      this.renderer.listen("document", "mouseup", stopDrag);
      this.renderer.listen("document", "touchend", stopDrag);
      //   this.renderer.listen("document", "mouseleave", stopDrag);
      //   this.renderer.listen("window", "blur", stopDrag);
    };

    if (!this.bottomSheet) return;

    this.renderer.listen(
      this.bottomSheet.nativeElement,
      "mousedown",
      startDrag
    );
    this.renderer.listen(
      this.bottomSheet.nativeElement,
      "touchstart",
      startDrag
    );
  }

  easeOutCubic(t: number, b: number, c: number, d: number): number {
    t /= d;
    t--;
    return c * (t * t * t + 1) + b;
  }
}
