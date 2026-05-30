import admin from "firebase-admin";

const PROJECT_ID = "parkour-base-project";
const APPLY = process.argv.includes("--apply");

admin.initializeApp({ projectId: PROJECT_ID });

const db = admin.firestore();
const { FieldValue, GeoPoint, Timestamp } = admin.firestore;

const SPT_SOURCE = "https://www.swissparkourtour.ch/competitions/";
const SWISSJAM_SOURCE = "https://www.swissparkourtour.ch/swiss-jam-2026/";
const WPF_TICKET_URL =
  "https://eventfrog.ch/de/p/sport-fitness/sonstige-veranstaltungen/wpf-camp-2026-7433823537322835181.html";
const PKE_WORLDS_SOURCE = "https://parkourearth.org/world-championships2026";
const PKE_CALENDAR_SOURCE = "https://parkourearth.org/qualification-calendar";
const SPL_SOURCE = "https://www.sportparkourleague.com/2026-spl-season";

const qualifierRefs = [
  eventRef("parkour-expo-skill-2026"),
  eventRef("nurf-skill-2026"),
  eventRef("parkour-luzern-speed-2026"),
  eventRef("parkour-day-staefa-2026"),
  eventRef("wpf-skills-competition-2026"),
];

const seriesDocs = [
  {
    id: "swiss-parkour-tour",
    data: {
      name: "Swiss Parkour Tour",
      slug: "swiss-parkour-tour",
      organizer: "Swiss Parkour Association",
      organizer_url: "https://swissparkourassociation.ch/",
      url: SPT_SOURCE,
      logo_src: "assets/swissjam/spt_logo_orange_on_white.png",
      logo_background_color: "#ffffff",
      description:
        "Swiss competition system with qualifying events leading to the Swiss Parkour Championships.",
      published: true,
    },
  },
  {
    id: "parkour-earth",
    data: {
      name: "Parkour Earth",
      slug: "parkour-earth",
      url: "https://parkourearth.org/",
      logo_src: "assets/logos/parkour_earth.jpg",
      logo_background_color: "#ffffff",
      description:
        "Independent international parkour federation and organizer of the Parkour Earth World Championships.",
      published: true,
    },
  },
  {
    id: "sport-parkour-league",
    data: {
      name: "Sport Parkour League",
      slug: "sport-parkour-league",
      url: "https://www.sportparkourleague.com/",
      logo_background_color: "#f2e7ff",
      description:
        "International sport parkour competition league with sanctioned qualification routes.",
      published: true,
    },
  },
];

