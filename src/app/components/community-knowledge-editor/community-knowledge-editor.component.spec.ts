import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocaleMap } from "../../../db/models/Interfaces";
import { CommunityKnowledgeEditorComponent } from "./community-knowledge-editor.component";

const localeMap = (text: string): LocaleMap => ({
  en: {
    text,
    provider: "manual",
  },
});

describe("CommunityKnowledgeEditorComponent", () => {
  let fixture: ComponentFixture<CommunityKnowledgeEditorComponent>;
  let component: CommunityKnowledgeEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommunityKnowledgeEditorComponent],
    })
      .overrideComponent(CommunityKnowledgeEditorComponent, {
        set: { template: "" },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CommunityKnowledgeEditorComponent);
    component = fixture.componentInstance;
  });

  it("starts contributors with one focused card instead of an empty state", () => {
    component.ngOnInit();

    expect(component.cardGroups()).toHaveLength(1);
  });

  it("emits public URL CTAs with their URL and visibility", () => {
    const save = vi.fn();
    component.save.subscribe(save);
    component.addCard();
    const card = component.cardGroups()[0];
    component.updateLocaleMap(0, "title", localeMap("Member trainings"));
    component.updateLocaleMap(0, "ctaLabel", localeMap("Open schedule"));
    card.controls.category.setValue("classes");
    card.controls.ctaTarget.setValue("url");
    card.controls.ctaVisibility.setValue("public");
    card.controls.ctaUrl.setValue(" https://example.com/trainings ");

    component.onSubmit();

    expect(component.validationMessage()).toBeNull();
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        title: { en: "Member trainings" },
        category: "classes",
        cta: {
          label: { en: "Open schedule" },
          target: "url",
          url: "https://example.com/trainings",
        },
        ctaVisibility: "public",
        visibility: "public",
      }),
    ]);
  });

  it("keeps a URL CTA when the custom label is missing", () => {
    const save = vi.fn();
    component.save.subscribe(save);
    component.addCard();
    const card = component.cardGroups()[0];
    component.updateLocaleMap(0, "title", localeMap("Member trainings"));
    card.controls.category.setValue("classes");
    card.controls.ctaTarget.setValue("url");
    card.controls.ctaVisibility.setValue("public");
    card.controls.ctaUrl.setValue("https://example.com/trainings");

    component.onSubmit();

    expect(component.validationMessage()).toBeNull();
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        cta: {
          label: { en: "Open link" },
          target: "url",
          url: "https://example.com/trainings",
        },
        ctaVisibility: "public",
      }),
    ]);
  });

  it.each([
    ["spot", "ctaSpotId", "central-park", "View spot"],
    ["event", "ctaEventId", "summer-jam", "View event"],
  ] as const)(
    "emits a selected %s destination without exposing its raw id field",
    (target, controlName, id, defaultLabel) => {
      const save = vi.fn();
      component.save.subscribe(save);
      component.addCard();
      const card = component.cardGroups()[0];
      component.updateLocaleMap(0, "title", localeMap("Useful destination"));
      card.controls.ctaTarget.setValue(target);

      component.updateDestination(card, target, id);
      component.onSubmit();

      expect(card.controls[controlName].value).toBe(id);
      expect(save).toHaveBeenCalledWith([
        expect.objectContaining({
          cta: {
            label: { en: defaultLabel },
            target,
            [target === "spot" ? "spotId" : "eventId"]: id,
          },
        }),
      ]);
    },
  );
});
