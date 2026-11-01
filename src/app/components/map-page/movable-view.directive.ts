import {
  Directive,
  ElementRef,
  EmbeddedViewRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  Renderer2,
  TemplateRef,
  ViewContainerRef,
  inject,
  input,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";

/**
 * Creates one embedded view of a template and keeps it alive for as long as
 * this directive exists, so `MovableViewOutletDirective`s can show it in
 * whichever host is currently rendered.
 *
 * The map page uses this to keep one set of panel components (and their
 * loaded data, inputs and subscriptions) while the panel host switches
 * between the side drawer and the bottom sheet. Place it before any outlet in
 * the template and inside a hidden element: that element is where the nodes
 * wait while no outlet shows them.
 *
 * Browser only: on the server nothing is created, and callers render the
 * template in place so hydration sees the template's own DOM structure.
 */
@Directive({
  selector: "[appMovableViewHost]",
  exportAs: "movableViewHost",
})
export class MovableViewHostDirective implements OnInit {
  readonly template = input.required<TemplateRef<unknown>>({
    alias: "appMovableViewHost",
  });

  private readonly _viewContainer = inject(ViewContainerRef);
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _view = signal<EmbeddedViewRef<unknown> | null>(null);
  /** The shared view; null on the server. */
  readonly view = this._view.asReadonly();

  ngOnInit(): void {
    if (!this._isBrowser) return;
    this._view.set(this._viewContainer.createEmbeddedView(this.template()));
  }

  /** The element that holds the view's nodes while no outlet shows them. */
  get home(): HTMLElement | null {
    const anchor = this._viewContainer.element.nativeElement as Node;
    return anchor.parentElement;
  }
}

/**
 * Shows the view of a `MovableViewHostDirective` by moving its DOM nodes into
 * this element, and returns them to the host's home when the outlet goes
 * away.
 *
 * Unlike `ngTemplateOutlet`, the view is never recreated: Angular keeps owning
 * and checking it from the container that created it, and inserts later child
 * views next to their anchors wherever those anchors currently are.
 */
@Directive({
  selector: "[appMovableViewOutlet]",
})
export class MovableViewOutletDirective implements OnInit, OnDestroy {
  readonly source = input.required<MovableViewHostDirective>({
    alias: "appMovableViewOutlet",
  });

  private readonly _element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _renderer = inject(Renderer2);
  private _shownView: EmbeddedViewRef<unknown> | null = null;

  ngOnInit(): void {
    const view = this.source().view();
    if (!view || view.destroyed) return;

    moveViewNodes(this._renderer, view, this._element.nativeElement);
    this._shownView = view;
  }

  ngOnDestroy(): void {
    const view = this._shownView;
    const home = this.source().home;
    this._shownView = null;
    if (!view || view.destroyed || !home) return;
    // A replacement outlet may already have taken the nodes when it was
    // created before this one was destroyed in the same render.
    if (!viewIsShownIn(view, this._element.nativeElement)) return;

    moveViewNodes(this._renderer, view, home);
  }
}

/**
 * Appends every current root node of `view` (including the anchors and nodes
 * of nested control-flow views) to `parent`, keeping their order.
 */
export function moveViewNodes(
  renderer: Renderer2,
  view: EmbeddedViewRef<unknown>,
  parent: Node,
): void {
  for (const node of view.rootNodes as Node[]) {
    renderer.appendChild(parent, node);
  }
}

/** Whether the view's nodes currently sit directly in `parent`. */
export function viewIsShownIn(
  view: EmbeddedViewRef<unknown>,
  parent: Node,
): boolean {
  const [firstNode] = view.rootNodes as Node[];
  return firstNode?.parentNode === parent;
}
