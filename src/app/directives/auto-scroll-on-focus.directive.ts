import {
  Directive,
  ElementRef,
  HostListener,
  effect,
  inject,
  input,
} from "@angular/core";
import { Capacitor } from "@capacitor/core";
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
  private readonly _isNative = Capacitor.isNativePlatform();

  /** Vertical alignment within the visible viewport after scrolling. */
  block = input<ScrollLogicalPosition>("center");

  private _focused = false;

  constructor() {
    // When keyboard height changes while the input is focused, re-align.
    effect(() => {
      const h = this._keyboard.keyboardHeight();
      if (!this._isNative && this._focused && h > 0) {
        this.scrollIntoView();
      }
    });
  }

  @HostListener("focus")
  onFocus() {
    if (this._isNative) {
      console.debug("[AutoScrollOnFocus] native focus ignored", {
        target: this.describeElement(this._el.nativeElement),
      });
      return;
    }

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
    if (!el || !el.isConnected) {
      console.debug("[AutoScrollOnFocus] scroll skipped", {
        hasElement: !!el,
        isConnected: el?.isConnected ?? null,
      });
      return;
    }
    // Force a synchronous layout pass so any pending CSS-var-driven size
    // change (e.g. .keyboard-padding margin-bottom) is committed before
    // the browser computes the smooth-scroll target. Without this read,
    // smooth scrolling can land at a stale position computed before the
    // keyboard offset took effect.
    void el.offsetHeight;
    try {
      console.debug("[AutoScrollOnFocus] scrollIntoView", {
        target: this.describeElement(el),
        block: this.block(),
        rect: this.describeRect(el.getBoundingClientRect()),
      });
      el.scrollIntoView({ block: this.block(), behavior: "smooth" });
    } catch {
      console.debug("[AutoScrollOnFocus] scrollIntoView fallback", {
        target: this.describeElement(el),
      });
      el.scrollIntoView();
    }
  }

  private describeElement(element: HTMLElement): Record<string, unknown> {
    return {
      tagName: element.tagName,
      id: element.id || null,
      className:
        typeof element.className === "string" ? element.className : null,
      name: element.getAttribute("name"),
      type: element.getAttribute("type"),
    };
  }

  private describeRect(rect: DOMRect): Record<string, number> {
    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
    };
  }
}
