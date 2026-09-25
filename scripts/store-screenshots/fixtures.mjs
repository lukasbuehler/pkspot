// These browser-only seeds use the same service hooks as the route visual tests.
// They never sign in to Firebase or write sample history to an account.
export async function installSceneFixtures(page, capture, copy, config) {
  const uid = config.mockAuthUser.uid;
  const globals = {
    __PKSPOT_SCREENSHOT_DISABLE_NOTIFICATION_PROMPTS__: true,
    __PKSPOT_SCREENSHOT_NOTIFICATIONS__: [],
    __PKSPOT_SCREENSHOT_ATTENDED_EVENTS__: [],
    __PKSPOT_SCREENSHOT_COMMUNITY_FOLLOWS__: [],
    __PKSPOT_SCREENSHOT_USER_PROFILES__: { [uid]: config.mockAuthUser.data },
  };

  if (capture.fixture === "training") {
    const now = new Date(config.fixedTime);
    const startedAt = (daysAgo) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, 15);
    const days = [2, 5, 7, 10, 12, 15, 17];
    const spots = ["Lindenhof", "Wipkingen", "Sihlcity"];
    const sessions = days.map((day, index) => ({
      id: `store-session-${index}`,
      owner_id: uid,
      source: "manual",
      started_at_raw_ms: startedAt(day),
      ended_at_raw_ms: startedAt(day) + 90 * 60_000,
      last_activity_raw_ms: startedAt(day) + 90 * 60_000,
      time_zone: "Europe/Zurich",
      spot_visits: [{
        spot_id: `store-spot-${index % 3}`,
        spot_name: spots[index % 3],
        arrived_at_raw_ms: startedAt(day),
      }],
      people_present: [],
      time_created_raw_ms: startedAt(day),
      time_updated_raw_ms: startedAt(day),
    }));
    globals.__PKSPOT_SCREENSHOT_TRAINING_SESSIONS__ = sessions;
    globals.__PKSPOT_SCREENSHOT_TRAINING_LOG_ENTRIES__ = sessions.map((session, index) => ({
      id: `store-entry-${index}`,
      owner_id: uid,
      note: copy.trainingNotes[index % copy.trainingNotes.length],
      visibility: "private",
      session_record_ids: [session.id],
      session_summaries: [{
        session_record_id: session.id,
        local_date: new Date(session.started_at_raw_ms).toISOString().slice(0, 10),
        duration_minutes: 90,
        spot_count: 1,
      }],
      activity_at_raw_ms: session.started_at_raw_ms,
      time_created_raw_ms: session.ended_at_raw_ms,
      time_updated_raw_ms: session.ended_at_raw_ms,
    }));
    globals.__PKSPOT_SCREENSHOT_RECOVERY_PAUSES__ = [];
  }

  await page.addInitScript((seeds) => Object.assign(globalThis, seeds), globals);
}
