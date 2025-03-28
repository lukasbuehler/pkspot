import { MediaType } from "../models/Interfaces";

export interface MediaSchema {
  type: MediaType;
  src: string;
  uid?: string;
  isInStorage: boolean;
  origin?: "user" | "streetview" | "other";
}
