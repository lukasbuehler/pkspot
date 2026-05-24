import { DOCUMENT } from "@angular/common";
import {
  DestroyRef,
  Directive,
  ElementRef,
  NgZone,
  inject,
  input,
} from "@angular/core";
import { MatAutocompleteTrigger } from "@angular/material/autocomplete";

type AutocompleteKeyboardPosition = "auto" | "preserve";

@Directive({
  selector: "input[matAutocomplete], textarea[matAutocomplete]",
  standalone: true,
  host: {
    "(focus)": "startTracking()",
    "(blur)": "stopTrackingSoon()",
    "(click)": "queuePositionUpdate()",
    "(input)": "queuePositionUpdate()",
  },
})
export class AutocompleteOverlayRepositionDirective {
  readonly keyboardPosition = input<AutocompleteKeyboardPosition>("auto", {
    alias: "appAutocompleteKeyboardPosition",
  });

  private readonly _trigger = inject(MatAutocompleteTrigger);
  private readonly _elementRef =
    inject<ElementRef<HTMLInputElement | HTMLTextAreaElement>>(ElementRef);
  private readonly _document = inject(DOCUMENT);
  private readonly _zone = inject(NgZone);
  private readonly _destroyRef = inject(DestroyRef);

  private _removeListeners: (() => void) | null = null;
  private _animationFrame: number | null = null;
  private _stopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this._destroyRef.onDestroy(() => {
      this.stopTracking();
    });
  }

  startTracking(): void {
    if (this._removeListeners) {
      this.queuePositionUpdate();
      return;
    }

    const windowRef = this._document.defaultView;
    if (!windowRef) return;

    this._zone.runOutsideAngular(() => {
      const options: AddEventListenerOptions = {
        capture: true,
        passive: true,
      };
      const visualViewport = windowRef.visualViewport;

      this._document.addEventListener("scroll", this._onScroll, options);
      windowRef.addEventListener("resize", this._onScroll, options);
      windowRef.addEventListener("orientationchange", this._onScroll, options);
      visualViewport?.addEventListener("resize", this._onScroll, options);
      visualViewport?.addEventListener("scroll", this._onScroll, options);

      this._removeListeners = () => {
        this._document.removeEventListener("scroll", this._onScroll, true);
        windowRef.removeEventListener("resize", this._onScroll, true);
        windowRef.removeEventListener("orientationchange", this._onScroll, true);
        visualViewport?.removeEventListener("resize", this._onScroll, true);
        visualViewport?.removeEventListener("scroll", this._onScroll, true);
      };
    });

    this.queuePositionUpdate();
  }

  stopTrackingSoon(): void {
    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
    }

    this._stopTimer = setTimeout(() => {
      if (!this._trigger.panelOpen) {
        this.stopTracking();
      }
    }, 250);
  }

  queuePositionUpdate(): void {
    if (this._animationFrame !== null) return;

    const windowRef = this._document.defaultView;
    if (!windowRef) return;

    this._animationFrame = windowRef.requestAnimationFrame(() => {
      this._animationFrame = null;
      if (this._trigger.panelOpen) {
        this.resetKeyboardAwarePosition();
        this._trigger.updatePosition();
        this.applyKeyboardAwarePosition();
      }
    });
  }

  private stopTracking(): void {
    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
      this._stopTimer = null;
    }

    if (this._animationFrame !== null) {
      this._document.defaultView?.cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }

    this._removeListeners?.();
    this._removeListeners = null;
    this.resetKeyboardAwarePosition();
  }

  private readonly _onScroll = (): void => {
    this.queuePositionUpdate();
  };

  private applyKeyboardAwarePosition(): void {
    if (this.keyboardPosition() === "preserve") {
      this.resetKeyboardAwarePosition();
      return;
    }

    const windowRef = this._document.defaultView;
    const panel = this._trigger.autocomplete?.panel?.nativeElement as
      | HTMLElement
      | undefined;
    const pane = panel?.closest<HTMLElement>(".cdk-overlay-pane");
    if (!windowRef || !panel || !pane) return;

    const keyboardOffset = this.readKeyboardOffset();
    if (keyboardOffset <= 0) {
      this.resetKeyboardAwarePosition(pane);
      return;
    }

    this.resetKeyboardAwarePosition(pane);

    const keyboardGap = 8;
    const panelRect = panel.getBoundingClientRect();
    const originRect = this.readOriginRect();
    const paneRect = pane.getBoundingClientRect();
    const visualViewport = windowRef.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportHeight = visualViewport?.height ?? windowRef.innerHeight;
    const viewportBottom = viewportTop + viewportHeight;
    const keyboardSafeBottom = Math.min(
      viewportBottom,
      windowRef.innerHeight - keyboardOffset
    );
    const overlapsKeyboard = panelRect.bottom > keyboardSafeBottom - keyboardGap;
    const targetBottom = originRect.top - keyboardGap;
    const fitsAbove = targetBottom - panelRect.height >= viewportTop;

    if (!overlapsKeyboard || !fitsAbove) return;

    const offset = Math.max(0, Math.round(paneRect.bottom - targetBottom));
    pane.style.translate = `0 -${offset}px`;
    pane.classList.add("keyboard-autocomplete-panel-above");
  }

  private resetKeyboardAwarePosition(pane?: HTMLElement): void {
    const targetPane =
      pane ??
      (
        this._trigger.autocomplete?.panel?.nativeElement as
          | HTMLElement
          | undefined
      )?.closest<HTMLElement>(".cdk-overlay-pane");
    if (!targetPane) return;

    targetPane.style.translate = "";
    targetPane.classList.remove("keyboard-autocomplete-panel-above");
  }

  private readKeyboardOffset(): number {
    const raw = getComputedStyle(this._document.documentElement)
      .getPropertyValue("--keyboard-offset")
      .trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private readOriginRect(): DOMRect {
    const connectedTo = this._trigger.connectedTo;
    if (connectedTo) {
      return connectedTo.elementRef.nativeElement.getBoundingClientRect();
    }

    return (
      this._elementRef.nativeElement.closest("mat-form-field") ??
      this._elementRef.nativeElement
    ).getBoundingClientRect();
  }
}
