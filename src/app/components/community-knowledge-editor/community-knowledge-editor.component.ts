import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  effect,
  input,
  output,
  signal,
} from "@angular/core";
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatSelectModule } from "@angular/material/select";
import { MatTooltipModule } from "@angular/material/tooltip";
import type { LocaleMap } from "../../../db/models/Interfaces";
import type {
  CommunityInfoCardCategory,
  CommunityInfoCardCta,
  CommunityInfoCardDisclosure,
  CommunityInfoCardSchema,
  CommunityLocalizedTextSchema,
} from "../../../db/schemas/CommunityPageSchema";
import { communityInfoCardCategoryIcon } from "../../../scripts/CommunityInfoCardHelpers";
import { makeLocaleMapFromObject } from "../../../scripts/LanguageHelpers";
import { LocaleMapEditFieldComponent } from "../locale-map-edit-field/locale-map-edit-field.component";

type CommunityInfoCardVisibility = NonNullable<
  CommunityInfoCardSchema["visibility"]
>;
type CommunityInfoCardCtaTarget = CommunityInfoCardCta["target"] | "none";

interface CommunityKnowledgeCardControls {
  id: FormControl<string>;
  category: FormControl<CommunityInfoCardCategory>;
  visibility: FormControl<CommunityInfoCardVisibility>;
  commercialDisclosure: FormControl<CommunityInfoCardDisclosure>;
  ctaTarget: FormControl<CommunityInfoCardCtaTarget>;
  ctaUrl: FormControl<string>;
  ctaSpotId: FormControl<string>;
  ctaEventId: FormControl<string>;
}

type CommunityKnowledgeCardForm = FormGroup<CommunityKnowledgeCardControls>;
type CommunityKnowledgeLocaleField = "title" | "body" | "ctaLabel";

interface CommunityKnowledgeLocaleModel {
  title: WritableSignal<LocaleMap | undefined | null>;
  body: WritableSignal<LocaleMap | undefined | null>;
  ctaLabel: WritableSignal<LocaleMap | undefined | null>;
}

