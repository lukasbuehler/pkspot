import { ChangeDetectionStrategy, Component, model } from "@angular/core";
import { MatOption } from "@angular/material/core";
import { MatFormField, MatHint, MatLabel } from "@angular/material/form-field";
import { MatIcon } from "@angular/material/icon";
import { MatSelect, MatSelectTrigger } from "@angular/material/select";
import {
  SpotTypes,
  SpotTypesDescriptions,
  SpotTypesIcons,
  SpotTypesNames,
} from "../../../db/schemas/SpotTypeAndAccess";

@Component({
  selector: "app-spot-type-picker",
  imports: [
    MatFormField,
    MatHint,
    MatIcon,
    MatLabel,
    MatOption,
    MatSelect,
    MatSelectTrigger,
  ],
  templateUrl: "./spot-type-picker.component.html",
  styleUrl: "./spot-type-picker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotTypePickerComponent {
  readonly value = model(SpotTypes.Other);

  protected readonly options = Object.values(SpotTypes);
  protected readonly names = SpotTypesNames;
  protected readonly icons = SpotTypesIcons;
  protected readonly descriptions = SpotTypesDescriptions;
}
