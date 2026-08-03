import { ChangeDetectionStrategy, Component, model } from "@angular/core";
import { MatOption } from "@angular/material/core";
import { MatFormField, MatHint, MatLabel } from "@angular/material/form-field";
import { MatIcon } from "@angular/material/icon";
import { MatSelect, MatSelectTrigger } from "@angular/material/select";
import {
  SpotAccess,
  SpotAccessDescriptions,
  SpotAccessIcons,
  SpotAccessNames,
} from "../../../db/schemas/SpotTypeAndAccess";

@Component({
  selector: "app-spot-access-picker",
  imports: [
    MatFormField,
    MatHint,
    MatIcon,
    MatLabel,
    MatOption,
    MatSelect,
    MatSelectTrigger,
  ],
  templateUrl: "./spot-access-picker.component.html",
  styleUrl: "./spot-access-picker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotAccessPickerComponent {
  readonly value = model(SpotAccess.Other);

  protected readonly options = Object.values(SpotAccess);
  protected readonly names = SpotAccessNames;
  protected readonly icons = SpotAccessIcons;
  protected readonly descriptions = SpotAccessDescriptions;
}
