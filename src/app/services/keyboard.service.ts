import { Injectable, NgZone, inject, signal } from "@angular/core";
import { Capacitor } from "@capacitor/core";

/**
 * Tracks the visible keyboard height in pixels and exposes it as a signal.
 *
 * On native (iOS/Android) we listen to the Capacitor Keyboard plugin events.
 * On web we observe `visualViewport` size changes to detect the soft keyboard.
 *
 * The service also mirrors the height into a `--keyboard-offset` CSS custom
 * property on `<html>` so plain CSS can react (e.g. bottom-fixed UI).
 * It adds a `keyboard-open` class on `<html>` while the keyboard is visible.
 *
 * Android is intentionally excluded from the synthetic resize nudge: the
 * native activity uses `adjustNothing`, so dispatching resize events from
 * JavaScript would reintroduce the layout reactions we are trying to avoid.
 * The CSS offset still updates on Android so scrollable forms and dialogs can
 * reserve space above the overlaid keyboard.
 */
@Injectable({ providedIn: "root" })
export class KeyboardService {
  private _zone = inject(NgZone);

  readonly keyboardHeight = signal(0);

  private _initialized = false;
  private readonly _isAndroidNative =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  private readonly _isNative = Capacitor.isNativePlatform();
  private _focusedTextControl: HTMLElement | null = null;

  init(): void {
    if (this._initialized) return;
    this._initialized = true;

    if (typeof window === "undefined") return;

    this.debug("init", {
      platform: Capacitor.getPlatform(),
      isNative: this._isNative,
      isAndroidNative: this._isAndroidNative,
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height ?? null,
    });

    if (Capacitor.isNativePlatform()) {
      this.initNativeFocusScrolling();
      this.initNative();
    } else {
      this.initWeb();
    }
  }

  private async initNative() {
    const { Keyboard } = await import("@capacitor/keyboard");

    Keyboard.addListener("keyboardWillShow", (info) => {
      this.debug("keyboardWillShow", this.keyboardDebugPayload(info.keyboardHeight));
      this._zone.run(() => this.setHeight(info.keyboardHeight));
    });
    Keyboard.addListener("keyboardDidShow", (info) => {
      this.debug("keyboardDidShow", this.keyboardDebugPayload(info.keyboardHeight));
      this._zone.run(() => this.setHeight(info.keyboardHeight));
    });
    Keyboard.addListener("keyboardWillHide", () => {
      this.debug("keyboardWillHide", this.keyboardDebugPayload(0));
      this._zone.run(() => this.setHeight(0));
    });
    Keyboard.addListener("keyboardDidHide", () => {
      this.debug("keyboardDidHide", this.keyboardDebugPayload(0));
      this._zone.run(() => this.setHeight(0));
    });
  }

