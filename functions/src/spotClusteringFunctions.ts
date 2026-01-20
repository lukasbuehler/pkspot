import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import {
  SpotClusterTileSchema as SpotClusterTile,
  SpotClusterDotSchema as ClusterTileDot,
} from "../../src/db/schemas/SpotClusterTile";
import { SpotSchema } from "../../src/db/schemas/SpotSchema";

type PartialSpotSchema = Partial<SpotSchema>;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SuperclusterModule = require("supercluster");
const Supercluster = SuperclusterModule.default || SuperclusterModule;

function tileToBBox(
  zoom: number,
  x: number,
  y: number
): [number, number, number, number] {
  const tile2long = (x: number, z: number) => (x / Math.pow(2, z)) * 360 - 180;
  const tile2lat = (y: number, z: number) => {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };
  return [
    tile2long(x, zoom),
    tile2lat(y + 1, zoom),
    tile2long(x + 1, zoom),
    tile2lat(y, zoom),
  ];
}

async function _clusterAllSpots() {
  // define clustering function
  const getClusterTilesForAllSpots = (
    allSpotAndIds: { id: string; data: PartialSpotSchema }[]
  ): Map<string, SpotClusterTile> => {
    //   const zoomJump: number = 4;
    //   const highestDotZoom: number = 12;

    const clusterTiles = new Map<string, SpotClusterTile>();

    const clusterTilesMap: Record<number, Map<string, string[]>> = {
      12: new Map<string, string[]>(),
      10: new Map<string, string[]>(),
      8: new Map<string, string[]>(),
      6: new Map<string, string[]>(),
      4: new Map<string, string[]>(),
      2: new Map<string, string[]>(),
    };

    // setup for clustering, setting all the tiles for zoom 12
    allSpotAndIds.forEach(
      (spotAndId: { id: string; data: PartialSpotSchema }) => {
        const id = spotAndId.id;
        const spot = spotAndId.data;

        // We cluster ALL spots now, or maybe only those with location?
        // Previously: Checked rating/is_iconic/media.
        // Now: Occupancy means ALL spots with location.

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
          location = new admin.firestore.GeoPoint(
            spot.location_raw.lat,
            spot.location_raw.lng
          );
        }

        const clusterTileDot: ClusterTileDot = {
          location: location! as any,
          location_raw: { lat: location.latitude, lng: location.longitude },
          weight: 1,
          spot_id: id,
        };

        // check if the tile exists in the clusterTilesMap for zoom 12
        if (clusterTiles.has(`z12_${tile.x}_${tile.y}`)) {
          // if the tile exists, add the spot to the array of spots in the cluster tile
          clusterTiles
            .get(`z12_${tile.x}_${tile.y}`)!
            .dots.push(clusterTileDot);
        } else {
          // if the tile does not exist, create a new array with the spot and add it to the clusterTilesMap for zoom 12
          clusterTiles.set(`z12_${tile.x}_${tile.y}`, {
            zoom: 12,
            x: tile.x,
            y: tile.y,
            dots: [clusterTileDot],
            spots: [], // No spots preview data
          });

          // also add this 12 tile key to the cluster tiles map for zoom 10
          const key10 = `z10_${tile.x >> 2}_${tile.y >> 2}`;
          if (!clusterTilesMap[10].has(key10)) {
            clusterTilesMap[10].set(key10, [`z12_${tile.x}_${tile.y}`]);
          } else {
            clusterTilesMap[10].get(key10)!.push(`z12_${tile.x}_${tile.y}`);
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

    for (let zoom = 10; zoom >= 2; zoom -= 2) {
      for (let [tileKey, smallerTileKeys] of clusterTilesMap[zoom].entries()) {
        const firstSmallerTile = clusterTiles.get(smallerTileKeys[0])!;

        // compute desired bbox for this aggregated tile
        // Shift by 2 bits since the zoom difference is 2 between levels
        const tileX = firstSmallerTile.x >> 2;
        const tileY = firstSmallerTile.y >> 2;
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
            location: new admin.firestore.GeoPoint(coords[1], coords[0]),
            location_raw: { lat: coords[1], lng: coords[0] },
            weight,
            spot_id: (c.properties && c.properties.spot_id) || null,
          } as ClusterTileDot;
        });

        // set the cluster tile (occupancy only)
        clusterTiles.set(tileKey, {
          zoom: zoom,
          x: tileX,
          y: tileY,
          dots: clusterDots,
          spots: [], // No spots preview data
        });

        // also add the zoom tile to the cluster tiles map for the next zoom level
        if (zoom > 2) {
          const tile = clusterTiles.get(tileKey)!;
          const key = `z${zoom - 2}_${tile.x >> 2}_${tile.y >> 2}`;
          if (!clusterTilesMap[zoom - 2].has(key)) {
            clusterTilesMap[zoom - 2].set(key, [tileKey]);
          } else {
            clusterTilesMap[zoom - 2].get(key)!.push(tileKey);
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
    .select("location", "location_raw", "tile_coordinates")
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
