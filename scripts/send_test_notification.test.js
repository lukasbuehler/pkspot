const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TEST_TYPES,
  buildTemplate,
  directMessage,
  parseArgs,
} = require("./send_test_notification.js");

test("parses required flags and keeps sending opt-in explicit", () => {
  const options = parseArgs([
    "--project", "parkour-base-project",
    "--uid", "user-1",
    "--type", "event-reminder",
    "--send",
  ]);

  assert.equal(options.project, "parkour-base-project");
  assert.equal(options.uid, "user-1");
  assert.equal(options.type, "event-reminder");
  assert.equal(options.send, true);
  assert.equal(options.allDevices, false);
});

test("builds every self-contained template", () => {
  const contextual = new Set(["community-event", "community-spot-digest"]);
  for (const type of TEST_TYPES.filter((item) => !contextual.has(item))) {
    const template = buildTemplate({ type });
    assert.ok(template.type);
    assert.ok(template.channelId);
    assert.ok(template.path);
    assert.ok(template.payload);
  }
});

test("builds an actionable event reminder", () => {
  const template = buildTemplate({
    type: "event-reminder",
    name: "Skills Comp",
    venue: "Skills Park",
    offset: "30",
  });

  assert.equal(template.type, "event_reminder");
  assert.equal(template.channelId, "event_reminders");
  assert.deepEqual(template.payload, {
    event_id: "reel-test-event",
    event_name: "Skills Comp",
    reminder_offset_minutes: "30",
    rsvp: "interested",
    venue_name: "Skills Park",
  });
  assert.deepEqual(template.actions, [{ id: "mark_event_going" }]);
});

test("builds a going reminder without an RSVP action", () => {
  const template = buildTemplate({
    type: "event-reminder",
    name: "Skills Comp",
    rsvp: "going",
  });

  assert.equal(template.payload.rsvp, "going");
  assert.deepEqual(template.actions, []);
});

test("builds direct multi-day reminder copy without changing production offsets", () => {
  const template = buildTemplate({
    type: "event-reminder",
    name: "Skills Comp",
    rsvp: "going",
    days: "5",
  });

  assert.deepEqual(template.copyOverride, {
    title: "Skills Comp starts in 5 days",
    body: "See you there.",
  });
  assert.equal(template.payload.reminder_offset_minutes, "120");
});

test("requires real context for community event delivery", () => {
  assert.throws(
    () => buildTemplate({ type: "community-event" }),
    /requires --event-id and --community-key/,
  );
});

test("builds a single-device Android data message with production rendering", () => {
  const template = buildTemplate({ type: "new-follower", name: "Alex" });
  const message = directMessage(
    "reel-test-1",
    {
      token: "a".repeat(64),
      platform: "android",
      locale: "en",
    },
    template,
  );

  assert.equal(message.token, "a".repeat(64));
  assert.equal(message.data.channel_id, "follow_incoming");
  assert.equal(message.data.title, "Alex is following you");
  assert.deepEqual(message.android, { priority: "high", ttl: 3_600_000 });
});
