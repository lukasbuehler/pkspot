import {
  Component,
  ElementRef,
  Input,
  Renderer2,
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

  headerHeight: number = 120;
  minimumSpeedToSlide: number = 5;

  @ViewChild("bottomSheet", { static: true }) bottomSheet: ElementRef;

  constructor(private renderer: Renderer2) {}

  ngAfterViewInit() {
    this.renderer.listen(
      this.bottomSheet.nativeElement,
      "dragstart",
      (event) => {
        event.preventDefault();
      }
    );

    const startDrag = (event) => {
      if (typeof window === "undefined") return; // abort if not in browser

      let lastY = 0;
      let speed = 0;
      let height = this.bottomSheet.nativeElement.clientHeight;
      let alwaysVisibleHeight = height - this.headerHeight;

      let animationSteps = 500;

      let topHeightOffset = 0;
      let bottomHeightOffset = alwaysVisibleHeight;

      let isScrollableUp = false;
      let target = event.target;

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
          target = target.parentElement;
        }
      }

      let clientY =
        event.type === "touchstart" ? event.touches[0].clientY : event.clientY;
      let shiftY = clientY - this.bottomSheet.nativeElement.offsetTop;

      const moveAt = (event) => {
        let pageY =
          event.type === "touchmove" ? event.touches[0].pageY : event.pageY;

        const isScrollingUp = pageY - shiftY > 0;
        if (isScrollingUp && isScrollableUp) {
          // don't move the sheet when the user is scrolling up, and the content can scroll up
          return;
        }

        // Calculate speed
        speed = pageY - lastY;
        lastY = pageY;

        let newTop = pageY - shiftY;

        if (newTop < 0) newTop = 0;
        if (newTop > alwaysVisibleHeight) newTop = alwaysVisibleHeight;

        this.bottomSheet.nativeElement.style.top = newTop + "px";
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

      const stopDrag = (event) => {
        mouseMoveListener();
        touchMoveListener();

        let pageY =
          event.type === "touchend"
            ? event.changedTouches[0].pageY
            : event.pageY;

        let targetOffset = bottomHeightOffset; // default closed

        // Calculate the distance to the target position
        let offset = this.bottomSheet.nativeElement.offsetTop;

        let middlePoint = (bottomHeightOffset - topHeightOffset) / 2;

        // the user let go, decide where to slide the sheet to
        if (Math.abs(speed) > this.minimumSpeedToSlide) {
          if (speed > 0) {
            targetOffset = bottomHeightOffset;
          } else {
            targetOffset = topHeightOffset;
          }

          // prevent pull to refresh and other default browser behavior
          event.preventDefault();
        } else {
          // decide the next sheet position based on the offset
          if (offset > middlePoint) {
            targetOffset = bottomHeightOffset;
          } else {
            targetOffset = topHeightOffset;
          }
        }

        let distance = targetOffset - offset;

        // Start the easing
        let start = null;
        const step = (timestamp) => {
          if (!start) start = timestamp;
          let progress = timestamp - start;

          // Calculate the current position
          let current = this.easeOutCubic(
            progress,
            offset,
            distance,
            animationSteps
          );

          this.bottomSheet.nativeElement.style.top = current + "px";

          // Continue the easing if not at the target position
          if (progress < animationSteps) {
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

  easeOutCubic(t, b, c, d) {
    t /= d;
    t--;
    return c * (t * t * t + 1) + b;
  }
}
