const admin = require("firebase-admin");

const TEST_TYPES = [
  "follow-request",
  "follow-accepted",
  "new-follower",
  "mutual-follower",
  "event-reminder",
  "event-update",
  "spot-edit-approved",
  "spot-edit-rejected",
  "spot-report-action",
  "media-report-action",
  "community-info-approved",
  "community-info-rejected",
  "community-event",
  "community-spot-digest",
];

const PREFERENCE_BY_TYPE = {
  follow_request: "follow_requests",
  follow_accepted: "follow_requests",
  new_follower: "follow_requests",
  event_reminder: "event_reminders",
  event_update: "event_updates",
  spot_edit_update: "spot_edit_updates",
  spot_report_update: "report_updates",
  media_report_update: "report_updates",
  community_info_update: "community_info_updates",
  community_event: "community_events",
  community_spot_digest: "community_spot_digest",
};

function usage() {
  return `Usage:
  npm run notification:test -- --project PROJECT_ID --uid USER_ID --type TYPE [options] [--send]

Types:
  ${TEST_TYPES.join("\n  ")}

Options:
  --name NAME              Person, event, Spot, or community name
  --venue VENUE            Venue shown by event-reminder
  --offset 1440|120|30     Event reminder offset (default: 120)
  --rsvp going|interested  Event reminder relationship (default: interested)
  --days DAYS              Direct-test title override: "starts in DAYS days"
  --event-id ID            Real event_discovery ID required by community-event
  --community-key KEY      Followed community required by community notifications
  --registration-id ID     Send directly to one device, without a feed entry
  --all-devices            Allow delivery to every active registration for the user
  --send                   Enqueue the intent; omitted means dry run

The command requires Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS.`;
}

