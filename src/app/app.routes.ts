import { Routes } from "@angular/router";
import { contentResolver } from "./resolvers/content.resolver";
import { communityLandingResolver } from "./resolvers/community-landing.resolver";
import { environment } from "../environments/environment";

export const ACCEPTANCE_FREE_PREFIXES = [
  "/about",
  "/support",
  "/terms-of-service",
  "/tos",
  "/privacy-policy",
  "/pp",
  "/impressum",
];

export const routes: Routes = [
  // Home page (redirects to spot map)
  {
    path: "",
    redirectTo: "map",
    pathMatch: "full",
    resolve: { content: contentResolver },
  },

  ...(environment.features.activity
    ? [
        {
          path: "activity",
          loadComponent: () =>
            import("./components/activity-page/activity-page.component").then(
              (m) => m.ActivityPageComponent
            ),
          resolve: { content: contentResolver },
          data: { routeName: "Activity" },
        },
      ]
    : []),

  // Community on map. Plural "communities" matches /events for URL
  // consistency. Crawlers get a real HTTP 301 via server-redirects.ts
  // (SSR Express middleware); the function-form redirect below covers
  // dev mode (`ng serve` bypasses the Express server) and any in-app
  // navigation that doesn't pass through SSR. String-form redirectTo is
  // unsafe here — it interacts badly with the locale base href and
  // produces a doubled path like /de/map/community/map/communities/:slug.
  {
    path: "map/communities/:slug",
    loadComponent: () =>
      import("./components/map-page/map-page.component").then(
        (m) => m.MapPageComponent
      ),
    resolve: { communityLanding: communityLandingResolver },
    data: { routeName: "Community Landing" },
  },
  {
    path: "map/community/:slug",
    redirectTo: (route) => `/map/communities/${route.params["slug"]}`,
    pathMatch: "full",
    data: { routeName: "Community Landing (legacy redirect)" },
  },

  // Event-on-map preview. Stays on the map and opens the event preview
  // panel; the full /events/:slug page is reached via the preview's
  // "See full event" CTA.
  {
    path: "map/events/:eventId",
    loadComponent: () =>
      import("./components/map-page/map-page.component").then(
        (m) => m.MapPageComponent
      ),
    data: { routeName: "Event on Map" },
  },
  {
    path: "map/event/:eventId",
    redirectTo: "map/events/:eventId",
    pathMatch: "full",
    data: { routeName: "Event on Map (legacy redirect)" },
  },
  {
    path: "map/spots",
    redirectTo: "map",
    pathMatch: "full",
    data: { routeName: "Spot map" },
  },
  {
    path: "map/:spot/edits",
    redirectTo: "map/spots/:spot/edits",
    pathMatch: "full",
    data: { routeName: "Spot map (legacy redirect)" },
  },
  {
    path: "map/:spot/c/:challenge",
    redirectTo: "map/spots/:spot/c/:challenge",
    pathMatch: "full",
    data: { routeName: "Challenge (legacy redirect)" },
  },
  {
    path: "map/:spot/c",
    redirectTo: "map/spots/:spot/c",
    pathMatch: "full",
    data: { routeName: "Spot challenges (legacy redirect)" },
  },
  {
    path: "map/:spot",
    redirectTo: "map/spots/:spot",
    pathMatch: "full",
    data: { routeName: "Spot map (legacy redirect)" },
  },

  // Posts
  // { path: "feed", component: HomePageComponent, data: { routeName: "Feed" } },
  // {
  //   path: "p/:postId",
  //   redirectTo: "post/:postId",
  // },
  // {
  //   path: "post/:postId",
  //   component: PostPageComponent,
  //   data: { routeName: "Post" },
  // },

  // Map page. Spot detail routes are namespaced under /map/spots so they
  // don't collide with other map-backed surfaces such as events/communities.
  {
    path: "map",
    loadComponent: () =>
      import("./components/map-page/map-page.component").then(
        (m) => m.MapPageComponent
      ),
    resolve: { content: contentResolver },
    children: [
      {
        path: "spots/:spot",
        loadComponent: () =>
          import("./components/map-page/map-page.component").then(
            (m) => m.MapPageComponent
          ),
        resolve: { content: contentResolver },
        children: [
          {
            path: "edits",
            loadComponent: () =>
              import("./components/map-page/map-page.component").then(
                (m) => m.MapPageComponent
              ),
            resolve: { content: contentResolver },
          },
          {
            path: "c",
            loadComponent: () =>
              import("./components/map-page/map-page.component").then(
                (m) => m.MapPageComponent
              ),
            resolve: { content: contentResolver },
            children: [
              {
                path: ":challenge",
                loadComponent: () =>
                  import("./components/map-page/map-page.component").then(
                    (m) => m.MapPageComponent
                  ),
                resolve: { content: contentResolver },
              },
            ],
          },
        ],
      },
    ],
  },

  {
    path: "s/:slug",
    redirectTo: "map/spots/:slug",
    pathMatch: "full",
    data: { routeName: "Spot map" },
  },
  {
    path: "kml-import",
    loadComponent: () =>
      import("./components/kml-import-page/kml-import-page.component").then(
        (m) => m.KmlImportPageComponent
      ),
    data: { routeName: "KML Import" },
  },

  // Embedded stuff
  {
    path: "embed",
    loadComponent: () =>
      import("./components/embedding/embed-page/embed-page.component").then(
        (m) => m.EmbedPageComponent
      ),
    data: { routeName: "Embed" },
  },
  // {
  //   path: "embed/spot",
  //   redirectTo: "embed",
  //   pathMatch: "full",
  //   data: { routeName: "Embed" },
  // },
  // {
  //   path: "embed/map",
  //   redirectTo: "embed",
  //   pathMatch: "full",
  //   data: { routeName: "Embed" },
  // },
  // {
  //   path: "embedded/spot/:spot",
  //   component: EmbeddedSpotPageComponent,
  //   data: { routeName: "Embedded Spot" },
  // },
  {
    path: "embedded/event/:eventID",
    redirectTo: (route) => {
      const showHeader = route.queryParams["showHeader"];
      const query = showHeader !== undefined ? `?showHeader=${showHeader}` : "";
      return `/embedded/events/${route.params["eventID"]}${query}`;
    },
    pathMatch: "full",
    data: { routeName: "Embedded Event" },
  },
  {
    path: "embedded/events/:eventID",
    loadComponent: () =>
      import("./components/event-page/event-page.component").then(
        (m) => m.EventPageComponent
      ),
    data: { routeName: "Embedded Event" },
  },
  {
    path: "embedded/map",
    loadComponent: () =>
      import(
        "./components/embedding/embedded-map-page/embedded-map-page.component"
      ).then((m) => m.EmbeddedMapPageComponent),
    data: { routeName: "Embedded Map" },
  },

  // Events
  {
    path: "events",
    loadComponent: () =>
      import("./components/events-page/events-page.component").then(
        (m) => m.EventsPageComponent
      ),
    resolve: { content: contentResolver },
    data: { routeName: "Events" },
  },
  {
    path: "event/swissjam25",
    redirectTo: "events/swissjam25",
    pathMatch: "full",
    data: { routeName: "Event" },
  },
  {
    path: "events/swissjam25",
    loadComponent: () =>
      import("./components/event-page/event-page.component").then(
        (m) => m.EventPageComponent
      ),
    resolve: { content: contentResolver },
    data: { routeName: "Event" },
  },
  {
    path: "e/:slug",
    redirectTo: "events/:slug",
    pathMatch: "full",
    data: { routeName: "Event" },
  },
  {
    path: "events/:slug",
    loadComponent: () =>
      import("./components/event-page/event-page.component").then(
        (m) => m.EventPageComponent
      ),
    resolve: { content: contentResolver },
    data: { routeName: "Event" },
  },

  // Community, Groups, Teams, Sessions
  //   {
  //     path: "community",
  //     component: CommunityPageComponent,
  //     data: { routeName: "Community" },
  //   },
  //   {
  //     path: "g/:groupID",
  //     component: CommunityPageComponent,
  //     data: { routeName: "Group" },
  //   },
  //   {
  //     path: "team/:teamID",
  //     component: CommunityPageComponent,
  //     data: { routeName: "Team" },
  //   },

  // Wiki page
  //   { path: "wiki", component: WikiPageComponent, data: { routeName: "Wiki" } },

  // Profiles and sign-in flow
  {
    path: "profile",
    loadComponent: () =>
      import("./components/profile-page/profile-page.component").then(
        (m) => m.ProfilePageComponent
      ),
    resolve: { content: contentResolver },
    data: { routeName: "Profile" },
  },
  {
    path: "u/:userID",
    loadComponent: () =>
      import("./components/profile-page/profile-page.component").then(
        (m) => m.ProfilePageComponent
      ),
    resolve: { content: contentResolver },
    data: { routeName: "Profile" },
  },
  {
    path: "account",
    loadComponent: () =>
      import("./components/sign-in-page/sign-in-page.component").then(
        (m) => m.SignInPageComponent
      ),
    data: { routeName: "Account" },
  },
  {
    path: "sign-in",
    redirectTo: (route) => {
      const query = new URLSearchParams(
        Object.entries(route.queryParams).flatMap(([key, value]) => {
          if (Array.isArray(value)) {
            return value.map((item) => [key, String(item)] as [string, string]);
          }
          if (value === undefined || value === null) {
            return [];
          }
          return [[key, String(value)] as [string, string]];
        })
      ).toString();
      return query ? `/account?${query}` : "/account";
    },
    pathMatch: "full",
  },
  {
    path: "sign-up",
    loadComponent: () =>
      import("./components/sign-up-page/sign-up-page.component").then(
        (m) => m.SignUpPageComponent
      ),
    data: { routeName: "Sign-up" },
  },
  {
    path: "forgot-password",
    loadComponent: () =>
      import(
        "./components/forgot-password-page/forgot-password-page.component"
      ).then((m) => m.ForgotPasswordPageComponent),
    data: { routeName: "Forgot password" },
  },

  // Settings
  {
    path: "settings",
    loadComponent: () =>
      import("./components/settings-page/settings-page.component").then(
        (m) => m.SettingsPageComponent
      ),
    data: { routeName: "Settings" },
  },
  {
    path: "settings/:tab",
    loadComponent: () =>
      import("./components/settings-page/settings-page.component").then(
        (m) => m.SettingsPageComponent
      ),
    data: { routeName: "Settings" },
  },

  // Other
  {
    path: "about",
    loadComponent: () =>
      import("./components/about-page/about-page.component").then(
        (m) => m.AboutPageComponent
      ),
    resolve: { content: contentResolver },
    data: { routeName: "About", acceptanceFree: true },
  },
  {
    path: "support",
    loadComponent: () =>
      import("./components/support-page/support-page.component").then(
        (m) => m.SupportPageComponent
      ),
    resolve: { content: contentResolver },
    data: { routeName: "Support", acceptanceFree: true },
  },
  {
    path: "terms-of-service",
    loadComponent: () =>
      import("./components/terms-of-service/terms-of-service.component").then(
        (m) => m.TermsOfServiceComponent
      ),
    resolve: { content: contentResolver },
    data: { routeName: "Terms of Service", acceptanceFree: true },
  },
  { path: "tos", redirectTo: "terms-of-service", pathMatch: "full" },
  {
    path: "privacy-policy",
    loadComponent: () =>
      import("./components/privacy-policy/privacy-policy.component").then(
        (m) => m.PrivacyPolicyComponent
      ),
    resolve: { content: contentResolver },
    data: { routeName: "Privacy Policy", acceptanceFree: true },
  },
  { path: "pp", redirectTo: "privacy-policy", pathMatch: "full" },
  {
    path: "impressum",
    pathMatch: "full",
    component: undefined,
    loadComponent: () =>
      import("./components/impressum/impressum.component").then(
        (m) => m.ImpressumComponent
      ),
    resolve: { content: contentResolver },
    data: { routeName: "Impressum", acceptanceFree: true },
  },

  // Secret leaderboard page (no nav button)
  {
    path: "leaderboard",
    loadComponent: () =>
      import("./components/leaderboard-page/leaderboard-page.component").then(
        (m) => m.LeaderboardPageComponent
      ),
    data: { routeName: "Leaderboard" },
  },

  // Firebase Auth Action Handler (email verification, password reset, etc.)
  // Firebase sends links to /__/auth/action with query params
  {
    path: "__/auth/action",
    loadComponent: () =>
      import("./components/auth-action-page/auth-action-page.component").then(
        (m) => m.AuthActionPageComponent
      ),
    data: { routeName: "Auth Action" },
  },

  {
    path: "**",
    loadComponent: () =>
      import("./components/not-found-page/not-found-page.component").then(
        (m) => m.NotFoundPageComponent
      ),
  },
];
