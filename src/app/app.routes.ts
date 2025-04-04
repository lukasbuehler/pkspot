import { NgModule } from "@angular/core";
import { Routes, RouterModule } from "@angular/router";
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

export const routes: Routes = [
  // Home page (redirects to spot map)
  { path: "", redirectTo: "map", pathMatch: "full" },

  // Map page
  { path: "map", component: MapPageComponent, data: { routeName: "Spot map" } },
  {
    path: "map/:spot", // :spot is a spot ID or a spot slug
    component: MapPageComponent,
    data: { routeName: "Spot map" },
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
    data: { routeName: "Events" },
  },
  {
    // path: "events/:eventID",
    path: "events/swissjam25",
    component: EventPageComponent,
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
    data: { routeName: "Profile" },
  },
  {
    path: "u/:userID",
    component: ProfilePageComponent,
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
    data: { routeName: "About" },
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
    data: { routeName: "Terms of Service", acceptanceFree: true },
  },
  { path: "tos", redirectTo: "terms-of-service", pathMatch: "full" },
  {
    path: "privacy-policy",
    component: PrivacyPolicyComponent,
    data: { routeName: "Privacy Policy", acceptanceFree: true },
  },
  { path: "pp", redirectTo: "privacy-policy", pathMatch: "full" },
  { path: "**", component: NotFoundPageComponent },
];
