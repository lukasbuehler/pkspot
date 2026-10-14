import { TestBed } from "@angular/core/testing";
import { Timestamp } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LogEntryDocument } from "../../../../db/schemas/LogEntrySchema";
import type { SessionRecordDocument } from "../../../../db/schemas/SessionRecordSchema";
import { FeatureTelemetryService } from "../../feature-telemetry.service";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { LogEntriesService } from "./log-entries.service";

describe("private training notes", () => {
  const auth = {user: {uid: "owner"}};
  const firestore = {getCollection: vi.fn(), getDocument: vi.fn(), addDocument: vi.fn(), updateDocument: vi.fn(), deleteDocument: vi.fn()};
  const time = Timestamp.fromMillis(1_000);
  const session: SessionRecordDocument = {
    id: "session", owner_id: "owner", source: "check_in", time_zone: "UTC",
    started_at: time, started_at_raw_ms: 1_000, last_activity_at: time, last_activity_raw_ms: 1_000,
    time_created: time, time_created_raw_ms: 1_000, time_updated: time, time_updated_raw_ms: 1_000,
    spot_visits: [], people_present: [],
  };
  let service: LogEntriesService;
  beforeEach(() => {
    vi.resetAllMocks();
    auth.user.uid = "owner";
    TestBed.configureTestingModule({providers: [
      LogEntriesService,
      {provide: AuthenticationService, useValue: auth},
      {provide: FirestoreAdapterService, useValue: firestore},
      {provide: FeatureTelemetryService, useValue: {run: (_feature: string, _action: string, callback: () => Promise<unknown>) => callback()}},
    ]});
    service = TestBed.inject(LogEntriesService);
  });

  it("reads legacy audience values only from the current owner's collection without rewriting them", async () => {
    const legacy = {id: "old-note", owner_id: "owner", note: "Keep this memory", visibility: "public"} as LogEntryDocument;
    firestore.getCollection.mockResolvedValue([legacy]);
    firestore.getDocument.mockResolvedValue(legacy);
    expect(await service.listMine()).toEqual([legacy]);
    expect(firestore.getCollection).toHaveBeenCalledWith("users/owner/log_entries", [], expect.any(Array));
    expect(await service.getMine("old-note")).toEqual(legacy);
    expect(firestore.getDocument).toHaveBeenCalledWith("users/owner/log_entries/old-note");
    expect(firestore.updateDocument).not.toHaveBeenCalled();
  });

  it.each(["public", "followers", "friends"])("forces private writes despite a stale %s caller", async visibility => {
    const input = {note: "  Quiet landings  ", sessions: [session], visibility};
    await service.create(input);
    expect(firestore.addDocument).toHaveBeenCalledWith("users/owner/log_entries", expect.objectContaining({owner_id: "owner", note: "Quiet landings", visibility: "private", session_record_ids: ["session"]}));
    await service.update("old-note", input);
    expect(firestore.updateDocument).toHaveBeenCalledWith("users/owner/log_entries/old-note", expect.objectContaining({note: "Quiet landings", visibility: "private"}));
  });

  it("has no anonymous read fallback and cannot address another user's notes", async () => {
    auth.user.uid = "";
    await expect(service.listMine()).rejects.toThrow("signed-in user");
    await expect(service.getMine("old-note")).rejects.toThrow("signed-in user");
    expect(firestore.getCollection).not.toHaveBeenCalled();
    expect(firestore.getDocument).not.toHaveBeenCalled();
    expect("listForOwner" in service).toBe(false);
    auth.user.uid = "different-owner";
    await service.delete("old-note");
    expect(firestore.deleteDocument).toHaveBeenCalledWith("users/different-owner/log_entries/old-note");
  });
});
