import {
  Directive,
  ElementRef,
  EmbeddedViewRef,
  Injector,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  Renderer2,
  TemplateRef,
  ViewContainerRef,
  afterNextRender,
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
 * The server renders the view here too. Hydration then claims that markup in
 * place, which requires the home element to contain only this host, and any
 * outlet takes the nodes once the first render has finished.
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
  private readonly _injector = inject(Injector);
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _view = signal<EmbeddedViewRef<unknown> | null>(null);
  /** The shared view. */
  readonly view = this._view.asReadonly();
  /**
   * True until the first render of a view that claims server markup. Moving
   * earlier would strand nested views that hydration has not reached yet.
   */
  hydrating = false;

  ngOnInit(): void {
    this.hydrating = this._isBrowser && (this.home?.childElementCount ?? 0) > 0;
    this._view.set(this._viewContainer.createEmbeddedView(this.template()));
    if (this.hydrating) {
      afterNextRender(() => (this.hydrating = false), {
        injector: this._injector,
      });
    }
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
  private readonly _injector = inject(Injector);
  private _shownView: EmbeddedViewRef<unknown> | null = null;

  ngOnInit(): void {
    if (this.source().hydrating) {
      afterNextRender(() => this._show(), { injector: this._injector });
    } else {
      this._show();
    }
  }

  private _show(): void {
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
 * of nested control-flow views) to `parent`, keeping their order and the focus
 * of an element inside them, such as a search field typed into before hydration.
 */
export function moveViewNodes(
  renderer: Renderer2,
  view: EmbeddedViewRef<unknown>,
  parent: Node,
): void {
  const nodes = view.rootNodes as Node[];
  const focused = parent.ownerDocument?.activeElement;
  const keepFocus =
    focused instanceof HTMLElement &&
    nodes.some((node) => node.contains(focused));
  for (const node of nodes) {
    renderer.appendChild(parent, node);
  }
  if (keepFocus) focused.focus({ preventScroll: true });
}

/** Whether the view's nodes currently sit directly in `parent`. */
export function viewIsShownIn(
  view: EmbeddedViewRef<unknown>,
  parent: Node,
): boolean {
  const [firstNode] = view.rootNodes as Node[];
  return firstNode?.parentNode === parent;
}
