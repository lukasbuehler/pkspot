/** Visible face boundaries from src/assets/spot_placeholder.png.
 * Preserve occlusion: do not connect corners across openings or hidden faces. */
const spotPlaceholderWireframe = `<g transform="translate(350 -20) scale(1.12)"
  fill="none" stroke="#b9bdff" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity=".23">
  <!-- Rear wall and pillars. Lower edges stop where foreground walls occlude them. -->
  <path d="M0 263 137 245V205H180V239L284 227V199H349V226L585 228V201H642V230L800 233
    M146 205V244 M290 199V319 M307 199V314 M349 199V226
    M0 425 221 344"/>
  <!-- Left enclosure: top rim, inner wall, and solid front face. -->
  <path d="M221 344 317 310 328 316 433 271 517 270 495 290V324
    M241 341 317 315V344 M328 316V345
    M328 316 434 274V307L398 323 M434 307 455 307 456 304H485V319
    M434 274 506 273 495 290 M517 270V308L495 324
    M221 344 444 352V418L222 408Z M241 341 398 347
    M398 347V323L550 329 M398 323 495 324"/>
  <!-- Rear cross-wall. Its underside steps down behind the stair flight. -->
  <path d="M517 308H568L560 329 M568 308V329 M568 315H594V330
    M550 329 720 336 711 319 703 318 713 332 550 329
    M550 329 549 362 627 366 628 377 667 379 670 391 720 393 721 367 800 370
    M720 336 800 339"/>
  <!-- Stair treads stop against the central and right-hand walls. -->
  <path d="M446 381 518 383 M446 393 513 395 M446 402 509 404
    M544 384 626 386V399L539 397
    M538 408 633 410 M537 421 634 424 M651 411 676 413V427L651 426"/>
  <!-- Short right-hand stair wall and its top cap. -->
  <path d="M635 389 648 389 654 467V533L568 530 569 459 635 460Z
    M635 389V460 M569 459 649 463 648 389 M569 465 654 467"/>
  <!-- Draw the continuous divider last. Its solid faces hide stair edges behind it. -->
  <path fill="#18191f" d="M550 330V362L467 600H416Z"/>
  <path fill="#18191f" d="M537 330H550L416 600H384Z"/>
</g>`;


// Each entity keeps its own visual cue, with the same subdued stroke treatment.
const linework = (body: string): string => `<g fill="none" stroke="#b9bdff" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" opacity=".23">${body}</g>`;
const eventPlaceholder = linework(`
  <rect x="690" y="180" width="430" height="350" rx="28"/>
  <path d="M690 270H1120 M790 150V210 M1020 150V210"/>
  <path d="M755 330H810 M865 330H920 M975 330H1030
    M755 400H810 M865 400H920 M975 400H1030 M755 470H810 M865 470H920"/>`);
const profilePlaceholder = linework(`
  <circle cx="910" cy="305" r="200"/>
  <circle cx="910" cy="260" r="65"/>
  <path d="M764 440C785 328 1035 328 1056 440"/>`);
const communityPlaceholder = linework(`
  <path d="M650 520V330L745 270 840 330V520
    M675 345 745 300 815 345 M745 300V520
    M840 520V230L960 170 1080 230V520 M840 230 960 290 1080 230 M960 290V520
    M1080 520V365L1170 320 1260 365 M1080 365 1170 410V520
    M610 520H1200"/>
  <path d="M880 295V330 M920 315V350 M880 375V410 M920 395V430
    M1000 305V340 M1040 285V320 M1000 385V420 M1040 365V400
    M700 375V410 M785 375V410"/>`);
const pagePlaceholder = linework(`
  <path d="M710 630V335L890 235V530L1080 420V145L1200 75
    M620 630V465L800 360V565L1000 450V235L1200 120"/>`);

export const shareCardPlaceholders = {
  spot: spotPlaceholderWireframe,
  event: eventPlaceholder,
  profile: profilePlaceholder,
  community: communityPlaceholder,
  page: pagePlaceholder,
};
