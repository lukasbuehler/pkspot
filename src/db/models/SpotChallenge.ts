import { getBestLocale } from "../../scripts/LanguageHelpers";
import { SpotChallengeSchema } from "../schemas/SpotChallengeSchema";
import { LocaleCode } from "./Interfaces";

export class SpotChallenge {
  id: string;
  name: string;
  previewImage: string = "/assets/no_media.png";

  constructor(
    id: string,
    private _data: SpotChallengeSchema,
    private _locale: LocaleCode
  ) {
    this.id = id;

    const nameLocale = getBestLocale(Object.keys(_data.name), _locale);
    this.name = _data.name[nameLocale]!.text;
  }
}
