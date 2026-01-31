import {
  AfterViewInit,
  Directive,
  ElementRef,
  inject,
  input,
  OnChanges,
} from "@angular/core";
import autoAnimate from "@formkit/auto-animate";

@Directive({
  selector: "[appAutoAnimate]",
  standalone: true,
})
export class AutoAnimateDirective implements AfterViewInit, OnChanges {
  private el = inject(ElementRef);
  private controller: any; // AutoAnimateController type is not exported by some versions, explicit any is safe or use proper type if available

  options = input<any>(undefined); // Optional customization
  appAutoAnimate = input<boolean>(true); // Enabled state

  ngAfterViewInit(): void {
    this.controller = autoAnimate(this.el.nativeElement, this.options());
    this.updateState();
  }

  ngOnChanges(): void {
    this.updateState();
  }

  private updateState() {
    if (this.controller) {
      if (this.appAutoAnimate()) {
        this.controller.enable();
      } else {
        this.controller.disable();
      }
    }
  }
}
