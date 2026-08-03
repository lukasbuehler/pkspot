import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostAttributeToken,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";

export interface FabMenuAction {
  id: string;
  icon: string;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export type FabMenuAlignment = "start" | "end";
export type FabMenuColorSet = "primary" | "secondary" | "tertiary";

const DEFAULT_CLOSE_LABEL = $localize`:@@fab_menu.close:Close menu`;

@Component({
  selector: "app-fab-menu",
  imports: [MatButtonModule, MatIcon, MatTooltip],
  templateUrl: "./fab-menu.component.html",
  styleUrl: "./fab-menu.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "(document:click)": "onDocumentClick($event.target)",
    "(document:keydown.escape)": "onEscape()",
  },
})
export class FabMenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly hostId =
    inject(new HostAttributeToken("id"), { optional: true }) ?? "fabMenu";
  private readonly launcher = viewChild("launcher", {
    read: ElementRef<HTMLButtonElement>,
  });

  readonly actions = input.required<readonly FabMenuAction[]>();
  readonly launcherLabel = input.required<string>();
  readonly launcherIcon = input("add");
  readonly closeLabel = input(DEFAULT_CLOSE_LABEL);
  readonly alignment = input<FabMenuAlignment>("end");
  readonly colorSet = input<FabMenuColorSet>("primary");

  readonly actionSelected = output<string>();

  readonly isOpen = signal(false);
  readonly menuId = `${this.hostId}Actions`;
  readonly isMenu = computed(() => this.actions().length >= 2);
  readonly directAction = computed(() =>
    this.actions().length === 1 ? this.actions()[0] : undefined,
  );

  toggle(): void {
    if (!this.isMenu()) return;
    this.isOpen.update((open) => !open);
  }

  close(): void {
    this.isOpen.set(false);
  }

  selectAction(action: FabMenuAction): void {
    if (action.disabled) return;
    this.close();
    this.actionSelected.emit(action.id);
  }

  onLauncherClick(): void {
    const directAction = this.directAction();
    if (directAction) {
      this.selectAction(directAction);
      return;
    }
    this.toggle();
  }

  onDocumentClick(target: EventTarget | null): void {
    if (
      !this.isOpen() ||
      !(target instanceof Node) ||
      this.host.nativeElement.contains(target)
    ) {
      return;
    }
    this.close();
  }

  onEscape(): void {
    if (!this.isOpen()) return;
    this.close();
    this.launcher()?.nativeElement.focus();
  }
}
