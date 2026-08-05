/* global firebase, importScripts */

importScripts(
  "/assets/firebase/firebase-app-compat.js",
  "/assets/firebase/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyBweX0jjdbdrIy2slKPf6ZAhvl6XHz4AlI",
  authDomain: "parkour-base-project.firebaseapp.com",
  projectId: "parkour-base-project",
  storageBucket: "parkour-base-project.appspot.com",
  messagingSenderId: "294969617102",
  appId: "1:294969617102:web:f9a2fcf843e8b288313e9f",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const actions = parseActions(data.action_labels);
  const diagnostics = notificationDiagnostics(data);
  console.info("[WebPush SW] background FCM message received", diagnostics);
  return self.registration
    .showNotification(data.title || "PK Spot", {
      body: data.body || "",
      icon: "/assets/icons/icon-192.webp",
      badge: "/assets/icons/icon-96.webp",
      tag: data.thread_key || data.intent_id,
      renotify: true,
      data,
      ...(data.image_url ? { image: data.image_url } : {}),
      ...(actions.length ? { actions } : {}),
    })
    .then(() => {
      console.info("[WebPush SW] browser accepted system notification request", {
        ...diagnostics,
        displayConfirmationAvailable: false,
      });
    })
    .catch((error) => {
      console.error("[WebPush SW] system notification request failed", {
        ...diagnostics,
        error,
      });
      throw error;
    });
});

function notificationDiagnostics(data) {
  return {
    intentId: data.intent_id || null,
    type: data.type || null,
    threadKey: data.thread_key || null,
    hasTitle: Boolean(data.title),
    hasBody: Boolean(data.body),
  };
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || "tap";
  const path = action === "tap"
    ? safePath(data.path)
    : actionPath(data.intent_id, action, data.path);
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        return existing.focus().then((client) => client.navigate(targetUrl));
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

function parseActions(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item.action === "string" && typeof item.title === "string")
          .slice(0, 2)
      : [];
  } catch {
    return [];
  }
}

function actionPath(intentId, action, returnTo) {
  if (typeof intentId !== "string" || !intentId) return safePath(returnTo);
  const params = new URLSearchParams({
    notification: intentId,
    notificationAction: action,
    returnTo: safePath(returnTo),
  });
  return `/notifications?${params.toString()}`;
}

function safePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/notifications";
}