function parseArgs(argv) {
  const options = { send: false, allDevices: false };
  const valueFlags = new Map([
    ["--project", "project"],
    ["--uid", "uid"],
    ["--type", "type"],
    ["--name", "name"],
    ["--venue", "venue"],
    ["--offset", "offset"],
    ["--rsvp", "rsvp"],
    ["--days", "days"],
    ["--event-id", "eventId"],
    ["--community-key", "communityKey"],
    ["--registration-id", "registrationId"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--send") {
      options.send = true;
      continue;
    }
    if (argument === "--all-devices") {
      options.allDevices = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const key = valueFlags.get(argument);
    if (!key) throw new Error(`Unknown option: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function cleanId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${label} must contain only letters, numbers, underscores, or hyphens.`);
  }
  return value;
}

function buildTemplate(options) {
  if (!TEST_TYPES.includes(options.type)) {
    throw new Error(`Unknown type "${options.type}".\n\n${usage()}`);
  }

  const id = `reel-${Date.now()}`;
  const name = options.name || defaultName(options.type);
  const personId = "reel-test-profile";
  const eventId = options.eventId || "reel-test-event";
  const common = {
    sourcePath: `test_notifications/${id}`,
    threadKey: `reel:${options.type}:${id}`,
  };

  switch (options.type) {
    case "follow-request":
      return {
        ...common,
        type: "follow_request",
        channelId: "follow_incoming",
        path: `/u/${personId}`,
        payload: { requester_id: personId, requester_name: name },
        actions: [
          { id: "accept_follow_request" },
          { id: "decline_follow_request", destructive: true },
        ],
      };
    case "follow-accepted":
      return {
        ...common,
        type: "follow_accepted",
        channelId: "follow_relationships",
        path: `/u/${personId}`,
        payload: { followed_user_id: personId, followed_user_name: name },
      };
    case "new-follower":
    case "mutual-follower": {
      const mutual = options.type === "mutual-follower";
      return {
        ...common,
        type: "new_follower",
        channelId: mutual ? "follow_relationships" : "follow_incoming",
        path: `/u/${personId}`,
        payload: {
          follower_id: personId,
          follower_name: name,
          relationship: mutual ? "mutual" : "following",
        },
        actions: mutual ? [] : [{ id: "follow_back" }],
      };
    }
    case "event-reminder": {
      const offset = Number(options.offset || 120);
      if (![1440, 120, 30].includes(offset)) {
        throw new Error("--offset must be 1440, 120, or 30.");
      }
      const rsvp = options.rsvp || "interested";
      if (rsvp !== "going" && rsvp !== "interested") {
        throw new Error("--rsvp must be going or interested.");
      }
      const days = options.days === undefined ? undefined : Number(options.days);
      if (days !== undefined && (!Number.isInteger(days) || days < 2 || days > 30)) {
        throw new Error("--days must be a whole number from 2 to 30.");
      }
      return {
        ...common,
        type: "event_reminder",
        channelId: "event_reminders",
        path: `/events/${eventId}`,
        payload: {
          event_id: eventId,
          event_name: name,
          reminder_offset_minutes: String(offset),
          rsvp,
          ...(options.venue ? { venue_name: options.venue } : {}),
        },
        actions: rsvp === "interested" ? [{ id: "mark_event_going" }] : [],
        ...(days === undefined
          ? {}
          : {
              copyOverride: {
                title: `${name} starts in ${days} days`,
                body: rsvp === "going"
                  ? options.venue
                    ? `See you at ${options.venue}.`
                    : "See you there."
                  : "Still interested? Let people know if you're going.",
              },
            }),
      };
    }
    case "event-update":
      return {
        ...common,
        type: "event_update",
        channelId: "event_updates",
        path: `/events/${eventId}`,
        payload: { event_id: eventId, event_name: name, change: "time" },
      };
    case "spot-edit-approved":
    case "spot-edit-rejected":
      return {
        ...common,
        type: "spot_edit_update",
        channelId: "spot_edit_updates",
        path: "/profile/contributions",
        payload: {
          spot_name: name,
          outcome: options.type === "spot-edit-approved" ? "approved" : "rejected",
        },
      };
    case "spot-report-action":
    case "media-report-action": {
      const spot = options.type === "spot-report-action";
      return {
        ...common,
        type: spot ? "spot_report_update" : "media_report_update",
        channelId: spot ? "spot_report_updates" : "media_report_updates",
        path: "/profile/reports",
        payload: { target_name: name, outcome: "action_taken" },
      };
    }
    case "community-info-approved":
    case "community-info-rejected":
      return {
        ...common,
        type: "community_info_update",
        channelId: "community_info_updates",
        path: "/map/communities",
        payload: {
          community_name: name,
          outcome: options.type === "community-info-approved" ? "approved" : "rejected",
        },
      };
    case "community-event":
      if (!options.eventId || !options.communityKey) {
        throw new Error("community-event requires --event-id and --community-key.");
      }
      return {
        ...common,
        sourcePath: `event_discovery/${cleanId(options.eventId, "event ID")}`,
        type: "community_event",
        channelId: "community_events",
        path: `/events/${options.eventId}`,
        payload: {
          event_id: options.eventId,
          event_name: name,
          community_name: options.name || "your community",
          community_keys: JSON.stringify([options.communityKey]),
        },
      };
    case "community-spot-digest":
      if (!options.communityKey) {
        throw new Error("community-spot-digest requires --community-key.");
      }
      return {
        ...common,
        type: "community_spot_digest",
        channelId: "community_spot_digest",
        path: "/map",
        payload: {
          spot_count: "3",
          top_spot_name: name,
          community_keys: JSON.stringify([options.communityKey]),
        },
      };
    default:
      throw new Error(`Unsupported type: ${options.type}`);
  }
}

function defaultName(type) {
  if (type.startsWith("follow") || type.includes("follower")) return "Alex";
  if (type.startsWith("event")) return "Skills Comp";
  if (type.startsWith("community-info")) return "Zürich Parkour";
  if (type === "community-event") return "Skills Comp";
  if (type === "community-spot-digest") return "Central Station Spot";
  return "Riverside Spot";
}

function maskToken(token) {
  return token.length > 12 ? `${token.slice(0, 6)}…${token.slice(-6)}` : "(hidden)";
}

async function validateTarget(db, options, template) {
  const user = await db.doc(`users/${options.uid}`).get();
  if (!user.exists) throw new Error(`User ${options.uid} does not exist.`);

  const registrations = await db
    .collection(`users/${options.uid}/notification_registrations`)
    .where("enabled", "==", true)
    .get();
  const active = registrations.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter((registration) =>
      registration.permission_state === "granted" &&
      typeof registration.token === "string" &&
      registration.token.length > 20
    );
  if (active.length === 0) {
    throw new Error("The user has no active notification registration.");
  }
  if (options.registrationId) {
    const registration = active.find((item) => item.id === options.registrationId);
    if (!registration) {
      throw new Error(`Registration ${options.registrationId} is not active for this user.`);
    }
    return [registration];
  }
  if (active.length > 1 && !options.allDevices) {
    const devices = active
      .map((item) => `  ${item.id}: ${item.platform || "unknown"} ${maskToken(item.token)}`)
      .join("\n");
    throw new Error(
      `The user has ${active.length} active registrations. This pipeline sends to all of them:\n${devices}\nPass --all-devices to confirm.`
    );
  }

  const privateData = await db.doc(`users/${options.uid}/private_data/main`).get();
  const preference = PREFERENCE_BY_TYPE[template.type];
  if (privateData.data()?.notification_preferences?.[preference] !== true) {
    throw new Error(`Notification preference ${preference} is not enabled for this user.`);
  }

  if (template.type === "community_event" || template.type === "community_spot_digest") {
    const follow = await db.doc(
      `users/${options.uid}/community_follows/${cleanId(options.communityKey, "community key")}`
    ).get();
    const setting = template.type === "community_event"
      ? "event_notifications"
      : "spot_digest_notifications";
    if (follow.data()?.[setting] !== true) {
      throw new Error(`The community follow does not have ${setting} enabled.`);
    }
  }

  if (template.type === "community_event") {
    const event = await db.doc(`event_discovery/${options.eventId}`).get();
    if (!event.exists) {
      throw new Error(`event_discovery/${options.eventId} does not exist.`);
    }
  }

  return active;
}

function directMessage(intentId, registration, template) {
  const {
    localizedActions,
    notificationCategory,
    notificationCopy,
  } = require("../functions/lib/functions/src/notificationFunctions.js");
  const intent = {
    type: template.type,
    payload: template.payload,
    path: template.path,
    thread_key: template.threadKey,
    actions: template.actions || [],
  };
  const locale = registration.locale || "en";
  const copy = template.copyOverride || notificationCopy(intent, locale);
  const actions = localizedActions(intent.actions, locale);
  const data = {
    intent_id: intentId,
    type: template.type,
    title: copy.title,
    body: copy.body,
    path: template.path,
    channel_id: template.channelId,
    thread_key: template.threadKey,
    actions: JSON.stringify(actions.map(({ action }) => action)),
    action_labels: JSON.stringify(actions),
    ...(template.payload.event_id ? { event_id: template.payload.event_id } : {}),
  };

  return {
    token: registration.token,
    data,
    ...(registration.platform === "android"
      ? { android: { priority: "high", ttl: 60 * 60 * 1000 } }
      : {}),
    ...(registration.platform === "ios"
      ? {
          notification: copy,
          apns: {
            payload: {
              aps: {
                sound: "default",
                threadId: template.threadKey,
                ...(actions.length ? { category: notificationCategory(intent) } : {}),
              },
            },
          },
        }
      : {}),
    ...(registration.platform === "web"
      ? { webpush: { headers: { Urgency: "high", TTL: "3600" } } }
      : {}),
  };
}

async function run(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.project || !options.uid || !options.type) {
    throw new Error(`--project, --uid, and --type are required.\n\n${usage()}`);
  }
  cleanId(options.project, "project ID");
  cleanId(options.uid, "user ID");
  if (options.registrationId) cleanId(options.registrationId, "registration ID");
  if (options.days !== undefined && !options.registrationId) {
    throw new Error("--days is only available with direct --registration-id delivery.");
  }
  const template = buildTemplate(options);

  admin.initializeApp({ projectId: options.project });
  const db = admin.firestore();
  try {
    const registrations = await validateTarget(db, options, template);
    console.log(`Project: ${options.project}`);
    console.log(`User: ${options.uid}`);
    console.log(`Template: ${options.type} -> ${template.type}/${template.channelId}`);
    console.log(`Active registrations: ${registrations.length}`);

    if (!options.send) {
      console.log("Dry run only. Add --send to enqueue this notification.");
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const intentId = `reel_test_${options.uid}_${Date.now()}`;
    if (options.registrationId) {
      const messageId = await admin.messaging().send(
        directMessage(intentId, registrations[0], template),
      );
      console.log(
        `Sent directly to ${registrations[0].platform || "unknown"} registration ${registrations[0].id}: ${messageId}`
      );
      return;
    }
    await db.collection("notification_intents").doc(intentId).create({
      recipient_uid: options.uid,
      type: template.type,
      source_path: template.sourcePath,
      send_after: now,
      expires_at: admin.firestore.Timestamp.fromMillis(now.toMillis() + 60 * 60 * 1000),
      dedupe_key: intentId,
      status: "pending",
      path: template.path,
      channel_id: template.channelId,
      payload: template.payload,
      thread_key: template.threadKey,
      ...(template.actions?.length ? { actions: template.actions } : {}),
      attempts: 0,
      test_notification: true,
      created_at: now,
      updated_at: now,
    });
    console.log(`Enqueued notification_intents/${intentId}. Delivery normally takes up to one minute.`);
  } finally {
    await admin.app().delete();
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { TEST_TYPES, buildTemplate, directMessage, parseArgs, run };
