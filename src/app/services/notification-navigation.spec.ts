import {
  NOTIFICATION_INTENT_TYPES,
  type NotificationIntentType,
} from "../../db/schemas/NotificationSchema";
import { resolveNotificationPath } from "./notification-navigation";

describe("resolveNotificationPath", () => {
  const paths: Record<NotificationIntentType, string> = {
    follow_request: "/profile",
    follow_accepted: "/u/user-2",
    new_follower: "/u/user-3",
    event_reminder: "/events/city-jam",
    event_update: "/events/city-jam",
    event_registration_update: "/events/city-jam",
    event_ownership_update: "/events/city-jam",
    spot_edit_update: "/map/spots/central-plaza",
    spot_report_update: "/reports/outcomes/spot-1",
    media_report_update: "/reports/outcomes/media-1",
    community_info_update: "/map/communities/zurich",
    community_event: "/events/community-jam",
    community_spot_digest: "/map/spots/recommended-spot",
  };

  it.each(NOTIFICATION_INTENT_TYPES)(
    "keeps the valid destination for %s clicks",
    (type) => {
      expect(resolveNotificationPath({ type, path: paths[type] })).toBe(
        paths[type],
      );
    },
  );

  it("repairs existing Spot digest links using the first Spot id", () => {
    expect(
      resolveNotificationPath({
        type: "community_spot_digest",
        path: "/train",
        payload: { spot_ids: '["spot/id", "spot-2"]' },
      }),
    ).toBe("/map/spots/spot%2Fid");
  });

  it("falls back to the map for an old digest without Spot payload data", () => {
    expect(
      resolveNotificationPath({
        type: "community_spot_digest",
        path: "/train",
      }),
    ).toBe("/map");
  });

  it("does not navigate to external or protocol-relative destinations", () => {
    expect(resolveNotificationPath({ path: "https://example.com" })).toBe(
      "/notifications",
    );
    expect(resolveNotificationPath({ path: "//example.com" })).toBe(
      "/notifications",
    );
  });
});
