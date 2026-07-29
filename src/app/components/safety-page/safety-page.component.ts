import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import {
  isSafetyCaseCategory,
  isSafetyCaseSubjectType,
} from "../../../db/schemas/SafetyCaseSchema";
import type {
  SafetyCaseCategory,
  SafetyCaseSubjectSchema,
} from "../../../db/schemas/SafetyCaseSchema";
import type { SubmitSafetyCaseResult } from "../../services/safety-cases.service";
import {
  SafetyCaseFormComponent,
  type SafetyCaseFormPreset,
} from "../safety-case-form/safety-case-form.component";

@Component({
  selector: "app-safety-page",
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    SafetyCaseFormComponent,
  ],
  templateUrl: "./safety-page.component.html",
  styleUrl: "./safety-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafetyPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly preset = computed<SafetyCaseFormPreset>(() => {
    const params = this.route.snapshot.queryParamMap;
    const type = params.get("type");
    const category = params.get("category");
    const subjectType = params.get("subjectType");
    const subject: SafetyCaseSubjectSchema | undefined =
      isSafetyCaseSubjectType(subjectType)
        ? {
            type: subjectType,
            ...this.optionalParam("subjectPath", "path"),
            ...this.optionalParam("subjectLabel", "label"),
            ...this.optionalParam("ownerUid", "owner_uid"),
            ...this.optionalParam("mediaSrc", "media_src"),
            ...this.optionalParam("storagePath", "storage_path"),
          }
        : undefined;
    return {
      ...(type === "complaint" || type === "report"
        ? { caseType: type }
        : {}),
      ...(isSafetyCaseCategory(category)
        ? { category: category as SafetyCaseCategory }
        : {}),
      ...(subject ? { subject } : {}),
      ...(params.get("summary") ? { summary: params.get("summary")! } : {}),
    };
  });

  caseSubmitted(result: SubmitSafetyCaseResult): void {
    void this.router.navigate(["/safety/cases", result.public_reference], {
      state: { submission: result },
    });
  }

  private optionalParam(
    queryName: string,
    subjectName: keyof SafetyCaseSubjectSchema,
  ): Partial<SafetyCaseSubjectSchema> {
    const value = this.route.snapshot.queryParamMap.get(queryName)?.trim();
    return value ? { [subjectName]: value } : {};
  }
}
