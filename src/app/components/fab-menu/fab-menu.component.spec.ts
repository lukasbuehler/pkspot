import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FabMenuAction,
  FabMenuComponent,
} from "./fab-menu.component";

const actions: readonly FabMenuAction[] = [
  { id: "event", icon: "calendar_add_on", label: "Create event" },
  { id: "session", icon: "event_upcoming", label: "Plan session" },
];

describe("FabMenuComponent", () => {
  let fixture: ComponentFixture<FabMenuComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(FabMenuComponent);
    fixture.componentRef.setInput("actions", actions);
    fixture.componentRef.setInput("launcherLabel", "Create");
  });

  it("renders nothing when no actions are available", async () => {
    fixture.componentRef.setInput("actions", []);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("button")).toBeNull();
  });

  it("invokes a single action directly without opening a menu", async () => {
    const selected = vi.fn();
    fixture.componentInstance.actionSelected.subscribe(selected);
    fixture.componentRef.setInput("actions", [actions[1]]);
    await fixture.whenStable();

    const launcher = fixture.nativeElement.querySelector(
      ".fab-menu__launcher",
    ) as HTMLButtonElement;
    launcher.click();
    await fixture.whenStable();

    expect(selected).toHaveBeenCalledWith("session");
    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(launcher.getAttribute("aria-expanded")).toBeNull();
    expect(launcher.getAttribute("aria-label")).toBe("Plan session");
  });

  it("opens multiple actions with stable IDs and closes after selection", async () => {
    const selected = vi.fn();
    fixture.componentInstance.actionSelected.subscribe(selected);
    await fixture.whenStable();

    const launcher = fixture.nativeElement.querySelector(
      ".fab-menu__launcher",
    ) as HTMLButtonElement;
    launcher.click();
    await fixture.whenStable();

    const menu = fixture.nativeElement.querySelector(
      ".fab-menu__actions",
    ) as HTMLElement;
    const menuActions = [
      ...fixture.nativeElement.querySelectorAll(".fab-menu__action"),
    ] as HTMLButtonElement[];

    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(launcher.getAttribute("aria-controls")).toBe(menu.id);
    expect(menu.getAttribute("role")).toBe("group");
    expect(
      menuActions.map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Create event", "Plan session"]);
    expect(
      menuActions.map((button) => button.style.animationDelay),
    ).toEqual(["45ms", "0ms"]);

    menuActions[1].click();
    await fixture.whenStable();

    expect(selected).toHaveBeenCalledWith("session");
    expect(fixture.componentInstance.isOpen()).toBe(false);
  });

  it("does not dispatch disabled actions", async () => {
    const selected = vi.fn();
    fixture.componentInstance.actionSelected.subscribe(selected);
    fixture.componentRef.setInput("actions", [
      { ...actions[0], disabled: true },
      actions[1],
    ]);
    fixture.componentInstance.isOpen.set(true);
    await fixture.whenStable();

    const disabled = fixture.nativeElement.querySelector(
      ".fab-menu__action",
    ) as HTMLButtonElement;
    disabled.click();

    expect(disabled.disabled).toBe(true);
    expect(selected).not.toHaveBeenCalled();
  });

  it("closes on outside click and Escape while retaining launcher focus", async () => {
    await fixture.whenStable();
    const launcher = fixture.nativeElement.querySelector(
      ".fab-menu__launcher",
    ) as HTMLButtonElement;

    launcher.click();
    await fixture.whenStable();
    document.body.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.isOpen()).toBe(false);

    launcher.click();
    await fixture.whenStable();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await fixture.whenStable();

    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(document.activeElement).toBe(launcher);
  });
});
