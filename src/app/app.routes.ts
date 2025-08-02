import { NgModule } from "@angular/core";
import { Routes, RouterModule, UrlSegment, Route } from "@angular/router";
import { HomePageComponent } from "./home-page/home-page.component";
import { NotFoundPageComponent } from "./not-found-page/not-found-page.component";
import { MapPageComponent } from "./map-page/map-page.component";
import { SignInPageComponent } from "./sign-in-page/sign-in-page.component";
import { AboutPageComponent } from "./about-page/about-page.component";
import { KmlImportPageComponent } from "./kml-import-page/kml-import-page.component";
import { PostPageComponent } from "./post-page/post-page.component";
import { ProfilePageComponent } from "./profile-page/profile-page.component";
import { SignUpPageComponent } from "./sign-up-page/sign-up-page.component";
import { TermsOfServiceComponent } from "./terms-of-service/terms-of-service.component";
import { PrivacyPolicyComponent } from "./privacy-policy/privacy-policy.component";
import { SettingsPageComponent } from "./settings-page/settings-page.component";
import { ForgotPasswordPageComponent } from "./forgot-password-page/forgot-password-page.component";
import { EmbedPageComponent } from "./embedding/embed-page/embed-page.component";
import { EventPageComponent } from "./event-page/event-page.component";
import { EmbeddedSpotPageComponent } from "./embedding/embedded-spot-page/embedded-spot-page.component";
import { EmbeddedMapPageComponent } from "./embedding/embedded-map-page/embedded-map-page.component";
import { EventsPageComponent } from "./events-page/events-page.component";
import { ImpressumComponent } from "./impressum/impressum.component";
import { contentResolver } from "./resolvers/content.resolver";

export const routes: Routes = [
  // Home page (redirects to spot map)
  {
    path: "",
    redirectTo: "map",
    pathMatch: "full",
    resolve: { content: contentResolver },
  },

  // Map page (single matcher for all map routes)
  {
    path: "map",
    component: MapPageComponent,
    resolve: { content: contentResolver },
    children: [
      {
        path: ":spot",
        component: MapPageComponent,
        resolve: { content: contentResolver },
        children: [
          {
            path: "c",
            component: MapPageComponent,
            resolve: { content: contentResolver },
            children: [
              {
                path: ":challenge",
                component: MapPageComponent,
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
    component: KmlImportPageComponent,
    data: { routeName: "KML Import" },
  },

  // Embedded stuff
  {
    path: "embed",
    component: EmbedPageComponent,
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
    component: EventPageComponent,
    data: { routeName: "Embedded Event" },
  },
  {
    path: "embedded/map",
    component: EmbeddedMapPageComponent,
    data: { routeName: "Embedded Map" },
  },

  // Events
  {
    path: "events",
    component: EventsPageComponent,
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
    component: EventPageComponent,
    resolve: { content: contentResolver },
    data: { routeName: "Event" },
  },
  {
    path: "e/:slug",
    redirectTo: "events/:slug",
    pathMatch: "full",
    data: { routeName: "Event" },
  },

  // Posts
  // { path: "posts", component: HomePageComponent, data: { routeName: "Posts" } },
  // {
  //   path: "p/:postId",
  //   redirectTo: "post/:postId",
  // },
  // {
  //   path: "post/:postId",
  //   component: PostPageComponent,
  //   data: { routeName: "Post" },
  // },

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
    component: ProfilePageComponent,
    resolve: { content: contentResolver },
    data: { routeName: "Profile" },
  },
  {
    path: "u/:userID",
    component: ProfilePageComponent,
    resolve: { content: contentResolver },
    data: { routeName: "Profile" },
  },
  {
    path: "sign-in",
    component: SignInPageComponent,
    data: { routeName: "Sign-in" },
  },
  {
    path: "sign-up",
    component: SignUpPageComponent,
    data: { routeName: "Sign-up" },
  },
  {
    path: "forgot-password",
    component: ForgotPasswordPageComponent,
    data: { routeName: "Forgot password" },
  },

  // Settings
  {
    path: "settings",
    component: SettingsPageComponent,
    data: { routeName: "Settings" },
  },
  {
    path: "settings/:tab",
    component: SettingsPageComponent,
    data: { routeName: "Settings" },
  },

  // Other
  {
    path: "about",
    component: AboutPageComponent,
    resolve: { content: contentResolver },
    data: { routeName: "About", acceptanceFree: true },
  },
  {
    path: "welcome",
    redirectTo: "",
    pathMatch: "full",
    data: { routeName: "Welcome" },
  }, //component: WelcomePageComponent },
  {
    path: "terms-of-service",
    component: TermsOfServiceComponent,
    resolve: { content: contentResolver },
    data: { routeName: "Terms of Service", acceptanceFree: true },
  },
  { path: "tos", redirectTo: "terms-of-service", pathMatch: "full" },
  {
    path: "privacy-policy",
    component: PrivacyPolicyComponent,
    resolve: { content: contentResolver },
    data: { routeName: "Privacy Policy", acceptanceFree: true },
  },
  { path: "pp", redirectTo: "privacy-policy", pathMatch: "full" },
  {
    path: "impressum",
    pathMatch: "full",
    component: ImpressumComponent,
    resolve: { content: contentResolver },
    data: { routeName: "Impressum", acceptanceFree: true },
  },

  { path: "**", component: NotFoundPageComponent },
];