const eventDocs = [
  {
    slug: "swissjam26",
    data: {
      name: "Swiss Jam 2026",
      description:
        "Swiss Jam 2026 brings Switzerland's biggest Parkour event back to Zurich.\n\nA two-day festival of jams, workshops and the Swiss Parkour Championships - celebrating Parkour culture.\n\nWhether you're a beginner or a pro, join us to train, learn and get inspired.",
      description_i18n: localeMap({
        en: "Swiss Jam 2026 brings Switzerland's biggest Parkour event back to Zurich.\n\nA two-day festival of jams, workshops and the Swiss Parkour Championships - celebrating Parkour culture.\n\nWhether you're a beginner or a pro, join us to train, learn and get inspired.",
        de: "Swiss Jam 2026 bringt das groesste Parkour-Event der Schweiz zurueck nach Zuerich.\n\nEin zweitaegiges Festival mit Jams, Workshops und den Swiss Parkour Championships - eine Feier der Parkour-Kultur.\n\nEgal ob Beginner oder Pro: Komm vorbei, trainiere, lerne und lass dich inspirieren.",
      }),
      slug: "swissjam26",
      venue_string: "Irchelcampus, Universitat Zurich",
      locality_string: "Zurich (CH)",
      location: geo(47.3973, 8.5496),
      location_raw: latLng(47.3973, 8.5496),
      start: ts("2026-08-29T08:00:00.000Z"),
      end: ts("2026-08-30T14:00:00.000Z"),
      url: SWISSJAM_SOURCE,
      ticket_options: [
        swissJamTicket("2-day-pass", "2-Day Pass", 19.9, 29.9),
        swissJamTicket("saturday-pass", "Saturday Pass", 14.9, 19.9),
        swissJamTicket("sunday-pass", "Sunday Pass", 14.9, 19.9),
        {
          id: "kids-youth-single",
          label: "Kids & Youth Pass (single)",
          price: { amount: 39.9, currency: "CHF" },
          availability: "available",
          sale_ends_at: ts("2026-08-29T22:00:00.000Z"),
        },
        {
          id: "kids-youth-organisation",
          label: "Kids & Youth Pass (organisation)",
          price: { amount: 39.9, currency: "CHF" },
          availability: "available",
          sale_ends_at: ts("2026-08-29T22:00:00.000Z"),
        },
      ],
      event_categories: ["jam", "competition", "workshop"],
      time_zone: "Europe/Zurich",
      series_ids: ["swiss-parkour-tour", "parkour-earth"],
      series_memberships: [
        {
          series_id: "swiss-parkour-tour",
          role: "championship",
          disciplines: ["speed", "skill", "style"],
          qualification_required: true,
          qualification_hint:
            "Participation in the Swiss Parkour Championships requires qualification through Swiss Parkour Tour qualifying events.",
          required_qualifiers: qualifierRefs,
          source_url: SPT_SOURCE,
        },
        {
          series_id: "parkour-earth",
          role: "qualifier",
          disciplines: ["speed", "skill", "style"],
          qualification_required: true,
          qualification_hint:
            "This event is the Swiss qualification pathway toward the Parkour Earth World Championships.",
          qualifies_to: [eventRef("parkour-earth-world-championships-2026")],
          source_url: PKE_CALENDAR_SOURCE,
        },
      ],
      program: {
        active_plan_id: "main",
        plans: [
          {
            id: "main",
            label: "Main program",
            kind: "main",
            items: [
              {
                id: "saturday-kids-youth-workshops-morning",
                title: "Kids & Youth Workshops",
                category: "workshop",
                start: ts("2026-08-29T08:00:00.000Z"),
                end: ts("2026-08-29T10:00:00.000Z"),
              },
              {
                id: "saturday-jam-morning",
                title: "JAM",
                description: "Outdoor and open gym.",
                category: "jam",
                start: ts("2026-08-29T08:00:00.000Z"),
                end: ts("2026-08-29T11:00:00.000Z"),
              },
              {
                id: "swiss-jam-opening",
                title: "Swiss Jam Opening",
                category: "social",
                start: ts("2026-08-29T10:00:00.000Z"),
                end: ts("2026-08-29T11:00:00.000Z"),
              },
              {
                id: "speed-final",
                title: "Speed Final",
                category: "competition",
                start: ts("2026-08-29T11:00:00.000Z"),
                end: ts("2026-08-29T13:00:00.000Z"),
                participation: {
                  access: "invite_or_qualified",
                  qualification_required: true,
                  qualification_hint:
                    "Competing requires qualification through Swiss Parkour Tour qualifying events.",
                },
              },
              {
                id: "saturday-kids-youth-workshops-afternoon",
                title: "Kids & Youth Workshops",
                category: "workshop",
                start: ts("2026-08-29T11:00:00.000Z"),
                end: ts("2026-08-29T17:00:00.000Z"),
              },
              {
                id: "saturday-jam-afternoon",
                title: "JAM",
                description: "Outdoor and open gym.",
                category: "jam",
                start: ts("2026-08-29T12:00:00.000Z"),
                end: ts("2026-08-29T16:00:00.000Z"),
              },
              {
                id: "skill-final",
                title: "Skill Final",
                category: "competition",
                start: ts("2026-08-29T13:00:00.000Z"),
                end: ts("2026-08-29T15:00:00.000Z"),
                participation: {
                  access: "invite_or_qualified",
                  qualification_required: true,
                  qualification_hint:
                    "Competing requires qualification through Swiss Parkour Tour qualifying events.",
                },
              },
              {
                id: "style-final",
                title: "Style Final",
                category: "competition",
                start: ts("2026-08-29T15:00:00.000Z"),
                end: ts("2026-08-29T17:00:00.000Z"),
                participation: {
                  access: "invite_or_qualified",
                  qualification_required: true,
                  qualification_hint:
                    "Competing requires qualification through Swiss Parkour Tour qualifying events.",
                },
              },
              {
                id: "podiums",
                title: "Podiums",
                category: "awards",
                start: ts("2026-08-29T17:00:00.000Z"),
                end: ts("2026-08-29T18:00:00.000Z"),
              },
              {
                id: "video-awards",
                title: "Video Awards",
                category: "awards",
                start: ts("2026-08-29T18:00:00.000Z"),
                end: ts("2026-08-29T19:00:00.000Z"),
              },
              {
                id: "dj-bar",
                title: "DJ & Bar",
                category: "social",
                start: ts("2026-08-29T19:00:00.000Z"),
                end: ts("2026-08-29T21:00:00.000Z"),
              },
              {
                id: "sunday-workshops-morning",
                title: "Workshops",
                category: "workshop",
                start: ts("2026-08-30T08:00:00.000Z"),
                end: ts("2026-08-30T11:00:00.000Z"),
              },
              {
                id: "sunday-jam",
                title: "JAM",
                description: "Outdoor and open gym.",
                category: "jam",
                start: ts("2026-08-30T11:00:00.000Z"),
                end: ts("2026-08-30T16:00:00.000Z"),
              },
              {
                id: "sunday-workshops-afternoon",
                title: "Workshops",
                category: "workshop",
                start: ts("2026-08-30T11:00:00.000Z"),
                end: ts("2026-08-30T14:00:00.000Z"),
              },
              {
                id: "swiss-jam-closing",
                title: "Swiss Jam Closing",
                category: "social",
                start: ts("2026-08-30T14:00:00.000Z"),
                end: ts("2026-08-30T15:00:00.000Z"),
              },
              {
                id: "swiss-parkour-championships",
                title: "Swiss Parkour Championships",
                description:
                  "Swiss Parkour Tour final and Swiss qualification route toward Parkour Earth Worlds.",
                category: "competition",
                start: ts("2026-08-29T08:00:00.000Z"),
                end: ts("2026-08-29T18:00:00.000Z"),
                participation: {
                  access: "invite_or_qualified",
                  qualification_required: true,
                  qualification_hint:
                    "Competing requires qualification through Swiss Parkour Tour qualifying events.",
                },
                series_memberships: [
                  {
                    series_id: "swiss-parkour-tour",
                    role: "championship",
                    disciplines: ["speed", "skill", "style"],
                    qualification_required: true,
                    qualification_hint:
                      "Participation requires qualification through Swiss Parkour Tour qualifying events.",
                    required_qualifiers: qualifierRefs,
                    source_url: SPT_SOURCE,
                  },
                  {
                    series_id: "parkour-earth",
                    role: "qualifier",
                    disciplines: ["speed", "skill", "style"],
                    qualification_required: true,
                    qualification_hint:
                      "This event is the Swiss qualification pathway toward the Parkour Earth World Championships.",
                    qualifies_to: [
                      eventRef("parkour-earth-world-championships-2026"),
                    ],
                    source_url: PKE_CALENDAR_SOURCE,
                  },
                ],
              },
            ],
          },
        ],
      },
      published: true,
    },
  },
  {
    slug: "wpfcamp",
    aliases: ["wpf-camp", "wpf-camp-2026"],
    data: {
      name: "WPF Camp 2026",
      description:
        "Teilnehmende des Camps, Special Guests und Staff uebernachten auf dem Campingplatz. Fruehstueck gibt es jeweils zwischen 09:00 und 10:30, Abendessen zwischen 19:00 und 20:30 im Clubhouse oder am Campfire. Taeglich geht es nach 12:00 mit dem oeffentlichen Verkehr zu verschiedenen Spots in Basel und Umgebung. Am Abend sind verschiedene Aktivitaeten geplant. Ein Highlight ist die WPF Skills Competition der Swiss Parkour Tour am Samstag.",
      description_i18n: localeMap({
        de: "Teilnehmende des Camps, Special Guests und Staff uebernachten auf dem Campingplatz.\n\nFruehstueck gibt es jeweils zwischen 09:00 und 10:30, Abendessen jeweils zwischen 19:00 und 20:30.\n\nMahlzeiten finden im Clubhouse oder am Campfire statt. Zwei Mal gibt es ein BBQ.\n\nTaeglich geht es nach 12:00 mit dem oeffentlichen Verkehr zu verschiedenen Spots in Basel und Umgebung. Das WPF Camp wird ueber die ganze Dauer von WPF Mitgliedern betreut. Am Abend sind verschiedene Aktivitaeten geplant.\n\nEin Highlight ist die WPF Skills Competition der Swiss Parkour Tour am Samstag.",
      }),
      slug: "wpfcamp",
      venue_string: "Campingplatz Waldhort",
      locality_string: "Basel, Switzerland",
      location: geo(47.500982, 7.602896),
      location_raw: latLng(47.500982, 7.602896),
      start: ts("2026-08-05T14:00:00.000Z"),
      end: ts("2026-08-09T15:00:00.000Z"),
      ticket_options: [
        wpfTicket("full-camp", "FULL CAMP EXPERIENCE", 150, 172.95),
        wpfTicket("3day-camp", "3DAY CAMP EXPERIENCE", 130, 149.95),
        wpfTicket("weekend-camp", "WKND CAMP EXPERIENCE", 120, 138.95),
        wpfTicket("1day-camp", "1DAY CAMP EXPERIENCE", 80, 92.95),
        wpfTicket("full-day", "FULL DAY EXPERIENCE", 50, 57.95),
        wpfTicket(
          "team-5",
          "FULL TEAM EXPERIENCE (5 people)",
          450,
          517.95,
          "Only 4 tickets available.",
        ),
        wpfTicket(
          "team-4",
          "FULL TEAM EXPERIENCE (4 people)",
          400,
          460.95,
          "Only 4 tickets available.",
        ),
        wpfTicket(
          "team-3",
          "FULL TEAM EXPERIENCE (3 people)",
          350,
          402.95,
          "Only 4 tickets available.",
        ),
      ],
      event_categories: ["camp", "jam", "workshop", "competition"],
      time_zone: "Europe/Zurich",
      program: {
        active_plan_id: "main",
        plans: [
          {
            id: "main",
            label: "Main program",
            kind: "main",
            items: [
              ...wpfCampDailyProgramItems(),
              {
                id: "wpf-skills-competition",
                title: "WPF Skills Competition 2026",
                category: "competition",
                start: ts("2026-08-08T09:00:00.000Z"),
                linked_event_id: "wpf-skills-competition-2026",
                participation: {
                  access: "included_with_event",
                  note: "Participation is included with a WPF Camp ticket.",
                },
                series_memberships: [
                  {
                    series_id: "swiss-parkour-tour",
                    role: "qualifier",
                    disciplines: ["skill"],
                    qualifies_to: [
                      programRef("swissjam26", "swiss-parkour-championships"),
                    ],
                    source_url: SPT_SOURCE,
                  },
                ],
              },
            ],
          },
        ],
      },
      published: true,
    },
  },
  draftEvent("wpf-skills-competition-2026", {
    name: "WPF Skills Competition 2026",
    venue_string: "Theaterplatz Basel",
    locality_string: "Basel (CH)",
    location: geo(47.5543, 7.5906),
    location_raw: latLng(47.5543, 7.5906),
    start: ts("2026-08-08T09:00:00.000Z"),
    end: ts("2026-08-08T15:00:00.000Z"),
    event_categories: ["competition"],
    time_zone: "Europe/Zurich",
    series_ids: ["swiss-parkour-tour"],
    series_memberships: [
      {
        series_id: "swiss-parkour-tour",
        role: "qualifier",
        disciplines: ["skill"],
        qualifies_to: [programRef("swissjam26", "swiss-parkour-championships")],
        source_url: SPT_SOURCE,
      },
    ],
    event_links: [
      {
        label: "WPF Camp",
        url: "/events/wpfcamp",
        kind: "other",
      },
    ],
  }),
  draftEvent("parkour-day-staefa-2026", {
    name: "Parkour Day Stafa 2026",
    venue_string: "Pausenplatz Kirchbuhl",
    locality_string: "Stafa (CH)",
    location: geo(47.2422, 8.7232),
    location_raw: latLng(47.2422, 8.7232),
    start: ts("2026-06-20T08:00:00.000Z"),
    end: ts("2026-06-21T15:00:00.000Z"),
    event_categories: ["competition", "jam"],
    time_zone: "Europe/Zurich",
    series_ids: ["swiss-parkour-tour"],
    series_memberships: [
      {
        series_id: "swiss-parkour-tour",
        role: "qualifier",
        disciplines: ["speed", "style"],
        qualifies_to: [programRef("swissjam26", "swiss-parkour-championships")],
        source_url: SPT_SOURCE,
      },
    ],
  }),
  draftEvent("parkour-expo-skill-2026", {
    name: "Parkour Expo Skill Competition 2026",
    venue_string: "Parkour Expo",
    locality_string: "Switzerland",
    location: geo(46.8182, 8.2275),
    location_raw: latLng(46.8182, 8.2275),
    start: ts("2026-04-11T08:00:00.000Z"),
    end: ts("2026-04-11T16:00:00.000Z"),
    event_categories: ["competition"],
    time_zone: "Europe/Zurich",
    series_ids: ["swiss-parkour-tour"],
    series_memberships: [
      {
        series_id: "swiss-parkour-tour",
        role: "qualifier",
        disciplines: ["skill"],
        qualifies_to: [programRef("swissjam26", "swiss-parkour-championships")],
        source_url: SPT_SOURCE,
      },
    ],
  }),
  draftEvent("nurf-skill-2026", {
    name: "Nurf Skill Competition 2026",
    venue_string: "Nurf",
    locality_string: "Switzerland",
    location: geo(46.8182, 8.2275),
    location_raw: latLng(46.8182, 8.2275),
    start: ts("2026-04-25T08:00:00.000Z"),
    end: ts("2026-04-25T16:00:00.000Z"),
    event_categories: ["competition"],
    time_zone: "Europe/Zurich",
    series_ids: ["swiss-parkour-tour"],
    series_memberships: [
      {
        series_id: "swiss-parkour-tour",
        role: "qualifier",
        disciplines: ["skill"],
        qualifies_to: [programRef("swissjam26", "swiss-parkour-championships")],
        source_url: SPT_SOURCE,
      },
    ],
  }),
  draftEvent("parkour-luzern-speed-2026", {
    name: "Parkour Luzern Speed Competition 2026",
    venue_string: "Parkour Luzern",
    locality_string: "Luzern (CH)",
    location: geo(47.0502, 8.3093),
    location_raw: latLng(47.0502, 8.3093),
    start: ts("2026-05-09T08:00:00.000Z"),
    end: ts("2026-05-09T16:00:00.000Z"),
    event_categories: ["competition"],
    time_zone: "Europe/Zurich",
    series_ids: ["swiss-parkour-tour"],
    series_memberships: [
      {
        series_id: "swiss-parkour-tour",
        role: "qualifier",
        disciplines: ["speed"],
        qualifies_to: [programRef("swissjam26", "swiss-parkour-championships")],
        source_url: SPT_SOURCE,
      },
    ],
  }),
  draftEvent("streemlager-2026", {
    name: "StreemLager 2026",
    venue_string: "Villa Jugend (Lagerhaus)",
    locality_string: "Aarburg (CH)",
    location: geo(47.3208, 7.8995),
    location_raw: latLng(47.3208, 7.8995),
    start: ts("2026-07-27T10:00:00.000Z"),
    end: ts("2026-08-02T14:00:00.000Z"),
    event_categories: ["camp", "jam", "workshop"],
    time_zone: "Europe/Zurich",
  }),
  {
    slug: "parkour-earth-world-championships-2026",
    data: {
      slug: "parkour-earth-world-championships-2026",
      name: "Parkour Earth World Championships 2026",
      venue_string: "Brno",
      locality_string: "Brno (CZ)",
      location: geo(49.1951, 16.6068),
      location_raw: latLng(49.1951, 16.6068),
      start: ts("2026-10-28T08:00:00.000Z"),
      end: ts("2026-11-01T17:00:00.000Z"),
      url: PKE_WORLDS_SOURCE,
      event_categories: ["competition"],
      time_zone: "Europe/Prague",
      series_ids: ["parkour-earth"],
      series_memberships: [
        {
          series_id: "parkour-earth",
          role: "championship",
          disciplines: ["speed", "skill", "style"],
          qualification_required: true,
          qualification_hint:
            "Swiss athletes qualify through the Swiss Parkour Championships pathway.",
          required_qualifiers: [
            programRef("swissjam26", "swiss-parkour-championships"),
          ],
          source_url: PKE_CALENDAR_SOURCE,
        },
      ],
      published: true,
    },
  },
  draftEvent("spl5-2026", {
    name: "SPL5 2026",
    venue_string: "Vancouver",
    locality_string: "Vancouver, BC (CA)",
    location: geo(49.2827, -123.1207),
    location_raw: latLng(49.2827, -123.1207),
    start: ts("2026-08-21T16:00:00.000Z"),
    end: ts("2026-08-24T01:00:00.000Z"),
    url: SPL_SOURCE,
    event_categories: ["competition"],
    time_zone: "America/Vancouver",
    series_ids: ["sport-parkour-league"],
    series_memberships: [
      {
        series_id: "sport-parkour-league",
        role: "championship",
        qualification_required: true,
        qualification_hint:
          "SPL5 does not have on-site qualifiers; athletes qualify through sanctioned pathways before the event.",
        source_url: SPL_SOURCE,
      },
    ],
  }),
];

