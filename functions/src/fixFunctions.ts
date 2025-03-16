import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { GeoPoint } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { SpotSchema } from "./spotHelpers";
import { LocaleCode, LocaleMap } from "../../src/db/models/Interfaces";

/**
 * Fix all spots with the location field that is a map to be a GeoPoint again.
 */
export const fixSpotLocations = onDocumentCreated(
  { document: "spots/run-fix-locations" },
  async (event) => {
    const spots = await admin
      .firestore()
      .collection("spots")
      .where("location", "!=", null)
      .get();

    const batch = admin.firestore().batch();

    spots.docs.forEach((spot) => {
      const location = (spot.data() as SpotSchema).location;
      if (
        location &&
        location.latitude !== undefined &&
        location.longitude !== undefined
      ) {
        const geoPoint = new GeoPoint(location.latitude, location.longitude);
        batch.update(spot.ref, { location: geoPoint });
        console.log("Fixed location for spot", spot.id);
      }
    });

    // commit the batch
    await batch.commit();

    // delete the run document
    return event.data?.ref.delete();
  }
);

function _fixLocaleMaps(
  localeMapObj: any,
  spotIdForWarnings: string
): LocaleMap {
  const fixedLocaleMap: LocaleMap = {};

  if (typeof localeMapObj === "string") {
    fixedLocaleMap.en = { text: localeMapObj, provider: "user" };
    console.log("Fixed description for spot:", spotIdForWarnings);
  } else if (typeof localeMapObj === "object") {
    if (Object.keys(localeMapObj).length === 0) {
      console.warn("Empty description for spot:", spotIdForWarnings);
    } else {
      // there are some translations
      // loop over all of them
      for (const [key, value] of Object.entries(localeMapObj) as [
        string,
        any
      ][]) {
        const code: LocaleCode = key as LocaleCode;
        if (!code) {
          console.warn(
            "Invalid locale code on spot description",
            key,
            "spot:",
            spotIdForWarnings
          );
          continue;
        }
        if (typeof value === "string") {
          fixedLocaleMap[code] = { text: value, provider: "user" };
        } else if (typeof value === "object") {
          if (typeof value.text === "string") {
            fixedLocaleMap[code] = {
              text: value.text,
              provider: value.provider || "user",
            };
          } else {
            console.warn(
              "Invalid locale value on spot",
              spotIdForWarnings,
              "locale:",
              code,
              "value:",
              value
            );
          }
        }
      }
    }
  }

  return fixedLocaleMap;
}

export const fixLocaleMaps = onDocumentCreated(
  { document: "spots/run-fix-locale-maps" },
  async (event) => {
    const spots = await admin
      .firestore()
      .collection("spots")
      .where("description", "!=", null)
      .get();

    const batch = admin.firestore().batch();

    spots.docs.forEach((spot) => {
      const spotData: any = spot.data();
      const description = spotData.description;
      const name = spotData.name;

      const newDescription: SpotSchema["description"] = _fixLocaleMaps(
        description,
        spot.id
      );
      const newName: SpotSchema["name"] = _fixLocaleMaps(name, spot.id);

      console.log("Fixed locale maps for spot", spot.id);

      batch.update(spot.ref, { description: newDescription, name: newName });
    });
    try {
      await batch.commit();
    } catch (err) {
      console.error("Error committing batch", err);
      return Promise.reject(err);
    }

    console.log("Done fixing locale maps for all spots");

    return event.data?.ref.delete();
  }
);
