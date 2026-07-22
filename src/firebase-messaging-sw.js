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

// Notification payloads and fcmOptions.link are supplied by Cloud Functions.
firebase.messaging();