function wpfCampDailyProgramItems() {
  const days = [
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
  ];
  const items = [];

  for (const day of days.slice(1)) {
    items.push({
      id: `${day}-breakfast`,
      title: "Breakfast",
      description: "Breakfast at the Clubhouse or Campfire.",
      category: "social",
      start: ts(`${day}T07:00:00.000Z`),
      end: ts(`${day}T08:30:00.000Z`),
    });
  }

  items.push({
    id: "2026-08-05-arrival",
    title: "Arrival and camp opening",
    category: "social",
    start: ts("2026-08-05T14:00:00.000Z"),
    end: ts("2026-08-05T17:00:00.000Z"),
  });

  for (const day of days.slice(1)) {
    items.push({
      id: `${day}-spot-session`,
      title: "Basel spot session",
      description:
        "Group trip by public transport to different spots in Basel and the surrounding area.",
      category: "jam",
      start: ts(`${day}T10:00:00.000Z`),
      end: ts(`${day}T16:00:00.000Z`),
    });
  }

  for (const day of days.slice(0, -1)) {
    items.push({
      id: `${day}-dinner`,
      title: "Dinner",
      description: "Dinner at the Clubhouse or Campfire.",
      category: "social",
      start: ts(`${day}T17:00:00.000Z`),
      end: ts(`${day}T18:30:00.000Z`),
    });
    items.push({
      id: `${day}-evening-activity`,
      title: "Evening activity",
      category: "social",
      start: ts(`${day}T18:30:00.000Z`),
      end: ts(`${day}T21:00:00.000Z`),
    });
  }

  items.push(
    {
      id: "2026-08-06-bbq",
      title: "BBQ",
      category: "social",
      start: ts("2026-08-06T17:00:00.000Z"),
      end: ts("2026-08-06T18:30:00.000Z"),
    },
    {
      id: "2026-08-08-bbq",
      title: "BBQ",
      category: "social",
      start: ts("2026-08-08T17:00:00.000Z"),
      end: ts("2026-08-08T18:30:00.000Z"),
    },
  );

  return items.sort(
    (left, right) => left.start.toMillis() - right.start.toMillis(),
  );
}

