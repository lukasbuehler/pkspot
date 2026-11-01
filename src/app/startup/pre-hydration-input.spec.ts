import { afterEach, describe, expect, it, vi } from "vitest";
import { capturePreHydrationInput, restorePreHydrationInput } from "./pre-hydration-input";

function field(html: string): HTMLInputElement {
  document.body.insertAdjacentHTML("beforeend", html);
  return document.body.lastElementChild as HTMLInputElement;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("pre-hydration input", () => {
  afterEach(() => {
    restorePreHydrationInput();
    document.body.innerHTML = "";
  });

  it("restores text wiped by hydration and notifies the form control", () => {
    const email = field('<input type="email">');
    capturePreHydrationInput();
    type(email, "athlete@example.com");
    email.value = "";
    const onInput = vi.fn();
    email.addEventListener("input", onInput);

    restorePreHydrationInput();

    expect(email.value).toBe("athlete@example.com");
    expect(onInput).toHaveBeenCalledOnce();
  });

  it("keeps text entered before the entry point ran, but not server defaults", () => {
    const typed = field('<input type="text">');
    const prefilled = field('<input type="text" value="From the server">');
    typed.value = "typed early";
    capturePreHydrationInput();
    typed.value = "";
    prefilled.value = "";

    restorePreHydrationInput();

    expect(typed.value).toBe("typed early");
    expect(prefilled.value).toBe("");
  });

  it("leaves unchanged, replaced and non-text fields alone", () => {
    const unchanged = field('<input type="text">');
    const removed = field('<input type="text">');
    const checkbox = field('<input type="checkbox" value="on">');
    capturePreHydrationInput();
    type(unchanged, "same");
    type(removed, "gone");
    checkbox.dispatchEvent(new Event("input", { bubbles: true }));
    removed.remove();
    const onInput = vi.fn();
    unchanged.addEventListener("input", onInput);
    checkbox.addEventListener("input", onInput);

    restorePreHydrationInput();

    expect(onInput).not.toHaveBeenCalled();
    expect(removed.value).toBe("gone");
  });

  it("stops listening once restored", () => {
    const input = field('<input type="text">');
    capturePreHydrationInput();
    restorePreHydrationInput();
    type(input, "after hydration");
    input.value = "changed by the app";

    restorePreHydrationInput();

    expect(input.value).toBe("changed by the app");
  });
});
