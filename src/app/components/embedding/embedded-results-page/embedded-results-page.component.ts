import { ChangeDetectionStrategy, Component, computed, inject, LOCALE_ID, resource } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { SpotListComponent } from '../../spot-list/spot-list.component';
import { SpotMapComponent } from '../../spot-map/spot-map.component';
import { EventCardComponent } from '../../event-card/event-card.component';
import { EntityPreviewCardComponent } from '../../entity-preview-card/entity-preview-card.component';
import { SpotSelectionDataService } from '../../../services/spot-selection-data.service';
import { EventsService } from '../../../services/firebase/firestore/events.service';
import { LandingPagesService, CommunityLandingPageData } from '../../../services/firebase/firestore/landing-pages.service';
import { parseEmbedReferences } from '../../../shared/embed-selection';
import { LocaleCode } from '../../../../db/models/Interfaces';
import { Spot, LocalSpot } from '../../../../db/models/Spot';
import { SpotPreviewData } from '../../../../db/schemas/SpotPreviewData';
import { Event as PkEvent } from '../../../../db/models/Event';

type EmbeddedItem = { kind: 'spot'; value: Spot } | { kind: 'event'; value: PkEvent } | { kind: 'community'; value: CommunityLandingPageData };

@Component({
  selector: 'app-embedded-results-page',
  imports: [MatButtonModule, SpotListComponent, SpotMapComponent, EventCardComponent, EntityPreviewCardComponent],
  templateUrl: './embedded-results-page.component.html',
  styleUrl: './embedded-results-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmbeddedResultsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly spotData = inject(SpotSelectionDataService);
  private readonly events = inject(EventsService);
  private readonly communities = inject(LandingPagesService);
  private readonly locale = inject<LocaleCode>(LOCALE_ID);
  readonly params = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly selection = computed(() => parseEmbedReferences(this.params().get('refs')));
  readonly showMap = computed(() => this.params().get('showMap') !== 'false');
  readonly results = resource({
    params: () => this.selection(),
    loader: async ({ params, abortSignal }) => {
      // Services use the normal public read path. Never accept arbitrary card HTML or API URLs.
      const settled = await Promise.allSettled(params.map(async (ref): Promise<EmbeddedItem | null> => {
        if (abortSignal.aborted) return null;
        if (ref.kind === 'spot') return { kind: 'spot', value: await this.spotData.resolve(ref.id, this.locale) };
        if (ref.kind === 'event') {
          const event = await this.events.getEventBySlugOrId(ref.id);
          return event?.published && event.visibility === 'public' && event.discoverability.audience === 'global' && !event.viewerPolicy
            ? { kind: 'event', value: event } : null;
        }
        const community = await this.communities.getCommunityPage(ref.id);
        return community && !community.notFound ? { kind: 'community', value: community } : null;
      }));
      return { items: settled.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []),
        unavailable: settled.filter(result => result.status === 'rejected' || !result.value).length };
    },
  });
  readonly items = computed(() => this.results.hasValue() ? this.results.value().items : []);
  readonly spots = computed(() => this.items().flatMap(item => item.kind === 'spot' ? [item.value] : []));
  readonly eventCards = computed(() => this.items().flatMap(item => item.kind === 'event' ? [item.value] : []));
  readonly communityCards = computed(() => this.items().flatMap(item => item.kind === 'community' ? [item.value] : []));
  readonly spotPreviews = computed(() => this.spots().map(spot => spot.makePreviewData()));
  readonly center = computed(() => this.spots()[0]?.location() ?? null);

  openSpot(spot: Spot | LocalSpot | SpotPreviewData): void {
    const id = 'id' in spot ? spot.id : undefined;
    if (id) this.open(`/map/spots/${encodeURIComponent(id)}`);
  }
  openEvent(event: PkEvent): void { this.open(`/events/${encodeURIComponent(event.slug ?? event.id)}`); }
  open(path: string): void {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return;
    window.open(new URL(path, window.location.origin).href, '_blank', 'noopener,noreferrer');
  }
}