  private initNativeFocusScrolling() {
    if (typeof document === "undefined") return;

    document.addEventListener(
      "focusin",
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !this.isTextControl(target)) {
          return;
        }

        this._focusedTextControl = target;
        this.debug("focusin text control", {
          target: this.describeElement(target),
          targetRect: this.describeRect(target.getBoundingClientRect()),
          scrollParent: this.describeScrollParent(this.findScrollParent(target)),
          keyboardHeight: this.keyboardHeight(),
        });
        setTimeout(() => this.scrollFocusedControlIntoView(), 350);
      },
      true
    );

    document.addEventListener(
      "focusout",
      (event) => {
        if (event.target === this._focusedTextControl) {
          this.debug("focusout text control", {
            target: this.describeElement(this._focusedTextControl),
          });
          this._focusedTextControl = null;
        }
      },
      true
    );
  }

  private initWeb() {
    const vv = window.visualViewport;
    if (!vv) return;

    let baseHeight = window.innerHeight;
    let resizeRaf = 0;

    const update = () => {
      // Estimate keyboard height as the gap between layout viewport and visual viewport.
      // visualViewport.height shrinks when a soft keyboard appears on mobile browsers.
      const gap = Math.max(0, baseHeight - vv.height - vv.offsetTop);
      // Ignore tiny gaps (URL bar collapses, address bar transitions, etc.).
      const height = gap > 80 ? Math.round(gap) : 0;
      this.debug("web visualViewport update", {
        baseHeight,
        visualViewportHeight: vv.height,
        visualViewportOffsetTop: vv.offsetTop,
        gap,
        height,
      });
      this.setHeight(height);
    };

    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(update);
    };

    // Recapture base height on orientation changes — innerHeight is the
    // stable reference for "viewport without keyboard".
    window.addEventListener("orientationchange", () => {
      // Wait a tick for the layout to settle before re-baselining.
      setTimeout(() => {
        baseHeight = window.innerHeight;
        update();
      }, 250);
    });

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
  }

  private setHeight(height: number) {
    const clamped = Math.max(0, Math.round(height));
    const previous = this.keyboardHeight();
    if (clamped === previous) {
      this.debug("setHeight skipped unchanged", {
        height,
        clamped,
        previous,
      });
      return;
    }

    // Apply the CSS var and class FIRST so that any effect/observer reacting
    // to keyboardHeight() sees a DOM that already reflects the new height.
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "--keyboard-offset",
        `${clamped}px`
      );
      document.documentElement.classList.toggle("keyboard-open", clamped > 0);
    }

    this.keyboardHeight.set(clamped);
    this.debug("setHeight applied", {
      requested: height,
      clamped,
      previous,
      cssKeyboardOffset:
        typeof document !== "undefined"
          ? getComputedStyle(document.documentElement).getPropertyValue(
              "--keyboard-offset"
            )
          : null,
      keyboardOpenClass:
        typeof document !== "undefined"
          ? document.documentElement.classList.contains("keyboard-open")
          : null,
      innerHeight: typeof window !== "undefined" ? window.innerHeight : null,
      visualViewportHeight:
        typeof window !== "undefined"
          ? window.visualViewport?.height ?? null
          : null,
    });

    // Nudge Angular CDK's ViewportRuler so anchored overlays (mat-select
    // dropdowns, mat-menus) re-measure and reposition above the keyboard.
    // The ruler listens to window resize events; a synthetic one is enough.
    if (!this._isAndroidNative && typeof window !== "undefined") {
      this.debug("dispatch synthetic resize");
      window.dispatchEvent(new Event("resize"));
    }

    if (this._isNative && clamped > 0) {
      setTimeout(() => this.scrollFocusedControlIntoView(), 50);
    }
  }

  private isTextControl(element: HTMLElement): boolean {
    if (element.isContentEditable) return true;
    const tag = element.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  private scrollFocusedControlIntoView() {
    const element = this._focusedTextControl;
    const keyboardHeight = this.keyboardHeight();
    if (!element || !element.isConnected || keyboardHeight <= 0) {
      this.debug("scrollFocusedControlIntoView skipped", {
        hasElement: !!element,
        isConnected: element?.isConnected ?? null,
        keyboardHeight,
      });
      return;
    }

    const scrollParent = this.findScrollParent(element);
    const viewportHeight =
      window.visualViewport?.height ?? window.innerHeight ?? 0;
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const viewportDidNotShrink =
      Math.abs(viewportHeight - window.innerHeight) < 1;
    const visibleBottom =
      this._isNative && viewportDidNotShrink
        ? window.innerHeight - keyboardHeight
        : viewportTop + viewportHeight;
    const safeBottom = Math.max(0, visibleBottom - 24);
    const safeTop = Math.max(0, viewportTop + 24);
    const rect = element.getBoundingClientRect();

    let delta = 0;
    if (rect.bottom > safeBottom) {
      delta = rect.bottom - safeBottom;
    } else if (rect.top < safeTop) {
      delta = rect.top - safeTop;
    }

    this.debug("scrollFocusedControlIntoView measured", {
      target: this.describeElement(element),
      targetRect: this.describeRect(rect),
      scrollParent: this.describeScrollParent(scrollParent),
      keyboardHeight,
      viewportHeight,
      viewportTop,
      viewportDidNotShrink,
      visibleBottom,
      safeTop,
      safeBottom,
      delta,
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height ?? null,
      visualViewportOffsetTop: window.visualViewport?.offsetTop ?? null,
    });

    if (Math.abs(delta) < 1) {
      this.debug("scrollFocusedControlIntoView skipped small delta", { delta });
      return;
    }

    scrollParent.scrollBy({
      top: delta,
      behavior: "smooth",
    });

    this.debug("scrollFocusedControlIntoView scrollBy", {
      delta,
      scrollParent: this.describeScrollParent(scrollParent),
    });
  }

  private findScrollParent(element: HTMLElement): HTMLElement | Window {
    let current: HTMLElement | null = element.parentElement;

    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      const overflowY = style.overflowY;
      const canScroll =
        (overflowY === "auto" || overflowY === "scroll") &&
        current.scrollHeight > current.clientHeight;

      if (canScroll) return current;
      current = current.parentElement;
    }

    return window;
  }

  private keyboardDebugPayload(height: number): Record<string, unknown> {
    return {
      keyboardHeight: height,
      currentKeyboardHeight: this.keyboardHeight(),
      focusedTextControl: this.describeElement(this._focusedTextControl),
      innerHeight: typeof window !== "undefined" ? window.innerHeight : null,
      visualViewportHeight:
        typeof window !== "undefined"
          ? window.visualViewport?.height ?? null
          : null,
      visualViewportOffsetTop:
        typeof window !== "undefined"
          ? window.visualViewport?.offsetTop ?? null
          : null,
    };
  }

  private describeElement(element: HTMLElement | null): Record<string, unknown> | null {
    if (!element) return null;
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
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
    };
  }

  private describeScrollParent(
    scrollParent: HTMLElement | Window
  ): Record<string, unknown> {
    if (this.isWindow(scrollParent)) {
      return {
        type: "window",
        scrollY: scrollParent.scrollY,
        innerHeight: scrollParent.innerHeight,
      };
    }

    return {
      type: "element",
      element: this.describeElement(scrollParent),
      scrollTop: scrollParent.scrollTop,
      clientHeight: scrollParent.clientHeight,
      scrollHeight: scrollParent.scrollHeight,
      overflowY: getComputedStyle(scrollParent).overflowY,
    };
  }

  private isWindow(value: HTMLElement | Window): value is Window {
    return value === window;
  }

  private debug(message: string, payload?: Record<string, unknown>) {
    console.debug(`[KeyboardService] ${message}`, payload ?? {});
  }
}
