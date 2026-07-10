import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  OnInit,
  WritableSignal,
  effect,
  inject,
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
import type { LocaleCode, LocaleMap } from "../../../db/models/Interfaces";
import type {
  CommunityInfoCardCategory,
  CommunityInfoCardCta,
  CommunityInfoCardDisclosure,
  CommunityInfoCardSchema,
  CommunityLocalizedTextSchema,
} from "../../../db/schemas/CommunityPageSchema";
import { communityInfoCardCategoryIcon } from "../../../scripts/CommunityInfoCardHelpers";
import { makeLocaleMapFromObject } from "../../../scripts/LanguageHelpers";
import { EntityReferenceAutocompleteComponent } from "../entity-reference-autocomplete/entity-reference-autocomplete.component";
import { LocaleMapEditFieldComponent } from "../locale-map-edit-field/locale-map-edit-field.component";

type CommunityInfoCardVisibility = NonNullable<
  CommunityInfoCardSchema["visibility"]
>;
type CommunityInfoCardCtaVisibility = NonNullable<
  CommunityInfoCardSchema["ctaVisibility"]
>;
type CommunityInfoCardCtaTarget = CommunityInfoCardCta["target"] | "none";

interface CommunityKnowledgeCardControls {
  id: FormControl<string>;
  category: FormControl<CommunityInfoCardCategory>;
  visibility: FormControl<CommunityInfoCardVisibility>;
  commercialDisclosure: FormControl<CommunityInfoCardDisclosure>;
  ctaTarget: FormControl<CommunityInfoCardCtaTarget>;
  ctaVisibility: FormControl<CommunityInfoCardCtaVisibility>;
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

interface CommunityKnowledgeChoice<T extends string> {
  value: T;
  label: string;
  description: string;
  icon: string;
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
    EntityReferenceAutocompleteComponent,
    LocaleMapEditFieldComponent,
  ],
  templateUrl: "./community-knowledge-editor.component.html",
  styleUrl: "./community-knowledge-editor.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityKnowledgeEditorComponent implements OnInit {
  private readonly _locale = inject<LocaleCode>(LOCALE_ID);
  private readonly _contentLocale = this._locale.startsWith("en-")
    ? "en"
    : this._locale;

  readonly cards = input<CommunityInfoCardSchema[]>([]);
  readonly saving = input(false);
  readonly publishesImmediately = input(false);

  readonly save = output<CommunityInfoCardSchema[]>();
  readonly cancel = output<void>();

