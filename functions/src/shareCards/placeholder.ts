/** Visible face boundaries from src/assets/spot_placeholder.png.
 * Preserve occlusion: do not connect corners across openings or hidden faces. */
export const spotPlaceholderWireframe = `<g transform="translate(350 -20) scale(1.12)"
  fill="none" stroke="#b9bdff" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity=".23">
  <!-- Rear wall and pillars. Lower edges stop where foreground walls occlude them. -->
  <path d="M0 263 137 245V205H180V239L284 227V199H349V226L585 228V201H642V230L800 233
    M146 205V244 M290 199V313 M307 199V314 M349 199V226
    M0 425 220 344 M391 262 584 264 M434 272 654 274 M595 308 800 312"/>
  <!-- Left enclosure: top rim, inner wall, and solid front face. -->
  <path d="M221 344 317 310 328 316 433 271 517 270 495 290V324
    M241 341 317 315V344 M328 316V345
    M328 319 434 274V307L398 323 M434 307 455 307 456 304H485V319
    M434 274 506 273 495 287 M517 270V308L495 324
    M221 344 444 352V418L222 408Z M241 341 398 347
    M398 347V323L550 329 M398 323 495 324"/>
  <!-- Rear cross-wall. Its underside steps down behind the stair flight. -->
  <path d="M517 308H568L560 329 M568 308V326 M568 315H594V328
    M550 329 720 336 711 319 703 318 713 332 550 329
    M550 329 549 362 627 366 628 377 667 379 670 391 720 393 721 367 800 370
    M720 336 800 339"/>
  <!-- Central descending wall. Separate inner and outer edges, with no diagonal across the opening. -->
  <path d="M444 352 537 330 550 330 416 600H384L537 330
    M550 330V362L467 600 M444 359 523 361"/>
  <!-- Stair treads stop against the central and right-hand walls. -->
  <path d="M446 381 518 383 M446 393 513 395 M446 402 509 404
    M544 384 626 386V399L539 397
    M538 408 633 410 M537 421 634 424 M651 411 676 413V427L651 426"/>
  <!-- Short right-hand stair wall and its top cap. -->
  <path d="M635 389 648 389 654 467V533L568 530 569 459 635 460Z
    M635 389V460 M569 459 649 463 648 389 M569 465 654 467"/>
</g>`;
