type TextField = HTMLInputElement | HTMLTextAreaElement;

const NON_TEXT_INPUT_TYPES = new Set([
  "button", "checkbox", "file", "hidden", "image", "radio", "range", "reset", "submit",
]);

const entered = new Map<TextField, string>();
let stopRecording: (() => void) | undefined;

function record(target: EventTarget | null): void {
  const isText = target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(target.type));
  if (isText) entered.set(target as TextField, (target as TextField).value);
}

/**
 * Server-rendered forms are usable before the app starts, but hydrating a form
 * control writes its empty model value over whatever the visitor typed or
 * autofilled. Remember that text from the first moment the entry point runs.
 */
export function capturePreHydrationInput(doc: Document = document): void {
  if (stopRecording) return;
  doc.querySelectorAll<TextField>("input, textarea").forEach((field) => {
    if (field.value !== field.defaultValue) record(field);
  });
  const onInput = (event: Event) => record(event.target);
  doc.addEventListener("input", onInput, true);
  stopRecording = () => doc.removeEventListener("input", onInput, true);
}

/** Puts wiped text back through an input event so form controls receive it too. */
export function restorePreHydrationInput(): void {
  stopRecording?.();
  stopRecording = undefined;
  for (const [field, value] of entered) {
    if (!field.isConnected || field.value === value) continue;
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  entered.clear();
}
