import { humanTimeSince, parseFirestoreTimestamp } from "../../scripts/Helpers";
import { UserSchema, UserSocialsSchema } from "../schemas/UserSchema";
import { StorageImage, ImageMedia } from "./Media";

export class User {
  public uid: string;
  public displayName: string = "";
  public biography: string = "";
  public homeSpots: string[] = [];
  public profilePicture: ImageMedia | null = null;
  public startTimeDiffString: string | null = null;
  public startDate: Date | null = null;
  public followerCount: number = 0;
  public visitedSpotsCount: number = 0;
  public nationalityCode: string | null = null;
  public homeCity: string | null = null;
  public socials: UserSocialsSchema | null = null;

  // NOTE: bookmarks, visitedSpots, and settings are now loaded separately via UsersService.getPrivateData()

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
    this.profilePicture = new StorageImage(url);
  }

  private _updateData() {
    this.displayName = this._data.display_name ?? "";
    this.biography = this._data.biography ?? "";
    this.homeSpots = this._data.home_spots ?? [];

    if (this._data.profile_picture) {
      this.profilePicture = new StorageImage(this._data.profile_picture);
    }

    // Start date - use helper to parse various timestamp formats
    const startDate = parseFirestoreTimestamp(this._data.start_date);
    if (startDate) {
      this.startTimeDiffString = humanTimeSince(startDate);
      this.startDate = startDate;
    }

    // Followers
    if (this._data.follower_count) {
      this.followerCount = this._data.follower_count;
    }
    this.visitedSpotsCount = this._data.visited_spots_count ?? 0;

    this.nationalityCode = this._data.nationality_code ?? null;
    this.homeCity = this._data.home_city ?? null;
    this.socials = this._data.socials
      ? {
          instagram_handle: this._data.socials.instagram_handle,
          youtube_handle: this._data.socials.youtube_handle,
          other: (this._data.socials.other ?? []).filter(
            (link) => !!link?.name && !!link?.url
          ),
        }
      : null;

    // Data
    this.data = this._data;
  }
}
