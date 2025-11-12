import { Timestamp } from "firebase/firestore";
import { SpotEditSchema } from "../schemas/SpotEditSchema";
import { languageCodes } from "../../scripts/Languages";
import { LocaleMap } from "./Interfaces";

export class SpotEdit implements SpotEditSchema {
  readonly id: string;

  readonly data: SpotEditSchema["data"];
  readonly prevData?: SpotEditSchema["prevData"];
  readonly user: SpotEditSchema["user"];
  readonly type: SpotEditSchema["type"];
  readonly timestamp: SpotEditSchema["timestamp"];
  readonly likes: SpotEditSchema["likes"];
  readonly approved: SpotEditSchema["approved"];

  constructor(id: string, private readonly _spotEditSchema: SpotEditSchema) {
    this.id = id;
    this.data = _spotEditSchema.data;
    this.user = _spotEditSchema.user;
    this.type = _spotEditSchema.type;
    this.timestamp = _spotEditSchema.timestamp;
    this.likes = _spotEditSchema.likes;
    this.approved = _spotEditSchema.approved;
  }

  getSchema(): SpotEditSchema {
    return this._spotEditSchema;
  }

  getEditDetailsHTML(): string {
    const isCreate = this.type === "CREATE";

    let detailString: string = "";
    const keyOrder: readonly (keyof SpotEditSchema["data"])[] = [
      "name",
      "description",
      "slug",
      "location",
      "bounds",
      "media",
      "type",
      "access",
      "amenities",
      "external_references",
      "hide_streetview",
    ] as const;
    const sortedEntries = Object.entries(this.data).sort(
      ([keyA], [keyB]) =>
        keyOrder.indexOf(keyA as never) - keyOrder.indexOf(keyB as never)
    );
    sortedEntries.forEach(([key, value]) => {
      let message: string = "";
      switch (key) {
        case "name":
          const nameEntries = Object.entries(value as LocaleMap);
          const nameList = nameEntries
            .map(([locale, value]) => {
              if (value) {
                const langInfo = languageCodes[locale];
                return `<li>${langInfo.name_native}${langInfo.emoji ?? ""}: '${
                  value.text
                }'</li>`;
              }
            })
            .join(", ");
          message = isCreate
            ? `Set name: <ul>${nameList}</ul>`
            : `Updated name: <ul>${nameList}</ul>`;

          break;
        case "description":
          message = isCreate
            ? "Set description.</br>"
            : "Updated description.</br>";
          break;
        case "slug":
          message = `Set the slug URI to be '${value}'.</br>`;
          break;
        case "location":
          message = isCreate ? "Set location.</br>" : "Updated location.</br>";
          break;
        case "media":
          if (
            value &&
            Array.isArray(value) &&
            value.length === 0 &&
            !isCreate
          ) {
            message = isCreate ? "Added media.</br>" : "Updated media.</br>";
          }
          break;
        case "bounds":
          message = isCreate ? "Set bounds.</br>" : "Updated bounds.</br>";
          break;
        // case "type":
        //   message = isCreate
        //     ? "Set spot type.</br>"
        //     : "Updated spot type.</br>";
        //   break;
        // case "access":
        //   message = isCreate
        //     ? "Set access information.</br>"
        //     : "Updated access information.</br>";
        //   break;
        case "amenities":
          const amenitiesEntries = Object.entries(
            value as Record<string, boolean | null | undefined>
          );
          const amenitiesList = amenitiesEntries
            .map(([amenity, value]) => {
              const label = amenity.replace(/_/g, " ");
              const emoji = value === true ? "✓" : value === false ? "✗" : "?";
              return `<li>${label} ${emoji}</li>`;
            })
            .join("");
          if (amenitiesList.length > 0) {
            message = isCreate
              ? `Set amenities: <ul>${amenitiesList}</ul>`
              : `Updated amenities: <ul>${amenitiesList}</ul>`;
          }
          break;
        case "external_references":
          message = isCreate
            ? "Set external references.</br>"
            : "Updated external references.</br>";
          break;
        default:
          if (value) {
            message = `Set '${key}' to '${value}'.</br>`;
          }
      }

      detailString += message;
    });

    return detailString;
  }

  getTimestampString(): string {
    const date = this.timestamp.toDate();
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  }
}
