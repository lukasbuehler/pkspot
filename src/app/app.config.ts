import { ApplicationConfig, importProvidersFrom } from "@angular/core";
import { environment } from "../environments/environment";
import { provideFunctions, getFunctions } from "@angular/fire/functions";
import { GoogleMapsModule } from "@angular/google-maps";
import { VgBufferingModule } from "@videogular/ngx-videogular/buffering";
import { VgOverlayPlayModule } from "@videogular/ngx-videogular/overlay-play";
import { VgControlsModule } from "@videogular/ngx-videogular/controls";
import { VgCoreModule } from "@videogular/ngx-videogular/core";
import { MatRadioModule } from "@angular/material/radio";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { DragDropModule } from "@angular/cdk/drag-drop";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatTableModule } from "@angular/material/table";
import { MatChipsModule } from "@angular/material/chips";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatDividerModule } from "@angular/material/divider";
import { MatStepperModule } from "@angular/material/stepper";
import { MatListModule } from "@angular/material/list";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatRippleModule, MatNativeDateModule } from "@angular/material/core";
import { MatInputModule } from "@angular/material/input";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatTabsModule } from "@angular/material/tabs";
import { MatCardModule } from "@angular/material/card";
import { MatSidenavModule } from "@angular/material/sidenav";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatBadgeModule } from "@angular/material/badge";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatButtonModule } from "@angular/material/button";
import { provideAnimations } from "@angular/platform-browser/animations";
import { provideStorage, getStorage } from "@angular/fire/storage";
import { provideFirestore, getFirestore } from "@angular/fire/firestore";
import { provideAuth, getAuth } from "@angular/fire/auth";
import { provideFirebaseApp, initializeApp } from "@angular/fire/app";
import {
  withInterceptorsFromDi,
  provideHttpClient,
  withFetch,
} from "@angular/common/http";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import {
  provideClientHydration,
  BrowserModule,
  HammerModule,
  withI18nSupport,
} from "@angular/platform-browser";
import {
  MAT_DIALOG_DEFAULT_OPTIONS,
  MatDialogModule,
} from "@angular/material/dialog";

import { routes } from "./app.routes";
import { provideRouter } from "@angular/router";
import { WINDOW, windowProvider } from "./providers/window";
import { DOCUMENT } from "@angular/common";

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirebaseApp(() => initializeApp(environment.keys.firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
    provideFunctions(() => getFunctions()),
    // provideAuth(() => getAuth()),
    provideRouter(routes),
    BrowserModule,
    GoogleMapsModule,
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: { hasBackdrop: false } },
    provideClientHydration(withI18nSupport()),
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    provideAnimations(),
    {
      provide: WINDOW,
      useFactory: (document: Document) => windowProvider(document),
      deps: [DOCUMENT],
    },
  ],
};
