import { Injectable } from "@angular/core";
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "@angular/fire/firestore";
import { SpotSlugSchema } from "../../../../db/schemas/SpotSlugSchema";
import { SpotId } from "../../../../db/schemas/SpotSchema";

@Injectable({
  providedIn: "root",
})
export class SlugsService {
  constructor(private firestore: Firestore) {}

  addEvent() {}

  getEventById() {}

  getEvents(
    sortByNext: boolean = true,
    location?: any,
    pageSize: number = 10
  ) {}
}
