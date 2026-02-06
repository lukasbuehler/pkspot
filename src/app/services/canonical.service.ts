import { Injectable, Inject, LOCALE_ID } from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { Router } from "@angular/router";
import { environment } from "../../environments/environment";

@Injectable({
  providedIn: "root",
})
export class CanonicalService {
  private readonly availableLanguageCodes = [
    "en",
    "de",
    "de-CH",
    "fr",
    "it",
    "es",
    "nl",
  ];

  constructor(
    @Inject(DOCUMENT) private dom: Document,
    @Inject(LOCALE_ID) private locale: string,
    private router: Router
  ) {}

  setCanonicalURL() {
    // 1. Get the current clean path (remove query params)
    // router.url includes the path starting from base href root.
    // e.g. /map
    const cleanPath = this.router.url.split("?")[0];

    // 2. Construct the absolute URL for the *current* locale (Self-referencing canonical)
    // Assumption: environment.baseUrl is 'https://pkspot.app'
    // Assumption: Each locale is served at /locale_code/
    // We need to normalize the locale. LOCALE_ID should match the path prefix.
    const currentUrl = this.createUrlForLocale(this.locale, cleanPath);

    // 3. Update or create <link rel="canonical">
    this.updateLinkTag("canonical", currentUrl);

    // 4. Update or create <link rel="alternate" hreflang="..."> for ALL languages
    this.availableLanguageCodes.forEach((langCode) => {
      const url = this.createUrlForLocale(langCode, cleanPath);
      this.updateLinkTag("alternate", url, langCode);
    });

    // 5. Add x-default
    // Pointing x-default to the root (which usually handles language negotiation or defaults to English)
    // or pointing to English directly.
    // Let's point to the English version for simplicity as x-default for now, or the root if the app supports it.
    // Given the sitemap usually points to locale-specifics, let's use 'en' as default or just not set it if unsure.
    // Better practice: x-default to a language selector or valid page.
    // Let's omit x-default for this pass unless requested, to avoid redirect loops if not configured on server.
    // Actually, user asked "how can we tell google that there are different languages?". Hreflang is the answer.
  }

  private createUrlForLocale(locale: string, path: string): string {
    // Ensure path starts with /
    if (!path.startsWith("/")) {
      path = "/" + path;
    }

    // Construct: https://pkspot.app + / + en + /map
    // environment.baseUrl usually doesn't have trailing slash.
    return `${environment.baseUrl}/${locale}${path}`;
  }

  private updateLinkTag(rel: string, href: string, hreflang?: string) {
    let selector = `link[rel="${rel}"]`;
    if (hreflang) {
      selector += `[hreflang="${hreflang}"]`;
    }

    let link: HTMLLinkElement | null = this.dom.querySelector(selector);

    if (!link) {
      link = this.dom.createElement("link");
      link.setAttribute("rel", rel);
      if (hreflang) {
        link.setAttribute("hreflang", hreflang);
      }
      this.dom.head.appendChild(link);
    }

    link.setAttribute("href", href);
  }
}
