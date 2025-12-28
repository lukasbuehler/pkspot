import { onSchedule } from "firebase-functions/v2/scheduler";
import { GeoPoint } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { SpotPreviewData } from "../../src/db/schemas/SpotPreviewData";

import {
  PartialSpotSchema,
  getSpotLocalityString,
  getSpotName,
  getSpotPreviewImage,
} from "./spotHelpers";
import { MapHelpers } from "../../src/scripts/MapHelpers";
import { SpotId } from "../../src/db/schemas/SpotSchema";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SuperclusterModule = require("supercluster");
const Supercluster = SuperclusterModule.default || SuperclusterModule;

function tileToBBox(
  zoom: number,
  x: number,
  y: number
): [number, number, number, number] {
  // Reuse client-side MapHelpers to compute bounds for tile and convert to bbox
  const bounds = MapHelpers.getBoundsForTile(zoom, x, y);
  // MapHelpers returns { south, west, north, east }
  return [bounds.west, bounds.south, bounds.east, bounds.north];
}

interface ClusterTileDot {
  location: GeoPoint;
  location_raw?: { lat: number; lng: number };
  weight: number;
  spot_id?: string;
}

interface SpotClusterTile {
  // the zoom level the tile should be loaded and displayed at.
  zoom: number;
  x: number;
  y: number;

  // the array of cluster points with their corresponding weights.
  dots: ClusterTileDot[];

  spots: SpotPreviewData[];
}

