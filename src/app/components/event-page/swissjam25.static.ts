import { Timestamp } from "firebase/firestore";
import { EventSchema } from "../../../db/schemas/EventSchema";

/**
 * Static fallback for the Swiss Jam 2025 event page. Used when no Firestore
 * document exists at /events/swissjam25 yet, so the live page keeps working
 * unchanged while the events feature is rolled out. Once the doc is created
 * in Firestore it takes precedence and this file can be deleted.
 */
export const SWISSJAM25_STATIC: EventSchema = {
  name: "Swiss Jam 2025",
  slug: "swissjam25",
  banner_src: "assets/swissjam/swissjam0.jpg",
  venue_string: "Universität Irchel",
  locality_string: "Zurich, Switzerland",
  start: Timestamp.fromDate(new Date("2025-05-24T09:00:00+01:00")),
  end: Timestamp.fromDate(new Date("2025-05-25T16:00:00+01:00")),
  url: "https://www.swissparkourtour.ch/swiss-jam-2025/",

  bounds: {
    north: 47.4,
    south: 47.393,
    west: 8.54087,
    east: 8.553,
  },
  focus_zoom: 20,

  spot_ids: [
    "23Oek5FVSThPbuG6MSjj",
    "EcI4adxBhMYZOXT8tPe3",
    "lhSX9YEqSTKbZ9jfYy6L",
    "ZkDaO5DSY7wyBQkgZMWC",
    "sRX9lb5lNYKGqQ5e4rcO",
    "SpF4Abl5qmH95xalJcIX",
    "KgeGafTHPg4mgJgG00Gj",
    "teekopIoaqy0CublyWrY",
    "Amxf5W61oLpov55sDMGb",
    "cmKGumywcZ4F7ZzSjvl2",
    "UTFmdSsQ6oWOpzsxZVw0",
  ],

  inline_spots: [
    {
      id: "main",
      name: "Main Spot",
      location: { lat: 47.39732893509323, lng: 8.548509576285669 },
      bounds: [
        { lat: 47.397237163433424, lng: 8.54852286554543 },
        { lat: 47.39727438598336, lng: 8.548373942307316 },
        { lat: 47.39742969172247, lng: 8.548445028774058 },
        { lat: 47.397365317957394, lng: 8.548779092061668 },
        { lat: 47.39725743643263, lng: 8.548711980937691 },
        { lat: 47.397297807170254, lng: 8.548555067641223 },
      ],
      images: [
        "assets/swissjam/swissjam2.jpg",
        "assets/swissjam/swissjam0.jpg",
        "assets/swissjam/swissjam1.jpg",
      ],
      is_iconic: true,
    },
  ],

  custom_markers: [
    {
      name: "Parking garage",
      color: "tertiary",
      location: { lat: 47.39812077013162, lng: 8.546551689295336 },
      icons: ["local_parking", "garage"],
    },
    {
      name: "Milchbuck (Tram-Station)",
      color: "tertiary",
      location: { lat: 47.39778445846257, lng: 8.541912684696003 },
      icons: ["tram", "directions_bus"],
    },
    {
      name: "Universität Irchel (Tram-Station)",
      color: "tertiary",
      location: { lat: 47.39622541657696, lng: 8.544870658516267 },
      icons: ["tram"],
    },
    {
      name: "WC",
      color: "secondary",
      location: { lat: 47.397143104254134, lng: 8.549462816940418 },
      icons: ["wc"],
    },
    {
      name: "Info stand",
      color: "secondary",
      location: { lat: 47.39723002436682, lng: 8.548602928177829 },
      icons: ["info", "restaurant", "video_camera_front"],
      priority: "required",
    },
    {
      name: "Open Gym (ASVZ)",
      color: "secondary",
      location: { lat: 47.39791103067576, lng: 8.545801263180458 },
      icons: ["roofing", "wc"],
      priority: "required",
    },
  ],

  challenge_spot_map: {
    QLQv51skvhF8JZhRPfIF: "yhRsQmaXABRQVrbtgQ7D",
    D7a2hgAmd9508i2eCWxA: "lhSX9YEqSTKbZ9jfYy6L",
    K0T1AuHT0qanTaa91YdM: "yhRsQmaXABRQVrbtgQ7D",
    gEsMEOnehCnQY48uUu43: "yhRsQmaXABRQVrbtgQ7D",
    vqU3zXlgG2OzlU6J7n2J: "yhRsQmaXABRQVrbtgQ7D",
    MdELs6auoXeAU83LAb8P: "lhSX9YEqSTKbZ9jfYy6L",
    WtQuOWish8CgCOgP2qxx: "SpF4Abl5qmH95xalJcIX",
    FKMXqEnEWCUvywveQM9V: "yhRsQmaXABRQVrbtgQ7D",
    vk49nGUNxLngnyNUxfbI: "yhRsQmaXABRQVrbtgQ7D",
    TDzQiroN6H4NeXrVI8zP: "yhRsQmaXABRQVrbtgQ7D",
    z15ugcuet4cWAL5iBAZY: "EcI4adxBhMYZOXT8tPe3",
    ZoTqnbxosdeUUnngZjdN: "EcI4adxBhMYZOXT8tPe3",
    mlb5C7ws1Fkh2ILjZ2cn: "yhRsQmaXABRQVrbtgQ7D",
    vRSKCWusby7bEz5amSHo: "EcI4adxBhMYZOXT8tPe3",
    iftBeXgg70FyI6w2mzUI: "yhRsQmaXABRQVrbtgQ7D",
    Fdrag4MGr1Vhj4gv34XP: "yhRsQmaXABRQVrbtgQ7D",
    bvbUbCwcnX9Whcrd4e0Y: "EcI4adxBhMYZOXT8tPe3",
    RqZJxohePhQuKjWGfvF0: "EcI4adxBhMYZOXT8tPe3",
    lRXsLfDbiukLMJQedDQc: "KgeGafTHPg4mgJgG00Gj",
    "68QdJQOfvG8Tk5u524uS": "teekopIoaqy0CublyWrY",
    yVOJaJwArvxetV8IebI9: "teekopIoaqy0CublyWrY",
    Q2x3DfAYEmnztTrJj8Dr: "teekopIoaqy0CublyWrY",
    "9AWj4bLnIK4FPBwziR74": "EcI4adxBhMYZOXT8tPe3",
    uueZk4lnMtbovTcbF2PH: "Amxf5W61oLpov55sDMGb",
    QOxoU0WfCbvePKf2iTXq: "Amxf5W61oLpov55sDMGb",
    Xdd7GBJpqxVlGboYbqMb: "Amxf5W61oLpov55sDMGb",
    G0ZiRM4znjHXHLLCawNJ: "Amxf5W61oLpov55sDMGb",
    Qzi7FGUREABhRH3AL8Pr: "Amxf5W61oLpov55sDMGb",
    IiEnyvxfGL8agTR3R1oM: "EcI4adxBhMYZOXT8tPe3",
    f0oVghc01nxtGtROZzoj: "SpF4Abl5qmH95xalJcIX",
    cWv5ZCeTfEunNUKHnr4K: "SpF4Abl5qmH95xalJcIX",
    zEzrzAGhwWqOljZ7XJvv: "SpF4Abl5qmH95xalJcIX",
    ikUY18abG2fVs8khCygU: "SpF4Abl5qmH95xalJcIX",
    "1z7JXAqC9vigFJ6BObMO": "SpF4Abl5qmH95xalJcIX",
    "7KpmrH41UV3RFWztlr2n": "SpF4Abl5qmH95xalJcIX",
    Q1ljcOISiJUfsep1vuTl: "SpF4Abl5qmH95xalJcIX",
    JjFpk5AHK7n0AkyBFlzC: "EcI4adxBhMYZOXT8tPe3",
    "4JgXkTp9WS8mH25esZMf": "EcI4adxBhMYZOXT8tPe3",
    TeR2cRngig5vg4SRgpNp: "EcI4adxBhMYZOXT8tPe3",
    KkM23zLvv1aUq2yFjZaZ: "Amxf5W61oLpov55sDMGb",
    oiF8FeZrPiEpI9JX3k84: "UTFmdSsQ6oWOpzsxZVw0",
    ajCGEBOnCyDb7TNqtWiA: "UTFmdSsQ6oWOpzsxZVw0",
    "2bI6mdJqMfnbOoWJoIdy": "yhRsQmaXABRQVrbtgQ7D",
    TgLyTpfDzDQWkCo6zIYE: "yhRsQmaXABRQVrbtgQ7D",
    qA3kFOUdZweQkHsM2uZn: "yhRsQmaXABRQVrbtgQ7D",
    "4L6gdXR7Usv32jgJmKZc": "teekopIoaqy0CublyWrY",
    "519ZY623JjKNTnPzMshY": "cmKGumywcZ4F7ZzSjvl2",
    wmmDfHREL9nPvdDwKSb5: "SpF4Abl5qmH95xalJcIX",
    CnviOVVgUtkdFrdsM7bk: "SpF4Abl5qmH95xalJcIX",
    LSLNGNbkVq1Fypr9enbs: "SpF4Abl5qmH95xalJcIX",
  },

  area_polygon: [
    [
      { lat: 0, lng: -90 },
      { lat: 0, lng: 90 },
      { lat: 90, lng: -90 },
      { lat: 90, lng: 90 },
    ],
    [
      { lat: 47.39690440489847, lng: 8.54137955373239 },
      { lat: 47.39922912784592, lng: 8.54270958874722 },
      { lat: 47.39976970395402, lng: 8.546988087725437 },
      { lat: 47.39852765134482, lng: 8.552592984179212 },
      { lat: 47.39266322242201, lng: 8.550449664195357 },
      { lat: 47.395861761732796, lng: 8.546175461394029 },
    ],
  ],

  structured_data: {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "Swiss Jam 2025",
    startDate: "2025-05-24T09:00:00+01:00",
    endDate: "2025-05-25T16:00:00+01:00",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: "Universität Irchel",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Zürich",
        postalCode: "8057",
        streetAddress:
          "Universitätscampus Irchel, Winterthurerstrasse 190, Zürich, CH",
      },
    },
    image: ["assets/swissjam/swissjam0.jpg"],
    description:
      "The Swiss Jam 2025 invites the whole Parkour community to Zurich.\n" +
      "The main event area is located at the Irchepark. Different workshops for all skill levels can be joined. A big spot with major extensions gives enough room for all kind of movements and inspirations. A big Video-Screeing shows our communitys creativity.\n" +
      "Join the event to jam, to learn, to get inspired and inspire!",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "CHF",
      highPrice: "29.90",
      lowPrice: "14.90",
      offerCount: "3",
      offers: [
        {
          "@type": "Offer",
          name: "All Workshops",
          price: "29.90",
          priceCurrency: "CHF",
        },
        {
          "@type": "Offer",
          name: "2x Workshops",
          price: "24.90",
          priceCurrency: "CHF",
        },
        {
          "@type": "Offer",
          name: "1x Workshops",
          price: "14.90",
          priceCurrency: "CHF",
        },
      ],
      url: "https://eventfrog.ch/de/p/sport-fitness/sonstige-veranstaltungen/swiss-jam-2025-7291100335594076233.html",
    },
    organizer: {
      "@type": "Organization",
      name: "Swiss Parkour Tour",
      url: "https://www.swissparkourtour.ch/",
      memberOf: {
        "@type": "Organization",
        name: "Swiss Parkour Association",
        url: "https://spka.ch",
      },
    },
    url: "https://www.swissparkourtour.ch/swiss-jam-2025/",
  },
};
