# Map imagery for Spot share cards

Status: idea only. No implementation approved. Recorded 2026-09-30.
Outside the 1.2 release scope. Recheck provider terms before implementation.

## Intended experience

Use an overhead image as a fallback when a Spot has no suitable photos:

- If bounds exist, outline the Spot and frame the entire area with some padding.
- Otherwise, center closely on its location and show a pin.
- Preserve enough surrounding context to recognize the place.
- Keep provider attribution legible, outside title gradients and the PK Spot logo.
- Prefer actual Spot photos, then suitable map imagery, then the existing wireframe.

Street View could be another option, but the nearest panorama may face the wrong
way or show an obstruction. Coverage and camera selection require separate work.

## Provider assessment

| Provider | Technical fit | Reuse assessment |
| --- | --- | --- |
| Google Maps satellite | Static Maps supports satellite imagery, polygons, markers and close framing. | Do not assume permission to store and redistribute composite share cards. Platform restrictions cover caching, rehosting and resharing. |
| Google Street View | Static API supports location, heading and field of view. | Screenshot, extraction and storage restrictions make permanent exported cards a poor fit without confirmation for this exact use. |
| Apple Maps | Maps Web Snapshots supports satellite imagery. | Apple generally limits caching/storage to temporary permitted use. Permanent composite-card distribution has not been confirmed. |
| Mapbox | Static Images supports satellite styles, bounds, padding and overlays. | Promising global candidate. HTTP cache support does not establish permanent storage or redistribution rights. Current product terms and the exact workflow still need verification. |
| OpenStreetMap | Suitable for a rendered street/building map with our Spot outline. OSM itself supplies no satellite imagery. | OSM data reuse is possible with licence obligations and attribution. Tile hosting and imagery from other providers have separate terms. Use our own rendering or a provider permitting exports. |
| swisstopo SWISSIMAGE | Swiss aerial photography provides the desired overhead view. | Strong Swiss option: open geodata may be published and used commercially with attribution, such as © swisstopo. Respect geoservice operating limits and check the selected dataset. |

Possible direction: swisstopo imagery for Switzerland, an appropriately licensed
global provider elsewhere, and an OSM-based rendered map as a universal fallback.
This is a proposal, not a chosen architecture.

## Questions before implementation

1. Can we generate a branded PNG, retain it in our storage, and serve it as
   og:image for third-party preview caching and user sharing?
2. Does permission include satellite imagery and the provider's imagery suppliers?
3. Are cropping, text overlays, compositing, and long-lived external copies allowed?
4. What attribution must remain visible at chat-preview size?
5. What are the request costs, storage limits, refresh rules and coverage quality?
6. How do we fall back when imagery is missing or too coarse?

Keep Google/Apple API display permission distinct from permission to redistribute
a stored card. Do not treat Mapbox's cache headers as a blanket export licence.
No provider outreach has been sent.

## Sources

Research links reviewed in the conversation on 2026-09-30:

- [Google Static Maps](https://developers.google.com/maps/documentation/maps-static/start)
- [Google Maps Platform terms, section 3.2.3](https://cloud.google.com/maps-platform/terms)
- [Google imagery guidelines](https://about.google/brand-resource-center/products-and-services/geo-guidelines/)
- [Apple Maps Web Snapshots](https://developer.apple.com/documentation/snapshots)
- [Apple Developer agreement, Maps attachment](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)
- [Mapbox Static Images API](https://docs.mapbox.com/api/maps/static-images/)
- [Mapbox product terms](https://www.mapbox.com/legal/product-terms)
- [OSM copyright and licence](https://www.openstreetmap.org/copyright)
- [OSM explanation of satellite imagery](https://help.openstreetmap.org/questions/6849/how-can-i-see-the-aerial-imagery-without-editing-the-map/)
- [swisstopo open-geodata reuse FAQ](https://www.swisstopo.admin.ch/en/faq-free-geodata)