function swissJamTicket(id, label, earlyBirdAmount, regularAmount) {
  return {
    id,
    label,
    description: `Early bird until 30.06. Regular price ${regularAmount.toFixed(2)} CHF.`,
    price: { amount: earlyBirdAmount, currency: "CHF" },
    availability: "available",
    sale_ends_at: ts("2026-08-29T22:00:00.000Z"),
    badge: "early_bird",
  };
}

function wpfTicket(id, label, amount, flexAmount, extraDescription) {
  const baseDescription =
    "Non-refundable. Flex option available with cancellation up to 48 hours before the event.";
  return {
    id,
    label,
    description: `${baseDescription} Flex price ${flexAmount.toFixed(2)} CHF.${
      extraDescription ? ` ${extraDescription}` : ""
    }`,
    url: WPF_TICKET_URL,
    price: { amount, currency: "CHF" },
    availability: "available",
    sale_ends_at: ts("2026-08-04T22:00:00.000Z"),
  };
}

function draftEvent(slug, data) {
  return {
    slug,
    data: {
      slug,
      ...data,
      published: false,
    },
  };
}

function eventRef(eventId) {
  return { kind: "event", event_id: eventId };
}

function programRef(eventId, programItemId) {
  return {
    kind: "program_item",
    event_id: eventId,
    program_item_id: programItemId,
  };
}

