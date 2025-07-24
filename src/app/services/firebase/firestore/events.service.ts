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
import { ConsentAwareService } from "../../consent-aware.service";

@Injectable({
  providedIn: "root",
})
export class SlugsService extends ConsentAwareService {
  constructor(private firestore: Firestore) {
    super();
  }

  addEvent() {}

  getEventById() {}

  getEvents(
    sortByNext: boolean = true,
    location?: any,
    pageSize: number = 10
  ) {}
}
