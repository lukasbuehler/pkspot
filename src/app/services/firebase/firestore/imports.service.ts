import { Injectable, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import {
  ImportChunkSchema,
  ImportSchema,
} from "../../../../db/schemas/ImportSchema";

type ImportDocument = ImportSchema & { id: string };

@Injectable({
  providedIn: "root",
})
export class ImportsService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private _importCache = new Map<string, ImportDocument | null>();
  private _inFlightImportRequests = new Map<
    string,
    Promise<ImportDocument | null>
  >();

  private _removeUndefinedDeep<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .map((entry) => this._removeUndefinedDeep(entry))
        .filter((entry) => entry !== undefined) as T;
    }

    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
        if (entry === undefined) {
          return;
        }
        result[key] = this._removeUndefinedDeep(entry);
      });
      return result as T;
    }

    return value;
  }

  createImport(
    data: Omit<ImportSchema, "created_at">,
    importId?: string
  ): Promise<string> {
    const payload = this._removeUndefinedDeep({
      ...data,
      created_at: Timestamp.now(),
    }) as ImportSchema;
    if (importId) {
      return this._firestoreAdapter
        .setDocument(`imports/${importId}`, payload)
        .then(() => {
          this._importCache.set(importId, {
            id: importId,
            ...payload,
          });
          this._inFlightImportRequests.delete(importId);
          return importId;
        });
    }
    return this._firestoreAdapter
      .addDocument("imports", payload)
      .then((newImportId) => {
        this._importCache.set(newImportId, {
          id: newImportId,
          ...payload,
        });
        this._inFlightImportRequests.delete(newImportId);
        return newImportId;
      });
  }

  updateImport(importId: string, data: Partial<ImportSchema>): Promise<void> {
    const payload = this._removeUndefinedDeep({
      ...data,
      updated_at: Timestamp.now(),
    });
    return this._firestoreAdapter
      .updateDocument(`imports/${importId}`, payload)
      .then(() => {
        const cached = this._importCache.get(importId);
        if (!cached) {
          return;
        }

        this._importCache.set(importId, {
          ...cached,
          ...(payload as Partial<ImportSchema>),
        });
      });
  }

  getImportById(importId: string): Promise<ImportDocument | null> {
    if (this._importCache.has(importId)) {
      return Promise.resolve(this._importCache.get(importId) ?? null);
    }

    const inFlightRequest = this._inFlightImportRequests.get(importId);
    if (inFlightRequest) {
      return inFlightRequest;
    }

    const request = this._firestoreAdapter
      .getDocument<ImportDocument>(`imports/${importId}`)
      .then((importDoc) => {
        this._importCache.set(importId, importDoc);
        return importDoc;
      })
      .finally(() => {
        this._inFlightImportRequests.delete(importId);
      });

    this._inFlightImportRequests.set(importId, request);
    return request;
  }

  setImportChunk(
    importId: string,
    chunkId: string,
    chunk: Omit<ImportChunkSchema, "created_at">
  ): Promise<void> {
    const payload = this._removeUndefinedDeep({
      ...chunk,
      created_at: Timestamp.now(),
    }) as ImportChunkSchema;
    return this._firestoreAdapter.setDocument(
      `imports/${importId}/chunks/${chunkId}`,
      payload
    );
  }
}