function latLng(lat, lng) {
  return { lat, lng };
}

function geo(lat, lng) {
  return new GeoPoint(lat, lng);
}

function ts(iso) {
  return Timestamp.fromDate(new Date(iso));
}

function withDefaultEventI18n(data) {
  return {
    ...data,
    ticket_options: data.ticket_options?.map((ticket) => ({
      ...ticket,
      label_i18n: ticket.label_i18n ?? localeMap({ en: ticket.label }),
      description_i18n:
        ticket.description && !ticket.description_i18n
          ? localeMap({ en: ticket.description })
          : ticket.description_i18n,
    })),
    series_memberships: data.series_memberships?.map(withDefaultMembershipI18n),
    program: data.program
      ? {
          ...data.program,
          plans: data.program.plans.map((plan) => ({
            ...plan,
            label_i18n: plan.label_i18n ?? localeMap({ en: plan.label }),
            condition_label_i18n:
              plan.condition_label && !plan.condition_label_i18n
                ? localeMap({ en: plan.condition_label })
                : plan.condition_label_i18n,
            items: plan.items.map((item) => ({
              ...item,
              title_i18n: item.title_i18n ?? localeMap({ en: item.title }),
              description_i18n:
                item.description && !item.description_i18n
                  ? localeMap({ en: item.description })
                  : item.description_i18n,
              runtime_override: item.runtime_override
                ? withDefaultRuntimeOverrideI18n(item.runtime_override)
                : undefined,
              participation: item.participation
                ? withDefaultParticipationI18n(item.participation)
                : undefined,
              series_memberships: item.series_memberships?.map(
                withDefaultMembershipI18n,
              ),
            })),
          })),
        }
      : undefined,
  };
}

