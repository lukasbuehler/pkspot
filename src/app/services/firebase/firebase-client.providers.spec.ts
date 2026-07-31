import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import {
  FIREBASE_APP,
  FIREBASE_FIRESTORE,
  FIREBASE_FUNCTIONS,
  FIREBASE_STORAGE,
  provideFirebaseClient,
} from "./firebase-client.providers";

describe("provideFirebaseClient", () => {
  it("provides singleton direct-SDK instances and keeps Storage out of SSR", () => {
    TestBed.configureTestingModule({
      providers: [
        provideFirebaseClient(),
        { provide: PLATFORM_ID, useValue: "server" },
      ],
    });

    const app = TestBed.inject(FIREBASE_APP);
    const firestore = TestBed.inject(FIREBASE_FIRESTORE);
    const functions = TestBed.inject(FIREBASE_FUNCTIONS);

    expect(TestBed.inject(FIREBASE_APP)).toBe(app);
    expect(TestBed.inject(FIREBASE_FIRESTORE)).toBe(firestore);
    expect(TestBed.inject(FIREBASE_FUNCTIONS)).toBe(functions);
    expect(firestore.app).toBe(app);
    expect(functions.app).toBe(app);
    expect(functions.region).toBe("europe-west1");
    expect(TestBed.inject(FIREBASE_STORAGE)).toBeNull();
  });
});
