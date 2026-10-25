import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { PlaceNamesService } from "./place-names.service";
import { FirestoreAdapterService } from "./firebase/firestore-adapter.service";
import { entityPlaceKey } from "../../scripts/EntityPlaceNames";

describe("PlaceNamesService", () => {
  it("reuses a stored result, checks identity and never writes or enriches", async () => {
    const input = { countryCode: "DE", locality: "Munich", lat: 48.14, lng: 11.58 };
    const getDocument = vi.fn().mockResolvedValue({ key: entityPlaceKey(input), source: "geonames", geonamesId: 2867714, names: { it: "Monaco di Baviera" }, center: [48.137, 11.576] });
    TestBed.configureTestingModule({ providers: [{ provide: FirestoreAdapterService, useValue: { getDocument } }] });
    const service = TestBed.inject(PlaceNamesService);
    const [a, b] = await Promise.all([service.get(input), service.get(input)]);
    expect(a?.names["it"]).toBe("Monaco di Baviera");
    expect(a).toBe(b);
    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(await service.get({ ...input, lat: undefined })).toBeUndefined();
    expect(getDocument).toHaveBeenCalledTimes(1);
  });
});