function withDefaultRuntimeOverrideI18n(runtimeOverride) {
  return {
    ...runtimeOverride,
    note_i18n:
      runtimeOverride.note && !runtimeOverride.note_i18n
        ? localeMap({ en: runtimeOverride.note })
        : runtimeOverride.note_i18n,
  };
}

function withDefaultParticipationI18n(participation) {
  return {
    ...participation,
    note_i18n:
      participation.note && !participation.note_i18n
        ? localeMap({ en: participation.note })
        : participation.note_i18n,
    qualification_hint_i18n:
      participation.qualification_hint && !participation.qualification_hint_i18n
        ? localeMap({ en: participation.qualification_hint })
        : participation.qualification_hint_i18n,
  };
}

function withDefaultMembershipI18n(membership) {
  return {
    ...membership,
    qualification_hint_i18n:
      membership.qualification_hint && !membership.qualification_hint_i18n
        ? localeMap({ en: membership.qualification_hint })
        : membership.qualification_hint_i18n,
  };
}

function localeMap(translations) {
  return Object.fromEntries(
    Object.entries(translations).map(([locale, text]) => [
      locale,
      { text, provider: "admin" },
    ]),
  );
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }
  if (value && typeof value === "object") {
    if (typeof value.toDate === "function") return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, removeUndefined(entryValue)]),
    );
  }
  return value;
}

