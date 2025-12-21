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
  private observer: ResizeObserver;

  constructor() {
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
  }

  ngOnDestroy() {
    try {
      this.observer.disconnect();
    } catch (e) {
      // ignore
    }
  }
}