  readonly categoryOptions: CommunityKnowledgeChoice<CommunityInfoCardCategory>[] = [
    {
      value: "jams",
      label: $localize`:@@community.editor_category_jams:Jams & meetups`,
      description: $localize`:@@community.editor_category_jams_description:Open sessions and gatherings`,
      icon: "person_celebrate",
    },
    {
      value: "chat",
      label: $localize`:@@community.editor_category_chat:Community chat`,
      description: $localize`:@@community.editor_category_chat_description:A group chat or online space`,
      icon: "forum",
    },
    {
      value: "classes",
      label: $localize`:@@community.editor_category_training:Training`,
      description: $localize`:@@community.editor_category_training_description:Classes, coaching, or club sessions`,
      icon: "school",
    },
    {
      value: "spots",
      label: $localize`:@@community.editor_category_spots:Local spots`,
      description: $localize`:@@community.editor_category_spots_description:Useful context about places to train`,
      icon: "place",
    },
    {
      value: "events",
      label: $localize`:@@community.editor_category_events:Events`,
      description: $localize`:@@community.editor_category_events_description:Competitions, workshops, and more`,
      icon: "event",
    },
    {
      value: "safety",
      label: $localize`:@@community.editor_category_safety:Safety`,
      description: $localize`:@@community.editor_category_safety_description:Local risks, rules, or access notes`,
      icon: "health_and_safety",
    },
    {
      value: "other",
      label: $localize`:@@community.editor_category_other:Something else`,
      description: $localize`:@@community.editor_category_other_description:Anything else locals should know`,
      icon: "info",
    },
  ];
  readonly disclosureOptions: CommunityKnowledgeChoice<CommunityInfoCardDisclosure>[] = [
    {
      value: "none",
      label: $localize`:@@community.editor_disclosure_none:Community info`,
      description: $localize`:@@community.editor_disclosure_none_description:No commercial relationship`,
      icon: "info",
    },
    {
      value: "classes",
      label: $localize`:@@community.editor_disclosure_classes:Classes or coaching`,
      description: $localize`:@@community.editor_disclosure_classes_description:Training offered by a club or coach`,
      icon: "school",
    },
    {
      value: "paid-partnership",
      label: $localize`:@@community.editor_disclosure_paid:Paid promotion`,
      description: $localize`:@@community.editor_disclosure_paid_description:Paid or partnered placement`,
      icon: "paid",
    },
    {
      value: "shop",
      label: $localize`:@@community.editor_disclosure_shop:Shop or service`,
      description: $localize`:@@community.editor_disclosure_shop_description:A business selling something`,
      icon: "storefront",
    },
  ];
  readonly ctaTargetOptions: CommunityKnowledgeChoice<CommunityInfoCardCtaTarget>[] = [
    {
      value: "none",
      label: $localize`:@@community.editor_destination_none:No destination`,
      description: $localize`:@@community.editor_destination_none_description:The card is useful on its own`,
      icon: "info",
    },
    {
      value: "url",
      label: $localize`:@@community.editor_destination_url:Web link`,
      description: $localize`:@@community.editor_destination_url_description:Open a website or community chat`,
      icon: "link",
    },
    {
      value: "spot",
      label: $localize`:@@community.editor_destination_spot:PK Spot spot`,
      description: $localize`:@@community.editor_destination_spot_description:Open a spot in the app`,
      icon: "place",
    },
    {
      value: "event",
      label: $localize`:@@community.editor_destination_event:PK Spot event`,
      description: $localize`:@@community.editor_destination_event_description:Open an event in the app`,
      icon: "event",
    },
  ];
  readonly ctaVisibilities: CommunityInfoCardCtaVisibility[] = [
    "public",
    "signed-in",
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

  ngOnInit(): void {
    const currentCards = this.cards();
    this._resetForm(currentCards);
    if (currentCards.length === 0 && !this.publishesImmediately()) {
      this.addCard();
    }
  }

  cardGroups(): CommunityKnowledgeCardForm[] {
    return this.form.controls.cards.controls;
  }

  ctaTarget(card: CommunityKnowledgeCardForm): CommunityInfoCardCtaTarget {
    return card.controls.ctaTarget.value;
  }

  isChatCard(card: CommunityKnowledgeCardForm): boolean {
    return card.controls.category.value === "chat";
  }

  categoryIcon(category: CommunityInfoCardCategory): string {
    return communityInfoCardCategoryIcon(category);
  }

  ctaTargetLabel(card: CommunityKnowledgeCardForm): string {
    return (
      this.ctaTargetOptions.find(
        (option) => option.value === this.ctaTarget(card),
      )?.label ?? $localize`:@@community.editor_optional:Optional`
    );
  }

  addCard(): void {
    const locale = this._contentLocale;
    this.form.controls.cards.push(
      this._createCardForm({
        id: `knowledge-${Date.now()}`,
        title: { [locale]: "" },
        category: "other",
        visibility: "public",
      }),
    );
    this.localeModels.update((models) => [
      ...models,
      this._createLocaleModel({ title: { [locale]: "" } }),
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

  updateDestination(
    card: CommunityKnowledgeCardForm,
    target: "spot" | "event",
    id: string,
  ): void {
    if (target === "spot") {
      card.controls.ctaSpotId.setValue(id);
    } else {
      card.controls.ctaEventId.setValue(id);
    }
    card.markAsDirty();
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
      this.validationMessage.set(
        $localize`:@@community.editor_validation_title:Every card needs at least one title.`,
      );
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
      ctaVisibility: new FormControl(
        card.ctaVisibility ??
          (card.category === "chat" && cta?.target === "url"
            ? "signed-in"
            : "public"),
        { nonNullable: true },
      ),
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
      title: signal(this._toEditableLocaleMap(card.title)),
      body: signal(this._toEditableLocaleMap(card.body)),
      ctaLabel: signal(this._toEditableLocaleMap(card.cta?.label)),
    };
  }

  private _toEditableLocaleMap(
    value: CommunityLocalizedTextSchema | null | undefined,
  ): LocaleMap {
    const localeMap = this._toLocaleMap(value);
    return Object.keys(localeMap).length > 0
      ? localeMap
      : {
          [this._contentLocale]: {
            text: "",
            provider: "manual",
          },
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
      ...(cta?.target === "url"
        ? { ctaVisibility: group.controls.ctaVisibility.value }
        : {}),
      commercialDisclosure: group.controls.commercialDisclosure.value,
      priority: index,
      visibility: group.controls.visibility.value,
    };
  }

  private _formToCta(
    group: CommunityKnowledgeCardForm,
    index: number,
  ): CommunityInfoCardCta | undefined {
    switch (group.controls.ctaTarget.value) {
      case "spot": {
        const spotId = group.controls.ctaSpotId.value.trim();
        const label = this._ctaLabelOrDefault(
          index,
          $localize`:@@community.editor_default_view_spot:View spot`,
        );
        return spotId ? { label, target: "spot", spotId } : undefined;
      }
      case "event": {
        const eventId = group.controls.ctaEventId.value.trim();
        const label = this._ctaLabelOrDefault(
          index,
          $localize`:@@community.editor_default_view_event:View event`,
        );
        return eventId ? { label, target: "event", eventId } : undefined;
      }
      case "url": {
        const url = group.controls.ctaUrl.value.trim();
        const label = this._ctaLabelOrDefault(
          index,
          $localize`:@@community.editor_default_open_link:Open link`,
        );
        return url ? { label, target: "url", url } : undefined;
      }
      default:
        return undefined;
    }
  }

  private _ctaLabelOrDefault(
    index: number,
    defaultLabel: string,
  ): Record<string, string> {
    const label = this._localeMapToRecord(this.localeModels()[index]?.ctaLabel());
    return Object.keys(label).length > 0
      ? label
      : { [this._contentLocale]: defaultLabel };
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