@Component({
  selector: "app-community-knowledge-editor",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    LocaleMapEditFieldComponent,
  ],
  templateUrl: "./community-knowledge-editor.component.html",
  styleUrl: "./community-knowledge-editor.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityKnowledgeEditorComponent {
  readonly cards = input<CommunityInfoCardSchema[]>([]);
  readonly saving = input(false);

  readonly save = output<CommunityInfoCardSchema[]>();
  readonly cancel = output<void>();

  readonly categories: CommunityInfoCardCategory[] = [
    "jams",
    "chat",
    "classes",
    "safety",
    "spots",
    "events",
    "other",
  ];
  readonly disclosures: CommunityInfoCardDisclosure[] = [
    "none",
    "classes",
    "paid-partnership",
    "shop",
  ];
  readonly ctaTargets: CommunityInfoCardCtaTarget[] = [
    "none",
    "url",
    "spot",
    "event",
  ];

  readonly validationMessage = signal<string | null>(null);

  readonly form = new FormGroup({
    cards: new FormArray<CommunityKnowledgeCardForm>([]),
  });
  readonly localeModels = signal<CommunityKnowledgeLocaleModel[]>([]);

  private _lastCards = this.cards();

  constructor() {
    this._resetForm(this.cards());
    effect(() => {
      const currentCards = this.cards();
      if (currentCards !== this._lastCards && !this.form.dirty) {
        this._resetForm(currentCards);
      }
    });
  }

  cardGroups(): CommunityKnowledgeCardForm[] {
    return this.form.controls.cards.controls;
  }

  ctaTarget(card: CommunityKnowledgeCardForm): CommunityInfoCardCtaTarget {
    return card.controls.ctaTarget.value;
  }

  categoryIcon(category: CommunityInfoCardCategory): string {
    return communityInfoCardCategoryIcon(category);
  }

  addCard(): void {
    this.form.controls.cards.push(
      this._createCardForm({
        id: `knowledge-${Date.now()}`,
        title: { en: "" },
        category: "other",
        visibility: "public",
      }),
    );
    this.localeModels.update((models) => [
      ...models,
      this._createLocaleModel({ title: { en: "" } }),
    ]);
    this.form.markAsDirty();
  }

  removeCard(index: number): void {
    this.form.controls.cards.removeAt(index);
    this.localeModels.update((models) =>
      models.filter((_, modelIndex) => modelIndex !== index),
    );
    this.form.markAsDirty();
  }

  moveCard(index: number, direction: -1 | 1): void {
    const nextIndex = index + direction;
    const cards = this.form.controls.cards;
    if (nextIndex < 0 || nextIndex >= cards.length) {
      return;
    }

    const group = cards.at(index);
    cards.removeAt(index);
    cards.insert(nextIndex, group);
    this.localeModels.update((models) => {
      const nextModels = [...models];
      const [model] = nextModels.splice(index, 1);
      nextModels.splice(nextIndex, 0, model);
      return nextModels;
    });
    this.form.markAsDirty();
  }

  updateLocaleMap(
    index: number,
    field: CommunityKnowledgeLocaleField,
    value: LocaleMap | undefined | null,
  ): void {
    this.localeModels()[index]?.[field].set(value);
    this.form.markAsDirty();
  }

  onSubmit(): void {
    const cards = this.form.controls.cards.controls.map((group, index) =>
      this._formToCard(group, index),
    );

    const invalidCard = cards.find(
      (card) => Object.keys(card.title).length === 0,
    );
    if (invalidCard) {
      this.validationMessage.set("Every card needs at least one title.");
      return;
    }

    this.validationMessage.set(null);
    this.save.emit(cards);
  }

  private _resetForm(cards: CommunityInfoCardSchema[]): void {
    const formArray = this.form.controls.cards;
    formArray.clear();
    cards.forEach((card) => formArray.push(this._createCardForm(card)));
    this.localeModels.set(cards.map((card) => this._createLocaleModel(card)));
    this._lastCards = cards;
    this.validationMessage.set(null);
    this.form.markAsPristine();
  }

  private _createCardForm(
    card: CommunityInfoCardSchema,
  ): CommunityKnowledgeCardForm {
    const cta = card.cta;
    return new FormGroup({
      id: new FormControl(card.id, { nonNullable: true }),
      category: new FormControl(card.category ?? "other", { nonNullable: true }),
      visibility: new FormControl(card.visibility ?? "public", {
        nonNullable: true,
      }),
      commercialDisclosure: new FormControl(card.commercialDisclosure ?? "none", {
        nonNullable: true,
      }),
      ctaTarget: new FormControl(cta?.target ?? "none", { nonNullable: true }),
      ctaUrl: new FormControl(cta?.target === "url" ? cta.url : "", {
        nonNullable: true,
      }),
      ctaSpotId: new FormControl(cta?.target === "spot" ? cta.spotId : "", {
        nonNullable: true,
      }),
      ctaEventId: new FormControl(cta?.target === "event" ? cta.eventId : "", {
        nonNullable: true,
      }),
    });
  }

  private _createLocaleModel(
    card: Partial<CommunityInfoCardSchema>,
  ): CommunityKnowledgeLocaleModel {
    return {
      title: signal(this._toLocaleMap(card.title)),
      body: signal(this._toLocaleMap(card.body)),
      ctaLabel: signal(this._toLocaleMap(card.cta?.label)),
    };
  }

  private _formToCard(
    group: CommunityKnowledgeCardForm,
    index: number,
  ): CommunityInfoCardSchema {
    const cta = this._formToCta(group, index);
    const localeModel = this.localeModels()[index];
    const title = this._localeMapToRecord(localeModel?.title());
    const body = this._localeMapToRecord(localeModel?.body());

    return {
      id: group.controls.id.value.trim() || `knowledge-${index + 1}`,
      title,
      ...(Object.keys(body).length > 0 ? { body } : {}),
      category: group.controls.category.value,
      ...(cta ? { cta } : {}),
      commercialDisclosure: group.controls.commercialDisclosure.value,
      priority: index,
      visibility: group.controls.visibility.value,
    };
  }

  private _formToCta(
    group: CommunityKnowledgeCardForm,
    index: number,
  ): CommunityInfoCardCta | undefined {
    const label = this._localeMapToRecord(this.localeModels()[index]?.ctaLabel());
    if (Object.keys(label).length === 0) {
      return undefined;
    }

    switch (group.controls.ctaTarget.value) {
      case "spot": {
        const spotId = group.controls.ctaSpotId.value.trim();
        return spotId ? { label, target: "spot", spotId } : undefined;
      }
      case "event": {
        const eventId = group.controls.ctaEventId.value.trim();
        return eventId ? { label, target: "event", eventId } : undefined;
      }
      case "url": {
        const url = group.controls.ctaUrl.value.trim();
        return url ? { label, target: "url", url } : undefined;
      }
      default:
        return undefined;
    }
  }

  private _toLocaleMap(
    value: CommunityLocalizedTextSchema | null | undefined,
  ): LocaleMap {
    return value
      ? makeLocaleMapFromObject(value as Record<string, string> | LocaleMap)
      : {};
  }

  private _localeMapToRecord(
    localeMap: LocaleMap | null | undefined,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(localeMap ?? {})
        .map(([locale, value]) => [locale, value?.text.trim() ?? ""] as const)
        .filter(([, text]) => text.length > 0),
    );
  }
}
