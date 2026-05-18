import {
  Directive,
  ElementRef,
  HostListener,
  effect,
  inject,
  input,
} from "@angular/core";
import { KeyboardService } from "../services/keyboard.service";

/**
 * Opt-in directive that scrolls the host element into view when it gains
 * focus and the on-screen keyboard appears.
 *
 * Usage:
 *   <input appAutoScrollOnFocus />
 *
 * The directive waits until the keyboard height becomes known (or a small
 * timeout elapses) before scrolling, so the final layout — with the keyboard
 * visible — is what gets scrolled into view.
 */
@Directive({
  selector: "[appAutoScrollOnFocus]",
  standalone: true,
})
export class AutoScrollOnFocusDirective {
  private _el = inject<ElementRef<HTMLElement>>(ElementRef);
  private _keyboard = inject(KeyboardService);

  /** Vertical alignment within the visible viewport after scrolling. */
  block = input<ScrollLogicalPosition>("center");

  private _focused = false;

  constructor() {
    // When keyboard height changes while the input is focused, re-align.
    effect(() => {
      const h = this._keyboard.keyboardHeight();
      if (this._focused && h > 0) {
        this.scrollIntoView();
      }
    });
  }

  @HostListener("focus")
  onFocus() {
    this._focused = true;
    // Fallback for environments where the keyboard event never fires
    // (e.g. external keyboard on iPad) — still bring the input into view.
    setTimeout(() => {
      if (this._focused) this.scrollIntoView();
    }, 350);
  }

  @HostListener("blur")
  onBlur() {
    this._focused = false;
  }

  private scrollIntoView() {
    const el = this._el.nativeElement;
    if (!el || !el.isConnected) return;
    // Force a synchronous layout pass so any pending CSS-var-driven size
    // change (e.g. .keyboard-padding margin-bottom) is committed before
    // the browser computes the smooth-scroll target. Without this read,
    // smooth scrolling can land at a stale position computed before the
    // keyboard offset took effect.
    void el.offsetHeight;
    try {
      el.scrollIntoView({ block: this.block(), behavior: "smooth" });
    } catch {
      el.scrollIntoView();
    }
  }
}
