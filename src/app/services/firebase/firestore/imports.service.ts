import { Injectable, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import {
  ImportChunkSchema,
  ImportSchema,
} from "../../../../db/schemas/ImportSchema";

@Injectable({
  providedIn: "root",
})
export class ImportsService {
  private _firestoreAdapter = inject(FirestoreAdapterService);

  createImport(
    data: Omit<ImportSchema, "created_at">,
    importId?: string
  ): Promise<string> {
    const payload: ImportSchema = {
      ...data,
      created_at: Timestamp.now(),
    };
    if (importId) {
      return this._firestoreAdapter
        .setDocument(`imports/${importId}`, payload)
        .then(() => importId);
    }
    return this._firestoreAdapter.addDocument("imports", payload);
  }

  updateImport(importId: string, data: Partial<ImportSchema>): Promise<void> {
    return this._firestoreAdapter.updateDocument(`imports/${importId}`, {
      ...data,
      updated_at: Timestamp.now(),
    });
  }

  getImportById(importId: string): Promise<(ImportSchema & { id: string }) | null> {
    return this._firestoreAdapter.getDocument<ImportSchema & { id: string }>(
      `imports/${importId}`
    );
  }

  setImportChunk(
    importId: string,
    chunkId: string,
    chunk: Omit<ImportChunkSchema, "created_at">
  ): Promise<void> {
    const payload: ImportChunkSchema = {
      ...chunk,
      created_at: Timestamp.now(),
    };
    return this._firestoreAdapter.setDocument(
      `imports/${importId}/chunks/${chunkId}`,
      payload
    );
  }
}
