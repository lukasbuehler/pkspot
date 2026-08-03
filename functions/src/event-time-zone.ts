import { find as findTimeZones } from "geo-tz";

export const eventTimeZoneAt = (location: {
  lat: number;
  lng: number;
}): string => {
  const timeZone = findTimeZones(location.lat, location.lng)[0];
  if (!timeZone) {
    throw new Error(
      `No IANA time zone found for ${location.lat}, ${location.lng}`,
    );
  }
  new Intl.DateTimeFormat("en", { timeZone }).format(0);
  return timeZone;
};