async function resolveEventId(slugs) {
  for (const slug of slugs) {
    const slugDoc = await db.collection("event_slugs").doc(slug).get();
    if (slugDoc.exists && slugDoc.data()?.event_id) {
      return String(slugDoc.data().event_id);
    }
  }

  for (const slug of slugs) {
    const direct = await db.collection("events").doc(slug).get();
    if (direct.exists) return slug;
  }

  return null;
}

async function upsertSeries() {
  for (const series of seriesDocs) {
    const ref = db.collection("series").doc(series.id);
    const payload = {
      ...series.data,
      time_updated: FieldValue.serverTimestamp(),
    };
    if (APPLY) {
      await ref.set(payload, { merge: true });
    }
    console.log(`${APPLY ? "upserted" : "would upsert"} series/${series.id}`);
  }
}

async function upsertEvents() {
  for (const event of eventDocs) {
    const id =
      (await resolveEventId([event.slug, ...(event.aliases ?? [])])) ??
      event.slug;
    const ref = db.collection("events").doc(id);
    const existing = await ref.get();
    const payload = {
      ...removeUndefined(withDefaultEventI18n(event.data)),
      time_updated: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { time_created: FieldValue.serverTimestamp() }),
    };

    if (APPLY) {
      await ref.set(payload, { merge: true });
      await db.collection("event_slugs").doc(event.slug).set(
        {
          event_id: id,
        },
        { merge: true },
      );
      for (const alias of event.aliases ?? []) {
        await db.collection("event_slugs").doc(alias).set(
          {
            event_id: id,
          },
          { merge: true },
        );
      }
    }

    console.log(
      `${APPLY ? "upserted" : "would upsert"} events/${id} (${event.slug}) ${
        event.data.published === false ? "[draft]" : "[published]"
      }`,
    );
  }
}

async function main() {
  console.log(APPLY ? "Applying event upserts..." : "Dry run only.");
  await upsertSeries();
  await upsertEvents();
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.app().delete();
  });
