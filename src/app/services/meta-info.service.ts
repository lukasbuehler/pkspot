import { isPlatformServer } from "@angular/common";
import { inject, Injectable, LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";

@Injectable({
  providedIn: "root",
})
export class MetaInfoService {
  locale: string = inject(LOCALE_ID);
  platformId = inject(PLATFORM_ID);

  isServer: boolean;

  constructor(private meta: Meta, private titleService: Title) {
    this.isServer = isPlatformServer(this.platformId);
  }

  public setMetaTags(title: string, image_src: string, description: string) {
    image_src = image_src.trim();

    // Title
    this.titleService.setTitle(title);
    this.meta.updateTag({
      property: "og:title",
      content: title,
    });
    this.meta.updateTag({
      name: "twitter:title",
      content: title,
    });

    // Image
    this.meta.updateTag({
      property: "og:image",
      content: image_src,
    });
    this.meta.updateTag({
      name: "twitter:image",
      content: image_src,
    });

    // Description
    this.meta.updateTag({
      name: "description",
      content: description,
    });
    this.meta.updateTag({
      property: "og:description",
      content: description,
    });
    this.meta.updateTag({
      name: "twitter:description",
      content: description,
    });
  }
}
