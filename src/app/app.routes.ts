import { Routes } from "@angular/router";
import { contentResolver } from "./resolvers/content.resolver";
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

  // Map page (single matcher for all map routes)
  {
    path: "map",
    loadComponent: () =>
      import("./components/map-page/map-page.component").then(
        (m) => m.MapPageComponent
      ),
    resolve: { content: contentResolver },
    children: [
      {
        path: ":spot",
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
    redirectTo: "map/:slug",
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
    path: "sign-in",
    loadComponent: () =>
      import("./components/sign-in-page/sign-in-page.component").then(
        (m) => m.SignInPageComponent
      ),
    data: { routeName: "Sign-in" },
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
