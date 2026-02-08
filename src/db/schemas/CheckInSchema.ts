import { Timestamp } from "firebase/firestore";

export interface CheckInSchema {
  spot_id: string; // The ID of the spot checked into
  timestamp: Timestamp; // Server timestamp
  timestamp_raw_ms: number; // For easy sorting on client/Capacitor

  // Preview data to display in history without extra reads
  spot_name: string;
  spot_slug?: string;
  spot_thumbnail_src?: string; // Optional, might not exist for some spots
}
