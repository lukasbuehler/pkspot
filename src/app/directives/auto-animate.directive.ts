import { AfterViewInit, Directive, ElementRef, inject } from "@angular/core";
import autoAnimate from "@formkit/auto-animate";

@Directive({
  selector: "[appAutoAnimate]",
  standalone: true,
})
export class AutoAnimateDirective implements AfterViewInit {
  private el = inject(ElementRef);

  ngAfterViewInit(): void {
    autoAnimate(this.el.nativeElement);
  }
}