async function _clusterAllSpots() {
  // define clustering function
  const getClusterTilesForAllSpots = (
    allSpotAndIds: { id: string; data: PartialSpotSchema }[]
  ): Map<string, SpotClusterTile> => {
    //   const zoomJump: number = 4;
    //   const highestDotZoom: number = 12;

    const clusterTiles = new Map<string, SpotClusterTile>();

    const clusterTilesMap = {
      12: new Map<string, string[]>(),
      8: new Map<string, string[]>(),
      4: new Map<string, string[]>(),
    };

    // setup for clustering, setting all the tiles for zoom 12
    allSpotAndIds.forEach(
      (spotAndId: { id: string; data: PartialSpotSchema }) => {
        const id = spotAndId.id;
        const spot = spotAndId.data;
        const spotIsClusterWorthy =
          (spot.rating || spot.is_iconic) &&
          spot.media &&
          spot.media.length > 0;

        if (!spot.location && !spot.location_raw) {
          console.error("Spot has no location", id);
          return;
        }

        if (!spot.tile_coordinates || !spot.tile_coordinates.z12) {
          console.error("Spot has no tile coordinates", id);
          return;
        }

        // for each spot, add a point of weight 1 to a cluster tile of zoom 14

        // get the tile coordinates for the spot at zoom 14
        const tile = spot.tile_coordinates.z12; // the coords are for tiles at zoom 12

        // Determine location to use (prefer GeoPoint for now as legacy, but ensure we have one)
        let location: any = spot.location;
        if (!location && spot.location_raw) {
          location = new GeoPoint(spot.location_raw.lat, spot.location_raw.lng);
        }

        const clusterTileDot: ClusterTileDot = {
          location: location! as any,
          location_raw: { lat: location.latitude, lng: location.longitude },
          weight: 1,
          spot_id: id,
        };

        let spotForTile: SpotPreviewData;
        if (spotIsClusterWorthy) {
          spotForTile = {
            name: getSpotName(spot, "en"),
            id: id as SpotId,
            isIconic: spot.is_iconic ?? false,
            imageSrc: getSpotPreviewImage(spot),
            locality: getSpotLocalityString(spot),
            countryCode: spot.address?.country?.code,
            countryName: spot.address?.country?.name,
          };

          // Only add optional fields if they are defined
          if (spot.slug !== undefined) {
            spotForTile.slug = spot.slug;
          }

          if (spot.location !== undefined) {
            spotForTile.location = spot.location;
          }
          if (spot.location_raw !== undefined) {
            spotForTile.location_raw = spot.location_raw;
          } else if (spot.location !== undefined) {
            // Backfill location_raw if missing from spot but location exists
            spotForTile.location_raw = {
              lat: spot.location.latitude,
              lng: spot.location.longitude,
            };
          }

          if (spot.type !== undefined) {
            spotForTile.type = spot.type;
          }

          if (spot.access !== undefined) {
            spotForTile.access = spot.access;
          }

          if (spot.amenities !== undefined) {
            spotForTile.amenities = spot.amenities;
          }

          if (spot.rating) {
            spotForTile.rating = spot.rating;
          }
        }

        // check if the tile exists in the clusterTilesMap for zoom 12
        if (clusterTiles.has(`z12_${tile.x}_${tile.y}`)) {
          // if the tile exists, add the spot to the array of spots in the cluster tile
          clusterTiles
            .get(`z12_${tile.x}_${tile.y}`)!
            .dots.push(clusterTileDot);

          if (spotIsClusterWorthy) {
            clusterTiles
              .get(`z12_${tile.x}_${tile.y}`)!
              .spots.push(spotForTile!);
          }
        } else {
          // if the tile does not exist, create a new array with the spot and add it to the clusterTilesMap for zoom 12
          clusterTiles.set(`z12_${tile.x}_${tile.y}`, {
            zoom: 12,
            x: tile.x,
            y: tile.y,
            dots: [clusterTileDot],
            spots: spotIsClusterWorthy ? [spotForTile!] : [],
          });

          // also add this 12 tile key to the cluster tiles map for zoom 8
          const key8 = `z8_${tile.x >> 4}_${tile.y >> 4}`;
          if (!clusterTilesMap[8].has(key8)) {
            clusterTilesMap[8].set(key8, [`z12_${tile.x}_${tile.y}`]);
          } else {
            clusterTilesMap[8].get(key8)!.push(`z12_${tile.x}_${tile.y}`);
          }
        }
      }
    );

    // Use Supercluster to aggregate z12 dots into higher-level clusters (z8, z4)
    // Build GeoJSON-like features from z12 dots
    const allDotsFeatures: any[] = [];
    clusterTiles.forEach((tile) => {
      tile.dots.forEach((d) => {
        allDotsFeatures.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [d.location.longitude, d.location.latitude],
          },
          properties: {
            weight: d.weight || 1,
            spot_id: d.spot_id || null,
          },
        });
      });
    });

    const superIndex = new Supercluster({ radius: 60, maxZoom: 12 });
    try {
      superIndex.load(allDotsFeatures);
    } catch (err) {
      console.error("supercluster load failed", err);
    }

    for (let zoom = 8; zoom >= 4; zoom -= 4) {
      for (let [tileKey, smallerTileKeys] of clusterTilesMap[
        zoom as 8 | 4
      ].entries()) {
        const firstSmallerTile = clusterTiles.get(smallerTileKeys[0])!;

        // compute desired bbox for this aggregated tile
        const tileX = firstSmallerTile.x >> 4;
        const tileY = firstSmallerTile.y >> 4;
        const bbox = tileToBBox(zoom, tileX, tileY);

        // ask supercluster for clusters in this bbox at the target zoom
        const clusters = superIndex.getClusters(bbox, zoom);

        const clusterDots: ClusterTileDot[] = clusters.map((c: any) => {
          const coords = c.geometry.coordinates;
          const weight =
            c.properties && c.properties.point_count
              ? c.properties.point_count
              : c.properties && c.properties.weight
              ? c.properties.weight
              : 1;
          return {
            location: new GeoPoint(coords[1], coords[0]),
            location_raw: { lat: coords[1], lng: coords[0] },
            weight,
            spot_id: (c.properties && c.properties.spot_id) || null,
          } as ClusterTileDot;
        });

        // only add the best spots to the cluster tile (reuse previous selection logic)
        const numberOfClusterSpots = 1;
        const iconicScore = 4;
        const clusterSpots: SpotPreviewData[] = smallerTileKeys
          .map((key) => {
            return (clusterTiles.get(key) as SpotClusterTile).spots;
          })
          .reduce((acc, spots) => {
            return acc.concat(spots);
          }, [])
          .filter((spot) => spot.rating || spot.isIconic)
          .map((spot) => {
            return {
              ...spot,
              score: spot.isIconic
                ? Math.max(spot.rating || 1, iconicScore)
                : spot.rating || 2,
            };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, numberOfClusterSpots)
          .map(({ score, ...rest }) => rest); // Remove the score field

        // set the cluster tile
        clusterTiles.set(tileKey, {
          zoom: zoom,
          x: firstSmallerTile.x >> 4,
          y: firstSmallerTile.y >> 4,
          dots: clusterDots,
          spots: clusterSpots,
        });

        // also add the zoom tile to the cluster tiles map for the next zoom level
        if (zoom > 4) {
          const tile = clusterTiles.get(tileKey)!;
          const key = `z${zoom - 4}_${tile.x >> 4}_${tile.y >> 4}`;
          if (!clusterTilesMap[(zoom - 4) as 8 | 4].has(key)) {
            clusterTilesMap[(zoom - 4) as 8 | 4].set(key, [tileKey]);
          } else {
            clusterTilesMap[(zoom - 4) as 8 | 4].get(key)!.push(tileKey);
          }
        }
      }
    }

    return clusterTiles;
  };

  // 1. load ALL spots
  return admin
    .firestore()
    .collection("spots")
    .get()
    .then((spotsSnap) => {
      const spots: { id: string; data: PartialSpotSchema }[] =
        spotsSnap.docs.map((doc) => {
          return { id: doc.id, data: doc.data() as PartialSpotSchema };
        });

      // get all clusters
      const clusters: Map<string, SpotClusterTile> =
        getClusterTilesForAllSpots(spots);

      console.log("clusters", clusters);

      // delete all existing clusters with a batch write
      const deleteBatch = admin.firestore().batch();

      return admin
        .firestore()
        .collection("spot_clusters")
        .get()
        .then((clustersSnap) => {
          clustersSnap.forEach((doc) => {
            deleteBatch.delete(doc.ref);
          });
          return deleteBatch
            .commit()
            .then(() => {
              console.log("deleted all old clusters");

              // add newly created clusters with a batch write
              if (clusters.size === 0) return;

              console.log("adding " + clusters.size + " new clusters");

              const addBatch = admin.firestore().batch();
              clusters.forEach((cluster, key) => {
                const newClusterRef = admin
                  .firestore()
                  .collection("spot_clusters")
                  .doc(key);
                addBatch.set(newClusterRef, cluster);
              });

              return addBatch
                .commit()
                .then(() => {
                  console.log("done :)");

                  // the run document does not need to be deleted here,
                  // it was deleted together with the old clusters if everything went well.
                })
                .catch((err) => {
                  console.error("Error adding new clusters: ", err);
                });
            })
            .catch((err) => {
              console.error("Error deleting clusters: ", err);
            });
        });
    });
}

/*
 * Cluster all spots
 */
export const clusterAllSpotsOnRun = onDocumentCreated(
  "spot_clusters/run",
  async (event) => {
    await _clusterAllSpots();
  }
);

export const clusterAllSpotsOnSchedule = onSchedule(
  "every day 00:00", // UTC?
  async () => {
    await _clusterAllSpots();
  }
);
