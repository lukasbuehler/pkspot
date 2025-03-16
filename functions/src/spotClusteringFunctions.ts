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

interface ClusterTileDot {
  location: GeoPoint;
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

        if (!spot.location) {
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

        const clusterTileDot: ClusterTileDot = {
          location: spot.location,
          weight: 1,
          spot_id: id,
        };

        let spotForTile: SpotPreviewData;
        if (spotIsClusterWorthy) {
          spotForTile = {
            name: getSpotName(spot, "en"),
            id: id,
            isIconic: spot.is_iconic ?? false,
            imageSrc: getSpotPreviewImage(spot),
            locality: getSpotLocalityString(spot),
          };

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

    // actual clustering
    for (let zoom = 8; zoom >= 4; zoom -= 4) {
      // for each z cluster tile to compute in the map
      for (let [tileKey, smallerTileKeys] of clusterTilesMap[
        zoom as 8 | 4
      ].entries()) {
        const firstSmallerTile = clusterTiles.get(smallerTileKeys[0])!;

        // cluster the dots
        const clusterDots: ClusterTileDot[] = smallerTileKeys
          .map((key) => {
            return (clusterTiles.get(key) as SpotClusterTile).dots;
          })
          .map((dots) => {
            const totalWeight = dots.reduce((acc, dot) => acc + dot.weight, 0);
            return dots.reduce(
              (acc, dot) => {
                let newLatitude =
                  acc.location.latitude +
                  (dot.weight * dot.location.latitude) / totalWeight;
                let newLongitude =
                  acc.location.longitude +
                  (dot.weight * dot.location.longitude) / totalWeight;

                // Wrap around latitude [-90, 90], longitude around [-180, 180]
                newLatitude = ((((newLatitude + 90) % 180) + 180) % 180) - 90;
                newLongitude =
                  ((((newLongitude + 180) % 360) + 360) % 360) - 180;

                const newGeopoint = new GeoPoint(newLatitude, newLongitude);
                acc.location = newGeopoint;
                acc.weight += dot.weight;
                return acc;
              },
              { location: new GeoPoint(0, 0), weight: 0 }
            );
          });

        // only add the best spots to the cluster tile
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
                ? Math.max(spot.rating ?? 1, iconicScore)
                : spot.rating ?? 2,
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
