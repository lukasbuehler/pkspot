import {
  Directive,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  inject,
  NgZone,
} from "@angular/core";

@Directive({
  selector: "[appResizeObserver]",
  standalone: true,
})
export class ResizeObserverDirective implements OnDestroy {
  @Output() resize = new EventEmitter<DOMRectReadOnly>();

  private el = inject(ElementRef<HTMLElement>);
  private ngZone = inject(NgZone);
  private observer: ResizeObserver | null = null;

  constructor() {
    // Only initialize ResizeObserver in a browser environment where it's available.
    if (
      typeof window !== "undefined" &&
      typeof ResizeObserver !== "undefined"
    ) {
      this.observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          this.ngZone.run(() => {
            this.resize.emit(entry.contentRect);
          });
        }
      });

      try {
        this.observer.observe(this.el.nativeElement);
      } catch (e) {
        // In some environments the element might not be observable; fail silently.
      }
    } else {
      // Server-side rendering: leave observer null (no-op). The directive will
      // not emit resize events during SSR but will work normally in the browser.
      this.observer = null;
    }
  }

  ngOnDestroy() {
    try {
      this.observer?.disconnect();
    } catch (e) {
      // ignore
    }
  }
}
