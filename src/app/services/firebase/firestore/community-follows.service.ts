import { Injectable, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import {
  CommunityFollowDocument,
  CommunityFollowSchema,
} from "../../../../db/schemas/CommunityFollowSchema";
import type { CommunitySearchPreview } from "../../search.service";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { UsersService } from "./users.service";

@Injectable({ providedIn: "root" })
export class CommunityFollowsService {
  private readonly firestore = inject(FirestoreAdapterService);
  private readonly auth = inject(AuthenticationService);
  private readonly users = inject(UsersService);

  async listMine(limit = 100): Promise<CommunityFollowDocument[]> {
    const uid = this.requireUserId();
    return this.firestore.getCollection<CommunityFollowDocument>(
      `users/${uid}/community_follows`,
      [],
      [
        {
          type: "orderBy",
          fieldPath: "time_created_raw_ms",
          direction: "desc",
        },
        { type: "limit", limit },
      ],
    );
  }

  async isFollowing(communityKey: string): Promise<boolean> {
    const uid = this.auth.user.uid;
    if (!uid) return false;
    return (
      (await this.firestore.getDocument<CommunityFollowSchema>(
        this.path(uid, communityKey),
      )) !== null
    );
  }

  async follow(community: CommunitySearchPreview): Promise<void> {
    const uid = this.requireUserId();
    const now = Timestamp.now();
    await this.firestore.setDocument(this.path(uid, community.communityKey), {
      community_key: community.communityKey,
      scope: community.scope ?? "locality",
      display_name: community.displayName,
      canonical_path:
        community.canonicalPath ??
        `/map/communities/${encodeURIComponent(community.slug)}`,
      ...(community.imageUrl ? { image_url: community.imageUrl } : {}),
      time_created: now,
      time_created_raw_ms: now.toMillis(),
      event_notifications: false,
      spot_digest_notifications: false,
    } satisfies CommunityFollowSchema);
  }

  async setNotifications(
    communityKey: string,
    settings: {
      eventNotifications?: boolean;
      spotDigestNotifications?: boolean;
    },
  ): Promise<void> {
    const uid = this.requireUserId();
    const now = Timestamp.now();
    await this.firestore.setDocument(
      this.path(uid, communityKey),
      {
        ...(settings.eventNotifications === undefined
          ? {}
          : { event_notifications: settings.eventNotifications }),
        ...(settings.spotDigestNotifications === undefined
          ? {}
          : { spot_digest_notifications: settings.spotDigestNotifications }),
        time_updated: now,
        time_updated_raw_ms: now.toMillis(),
      },
      { merge: true },
    );
    if (settings.spotDigestNotifications && typeof Intl !== "undefined") {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timeZone) await this.users.updatePrivateData(uid, { time_zone: timeZone });
    }
  }

  async unfollow(communityKey: string): Promise<void> {
    await this.firestore.deleteDocument(
      this.path(this.requireUserId(), communityKey),
    );
  }

  private path(uid: string, communityKey: string): string {
    return `users/${uid}/community_follows/${communityKey}`;
  }

  private requireUserId(): string {
    const uid = this.auth.user.uid;
    if (!uid) throw new Error("Community follows require a signed-in user.");
    return uid;
  }
}
