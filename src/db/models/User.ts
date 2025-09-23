import { DocumentReference, Timestamp } from "firebase/firestore";
import { humanTimeSince } from "../../scripts/Helpers";
import { UserSchema, UserSettingsSchema } from "../schemas/UserSchema";
import { StorageImage } from "./Media";

export class User {
  public uid: string;
  public displayName: string = "";
  public biography: string = "";
  public profilePicture: StorageImage | null = null;
  public startTimeDiffString: string | null = null;
  public startDate: Date | null = null;
  public followerCount: number = 0;
  public settings: UserSettingsSchema | null = null;

  public data: UserSchema | null = null;

  constructor(private _uid: string, private _data: UserSchema) {
    this.uid = this._uid;
    this._updateData();
  }

  public setUserData(data: UserSchema) {
    this._data = data;
    this._updateData();
  }

  public setProfilePicture(url: string) {
    this._data.profile_picture = url;
    this._updateData();
  }

  private _updateData() {
    this.displayName = this._data.display_name ?? "";
    this.biography = this._data.biography ?? "";

    if (this._data.profile_picture) {
      this.profilePicture = new StorageImage(this._data.profile_picture);
    }

    this.settings = this._data.settings ?? {};

    // Start date
    if (this._data.start_date) {
      this.startTimeDiffString = humanTimeSince(this._data.start_date.toDate());
    }

    // Followers
    if (this._data.follower_count) {
      this.followerCount = this._data.follower_count;
    }

    // Data
    this.data = this._data;
  }
}
