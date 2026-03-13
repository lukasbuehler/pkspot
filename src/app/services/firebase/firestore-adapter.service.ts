import {
  Injectable,
  inject,
  NgZone,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { Observable, from, Subject, BehaviorSubject } from "rxjs";
import { map, shareReplay, takeUntil } from "rxjs/operators";
import { PlatformService } from "../platform.service";

// Web imports (AngularFire)
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  collectionGroup,
  query,
  where,
  startAfter,
  orderBy,
  limit,
  getDocs,
  QueryConstraint as AngularFireQueryConstraint,
} from "@angular/fire/firestore";
import {
  collection as rawCollection,
  collectionGroup as rawCollectionGroup,
  doc as rawDoc,
  onSnapshot as rawOnSnapshot,
  orderBy as rawOrderBy,
  limit as rawLimit,
  query as rawQuery,
  where as rawWhere,
  QueryConstraint as RawQueryConstraint,
} from "firebase/firestore";

// Native imports (Capacitor Firebase)
import {
  FirebaseFirestore,
  GetCollectionOptions,
  QueryCompositeFilterConstraint,
  QueryFieldFilterConstraint,
  QueryNonFilterConstraint,
  DocumentSnapshot,
} from "@capacitor-firebase/firestore";
import { transformFirestoreData } from "../../../scripts/Helpers";

/**
 * Query filter for Firestore queries.
 * Used by both web and native implementations.
 */
export interface QueryFilter {
  fieldPath: string;
  opStr:
    | "<"
    | "<="
    | "=="
    | ">="
    | ">"
    | "!="
    | "array-contains"
    | "array-contains-any"
    | "in"
    | "not-in";
  value: any;
}

/**
 * Query constraint for ordering, limiting, etc.
 */
export interface QueryConstraintOptions {
  type: "orderBy" | "limit" | "limitToLast";
  fieldPath?: string;
  direction?: "asc" | "desc";
  limit?: number;
}

/**
 * FirestoreAdapterService provides a unified API for Firestore operations
 * that works on both web (via @angular/fire) and native platforms
 * (via @capacitor-firebase/firestore).
 *
 * This abstraction allows the rest of the application to use the same
 * code regardless of the platform, while ensuring native performance
 * and real-time listeners work correctly on iOS/Android.
 */
@Injectable({
  providedIn: "root",
})
export class FirestoreAdapterService {
  private platformService = inject(PlatformService);
  private firestore = inject(Firestore);
  private ngZone = inject(NgZone);
  private injector = inject(Injector);
  private readonly iosWebCollectionTimeoutMs = 15000;
  private readonly firestoreRestBaseUrl = "https://firestore.googleapis.com/v1";

  // Track active listeners for cleanup
  private activeListeners = new Map<string, () => void>();

  constructor() {
    console.log(
      `[FirestoreAdapter] Initialized for platform: ${this.platformService.getPlatform()}`
    );
  }

  private removeSnapshotListenerSafe(callbackId: string): void {
    FirebaseFirestore.removeSnapshotListener({ callbackId }).catch((error) => {
      console.warn(
        `[FirestoreAdapter] Failed to remove snapshot listener ${callbackId}:`,
        error
      );
    });
  }

  /**
   * iOS has known serialization issues in the native Firestore collection bridge.
   * Keep document operations native, but use web SDK for collection queries on iOS.
   */
  private shouldUseNativeQueryBridge(): boolean {
    return (
      this.platformService.isNative() && this.platformService.getPlatform() !== "ios"
    );
  }

  private summarizeFilters(
    filters?: QueryFilter[]
  ): Array<{ fieldPath: string; opStr: QueryFilter["opStr"] }> {
    return (filters || []).map((filter) => ({
      fieldPath: filter.fieldPath,
      opStr: filter.opStr,
    }));
  }

  private summarizeConstraints(
    constraints?: QueryConstraintOptions[]
  ): Array<{
    type: QueryConstraintOptions["type"];
    fieldPath?: string;
    direction?: "asc" | "desc";
    limit?: number;
  }> {
    return this.sanitizeQueryConstraints(constraints, "query", false).map(
      (constraint) => ({
        type: constraint.type,
        fieldPath: constraint.fieldPath,
        direction: constraint.direction,
        limit: constraint.limit,
      })
    );
  }

  private sanitizeQueryConstraints(
    constraints?: QueryConstraintOptions[],
    target: string = "query",
    warn: boolean = true
  ): QueryConstraintOptions[] {
    if (!constraints) {
      return [];
    }

    if (!Array.isArray(constraints)) {
      if (warn) {
        console.warn(
          `[FirestoreAdapter] Ignoring invalid query constraints for ${target}: expected an array.`,
          constraints
        );
      }
      return [];
    }

    const sanitized: QueryConstraintOptions[] = [];

    for (const constraint of constraints) {
      if (!constraint || typeof constraint !== "object") {
        if (warn) {
          console.warn(
            `[FirestoreAdapter] Ignoring malformed query constraint for ${target}.`,
            constraint
          );
        }
        continue;
      }

      if (constraint.type === "orderBy") {
        const fieldPath =
          typeof constraint.fieldPath === "string"
            ? constraint.fieldPath.trim()
            : "";
        if (!fieldPath) {
          if (warn) {
            console.warn(
              `[FirestoreAdapter] Ignoring orderBy constraint without a valid field path for ${target}.`,
              constraint
            );
          }
          continue;
        }

        sanitized.push({
          type: "orderBy",
          fieldPath,
          direction: constraint.direction === "desc" ? "desc" : "asc",
        });
        continue;
      }

      if (
        constraint.type === "limit" ||
        constraint.type === "limitToLast"
      ) {
        const normalizedLimit =
          typeof constraint.limit === "number" &&
          Number.isFinite(constraint.limit)
            ? Math.trunc(constraint.limit)
            : NaN;

        if (!Number.isInteger(normalizedLimit) || normalizedLimit <= 0) {
          if (warn) {
            console.warn(
              `[FirestoreAdapter] Ignoring ${constraint.type} constraint without a positive numeric limit for ${target}.`,
              constraint
            );
          }
          continue;
        }

        sanitized.push({
          type: constraint.type,
          limit: normalizedLimit,
        });
        continue;
      }

      if (warn) {
        console.warn(
          `[FirestoreAdapter] Ignoring unsupported query constraint for ${target}.`,
          constraint
        );
      }
    }

    return sanitized;
  }

  private normalizeWebFilterValue(value: unknown): unknown {
    if (!value || typeof value !== "object") {
      return value;
    }

    const candidate = value as {
      path?: unknown;
      type?: unknown;
    };

    if (
      candidate.type === "document" &&
      typeof candidate.path === "string" &&
      candidate.path.length > 0
    ) {
      return rawDoc(this.firestore, candidate.path);
    }

    return value;
  }

  private buildRawWebQueryConstraints(
    target: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): RawQueryConstraint[] {
    const rawConstraints: RawQueryConstraint[] = [];
    const sanitizedConstraints = this.sanitizeQueryConstraints(constraints, target);

    if (filters) {
      for (const filter of filters) {
        rawConstraints.push(
          rawWhere(
            filter.fieldPath,
            filter.opStr,
            this.normalizeWebFilterValue(filter.value)
          )
        );
      }
    }

    for (const constraint of sanitizedConstraints) {
      if (constraint.type === "orderBy" && constraint.fieldPath) {
        rawConstraints.push(
          rawOrderBy(constraint.fieldPath, constraint.direction)
        );
      } else if (constraint.type === "limit" && constraint.limit) {
        rawConstraints.push(rawLimit(constraint.limit));
      }
    }

    return rawConstraints;
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(
        () => reject(new Error(timeoutMessage)),
        timeoutMs
      );

      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private async runCollectionQuery<T>(
    operation: "getCollection" | "getCollectionGroup",
    target: string,
    useNativeBridge: boolean,
    filters: QueryFilter[] | undefined,
    constraints: QueryConstraintOptions[] | undefined,
    execute: () => Promise<T>
  ): Promise<T> {
    const platform = this.platformService.getPlatform();
    const timeoutMs =
      platform === "ios" && !useNativeBridge
        ? this.iosWebCollectionTimeoutMs
        : null;
    const filterSummary = this.summarizeFilters(filters);
    const constraintSummary = this.summarizeConstraints(constraints);
    const startedAt = Date.now();

    console.debug(`[FirestoreAdapter] ${operation} START`, {
      platform,
      target,
      useNativeBridge,
      timeoutMs,
      filters: filterSummary,
      constraints: constraintSummary,
    });

    const operationPromise = execute();
    const wrappedPromise = timeoutMs
      ? this.withTimeout(
          operationPromise,
          timeoutMs,
          `${operation} timed out after ${timeoutMs}ms`
        )
      : operationPromise;

    try {
      const result = await wrappedPromise;
      const durationMs = Date.now() - startedAt;
      const resultCount = Array.isArray(result) ? result.length : undefined;
      console.debug(`[FirestoreAdapter] ${operation} OK`, {
        platform,
        target,
        durationMs,
        resultCount,
      });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      console.error(`[FirestoreAdapter] ${operation} FAIL`, {
        platform,
        target,
        durationMs,
        useNativeBridge,
        timeoutMs,
        filters: filterSummary,
        constraints: constraintSummary,
      }, error);
      throw error;
    }
  }

  private getFirestoreProjectId(): string {
    const projectId = (this.firestore as any)?.app?.options?.projectId;
    return typeof projectId === "string" && projectId.length > 0
      ? projectId
      : "parkour-base-project";
  }

  private buildRunQueryUrl(): string {
    const projectId = this.getFirestoreProjectId();
    return `${this.firestoreRestBaseUrl}/projects/${projectId}/databases/(default)/documents:runQuery`;
  }

  private mapQueryOperatorToRestOperator(op: QueryFilter["opStr"]): string {
    const map: Record<QueryFilter["opStr"], string> = {
      "<": "LESS_THAN",
      "<=": "LESS_THAN_OR_EQUAL",
      "==": "EQUAL",
      ">=": "GREATER_THAN_OR_EQUAL",
      ">": "GREATER_THAN",
      "!=": "NOT_EQUAL",
      "array-contains": "ARRAY_CONTAINS",
      "array-contains-any": "ARRAY_CONTAINS_ANY",
      in: "IN",
      "not-in": "NOT_IN",
    };
    return map[op];
  }

  private toFirestoreRestValue(value: unknown): Record<string, unknown> {
    if (value === null) {
      return { nullValue: null };
    }
    if (value === undefined) {
      throw new Error("Undefined filter values are not supported.");
    }
    if (typeof value === "string") {
      return { stringValue: value };
    }
    if (typeof value === "boolean") {
      return { booleanValue: value };
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return { integerValue: value.toString() };
      }
      return { doubleValue: value };
    }
    if (value instanceof Date) {
      return { timestampValue: value.toISOString() };
    }
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((v) => this.toFirestoreRestValue(v)),
        },
      };
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;

      if (
        typeof obj["seconds"] === "number" &&
        typeof obj["nanoseconds"] === "number"
      ) {
        const ms =
          (obj["seconds"] as number) * 1000 +
          (obj["nanoseconds"] as number) / 1_000_000;
        return { timestampValue: new Date(ms).toISOString() };
      }

      if (
        typeof obj["latitude"] === "number" &&
        typeof obj["longitude"] === "number"
      ) {
        return {
          geoPointValue: {
            latitude: obj["latitude"],
            longitude: obj["longitude"],
          },
        };
      }

      const fields: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(obj)) {
        if (nestedValue === undefined) {
          continue;
        }
        fields[key] = this.toFirestoreRestValue(nestedValue);
      }
      return { mapValue: { fields } };
    }

    throw new Error(`Unsupported filter value type: ${typeof value}`);
  }

  private buildStructuredWhere(filters?: QueryFilter[]): Record<string, unknown> | null {
    if (!filters || filters.length === 0) {
      return null;
    }

    const fieldFilters = filters.map((filter) => ({
      fieldFilter: {
        field: { fieldPath: filter.fieldPath },
        op: this.mapQueryOperatorToRestOperator(filter.opStr),
        value: this.toFirestoreRestValue(filter.value),
      },
    }));

    if (fieldFilters.length === 1) {
      return fieldFilters[0];
    }

    return {
      compositeFilter: {
        op: "AND",
        filters: fieldFilters,
      },
    };
  }

  private buildStructuredQuery(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[],
    options?: { allDescendants?: boolean }
  ): {
    from: Array<{ collectionId: string; allDescendants?: boolean }>;
    where?: Record<string, unknown>;
    orderBy?: Array<{
      field: { fieldPath?: string };
      direction: "ASCENDING" | "DESCENDING";
    }>;
    limit?: number;
  } {
    const query: {
      from: Array<{ collectionId: string; allDescendants?: boolean }>;
      where?: Record<string, unknown>;
      orderBy?: Array<{
        field: { fieldPath?: string };
        direction: "ASCENDING" | "DESCENDING";
      }>;
      limit?: number;
    } = {
      from: [
        {
          collectionId,
          ...(options?.allDescendants ? { allDescendants: true } : {}),
        },
      ],
    };

    const whereClause = this.buildStructuredWhere(filters);
    if (whereClause) {
      query.where = whereClause;
    }

    const orderByConstraints = (constraints || []).filter(
      (constraint) => constraint.type === "orderBy" && constraint.fieldPath
    );
    if (orderByConstraints.length > 0) {
      query.orderBy = orderByConstraints.map((constraint) => ({
        field: { fieldPath: constraint.fieldPath },
        direction:
          constraint.direction === "desc" ? "DESCENDING" : "ASCENDING",
      }));
    }

    const limitConstraint = (constraints || []).find(
      (constraint) =>
        (constraint.type === "limit" || constraint.type === "limitToLast") &&
        typeof constraint.limit === "number"
    );
    if (limitConstraint?.limit !== undefined) {
      query.limit = limitConstraint.limit;
    }

    return query;
  }

  private extractIdFromDocumentName(documentName: string): string {
    const parts = documentName.split("/");
    return parts[parts.length - 1] ?? "";
  }

  private async runQueryHttp<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[],
    options?: { allDescendants?: boolean }
  ): Promise<T[]> {
    const response = await fetch(this.buildRunQueryUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: this.buildStructuredQuery(
          collectionId,
          filters,
          constraints,
          options
        ),
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `Firestore REST runQuery failed: ${response.status} ${response.statusText} ${responseText}`
      );
    }

    const raw = (await response.json()) as Array<{
      document?: {
        name: string;
        fields?: Record<string, unknown>;
      };
    }>;

    const rows = Array.isArray(raw) ? raw : [raw];
    const documents = rows
      .filter((row) => row?.document?.name)
      .map((row) => row.document as { name: string; fields?: Record<string, unknown> });

    return documents.map((document) => ({
      id: this.extractIdFromDocumentName(document.name),
      ...(transformFirestoreData(document.fields || {}) as Record<string, unknown>),
    })) as T[];
  }

  private async getCollectionHttp<T>(
    collectionPath: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Promise<T[]> {
    if (collectionPath.includes("/")) {
      throw new Error(
        `Collection path '${collectionPath}' is not supported by REST runQuery helper.`
      );
    }
    return this.runQueryHttp<T>(collectionPath, filters, constraints, {
      allDescendants: false,
    });
  }

  private async getCollectionGroupHttp<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Promise<T[]> {
    return this.runQueryHttp<T>(collectionId, filters, constraints, {
      allDescendants: true,
    });
  }

  // ============================================================================
  // DOCUMENT OPERATIONS
  // ============================================================================

  /**
   * Get a single document by path.
   * @param path Full document path (e.g., 'spots/abc123')
   * @returns Promise resolving to document data or null if not found
   */
  async getDocument<T>(path: string): Promise<T | null> {
    if (this.platformService.isNative()) {
      return this.getDocumentNative<T>(path);
    }
    return this.getDocumentWeb<T>(path);
  }

  private async getDocumentWeb<T>(path: string): Promise<T | null> {
    return runInInjectionContext(this.injector, async () => {
      const docRef = doc(this.firestore, path);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as T;
      }
      return null;
    });
  }

  private async getDocumentNative<T>(path: string): Promise<T | null> {
    try {
      const result = await FirebaseFirestore.getDocument({
        reference: path,
      });
      if (result.snapshot?.data) {
        return { id: result.snapshot.id, ...result.snapshot.data } as T;
      }
      return null;
    } catch (error) {
      console.error(
        `[FirestoreAdapter] Native getDocument ${path} ERROR:`,
        error
      );
      throw error;
    }
  }

  /**
   * Set a document (create or overwrite).
   * @param path Full document path
   * @param data Document data
   * @param options Optional merge options
   */
  async setDocument<T extends Record<string, any>>(
    path: string,
    data: T,
    options?: { merge?: boolean }
  ): Promise<void> {
    if (this.platformService.isNative()) {
      return this.setDocumentNative(path, data, options);
    }
    return this.setDocumentWeb(path, data, options);
  }

  private async setDocumentWeb<T extends Record<string, any>>(
    path: string,
    data: T,
    options?: { merge?: boolean }
  ): Promise<void> {
    return runInInjectionContext(this.injector, async () => {
      const docRef = doc(this.firestore, path);
      await setDoc(docRef, data, options || {});
    });
  }

  private async setDocumentNative<T extends Record<string, any>>(
    path: string,
    data: T,
    options?: { merge?: boolean }
  ): Promise<void> {
    await FirebaseFirestore.setDocument({
      reference: path,
      data: data,
      merge: options?.merge,
    });
  }

  /**
   * Update a document (partial update, document must exist).
   * @param path Full document path
   * @param data Partial document data to merge
   */
  async updateDocument<T extends Record<string, any>>(
    path: string,
    data: Partial<T>
  ): Promise<void> {
    if (this.platformService.isNative()) {
      return this.updateDocumentNative(path, data);
    }
    return this.updateDocumentWeb(path, data);
  }

  private async updateDocumentWeb<T extends Record<string, any>>(
    path: string,
    data: Partial<T>
  ): Promise<void> {
    return runInInjectionContext(this.injector, async () => {
      const docRef = doc(this.firestore, path);
      await updateDoc(docRef, data as any);
    });
  }

  private async updateDocumentNative<T extends Record<string, any>>(
    path: string,
    data: Partial<T>
  ): Promise<void> {
    await FirebaseFirestore.updateDocument({
      reference: path,
      data: data as Record<string, any>,
    });
  }

  /**
   * Delete a document.
   * @param path Full document path
   */
  async deleteDocument(path: string): Promise<void> {
    if (this.platformService.isNative()) {
      return this.deleteDocumentNative(path);
    }
    return this.deleteDocumentWeb(path);
  }

  private async deleteDocumentWeb(path: string): Promise<void> {
    return runInInjectionContext(this.injector, async () => {
      const docRef = doc(this.firestore, path);
      await deleteDoc(docRef);
    });
  }

  private async deleteDocumentNative(path: string): Promise<void> {
    await FirebaseFirestore.deleteDocument({
      reference: path,
    });
  }

  /**
   * Add a document with auto-generated ID.
   * @param collectionPath Collection path
   * @param data Document data
   * @returns The generated document ID
   */
  async addDocument<T extends Record<string, any>>(
    collectionPath: string,
    data: T
  ): Promise<string> {
    if (this.platformService.isNative()) {
      return this.addDocumentNative(collectionPath, data);
    }
    return this.addDocumentWeb(collectionPath, data);
  }

  private async addDocumentWeb<T extends Record<string, any>>(
    collectionPath: string,
    data: T
  ): Promise<string> {
    return runInInjectionContext(this.injector, async () => {
      const collRef = collection(this.firestore, collectionPath);
      const docRef = await addDoc(collRef, data);
      return docRef.id;
    });
  }

  private async addDocumentNative<T extends Record<string, any>>(
    collectionPath: string,
    data: T
  ): Promise<string> {
    const result = await FirebaseFirestore.addDocument({
      reference: collectionPath,
      data: data,
    });
    // Extract ID from reference path
    const parts = result.reference.path.split("/");
    return parts[parts.length - 1];
  }

  // ============================================================================
  // COLLECTION QUERIES (ONE-TIME)
  // ============================================================================

  /**
   * Query a collection (one-time fetch).
   * @param collectionPath Collection path
   * @param filters Optional array of where filters
   * @param constraints Optional array of orderBy/limit constraints
   */
  async getCollection<T>(
    collectionPath: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Promise<T[]> {
    const platform = this.platformService.getPlatform();
    if (platform === "ios") {
      return this.runCollectionQuery(
        "getCollection",
        collectionPath,
        false,
        filters,
        constraints,
        async () => {
          try {
            return await this.getCollectionHttp<T>(
              collectionPath,
              filters,
              constraints
            );
          } catch (httpError) {
            console.warn(
              `[FirestoreAdapter] iOS getCollection HTTP failed, falling back to web SDK for ${collectionPath}.`,
              httpError
            );
            return this.getCollectionWeb<T>(collectionPath, filters, constraints);
          }
        }
      );
    }

    const useNativeBridge = this.shouldUseNativeQueryBridge();
    return this.runCollectionQuery(
      "getCollection",
      collectionPath,
      useNativeBridge,
      filters,
      constraints,
      () =>
        useNativeBridge
          ? this.getCollectionNative<T>(collectionPath, filters, constraints)
          : this.getCollectionWeb<T>(collectionPath, filters, constraints)
    );
  }

  private async getCollectionWeb<T>(
    collectionPath: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Promise<T[]> {
    return runInInjectionContext(this.injector, async () => {
      const collRef = collection(this.firestore, collectionPath);
      const queryConstraints: AngularFireQueryConstraint[] = [];
      const sanitizedConstraints = this.sanitizeQueryConstraints(
        constraints,
        collectionPath
      );

      // Add where clauses
      if (filters) {
        for (const filter of filters) {
          queryConstraints.push(
            where(filter.fieldPath, filter.opStr, filter.value)
          );
        }
      }

      // Add orderBy/limit constraints
      if (sanitizedConstraints.length > 0) {
        for (const constraint of sanitizedConstraints) {
          if (constraint.type === "orderBy" && constraint.fieldPath) {
            queryConstraints.push(
              orderBy(constraint.fieldPath, constraint.direction)
            );
          } else if (constraint.type === "limit" && constraint.limit) {
            queryConstraints.push(limit(constraint.limit));
          }
        }
      }

      const q = query(collRef, ...queryConstraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
    });
  }

  private async getCollectionNative<T>(
    collectionPath: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Promise<T[]> {
    const options: GetCollectionOptions = {
      reference: collectionPath,
    };
    const sanitizedConstraints = this.sanitizeQueryConstraints(
      constraints,
      collectionPath
    );

    // Build composite filter if we have filters
    if (filters && filters.length > 0) {
      const queryFilters: QueryFieldFilterConstraint[] = filters.map((f) => ({
        type: "where" as const,
        fieldPath: f.fieldPath,
        opStr: f.opStr,
        value: f.value,
      }));

      if (queryFilters.length === 1) {
        // Single filter - use compositeFilter with 'and' containing one filter
        options.compositeFilter = {
          type: "and",
          queryConstraints: queryFilters,
        };
      } else {
        // Multiple filters - combine with 'and'
        options.compositeFilter = {
          type: "and",
          queryConstraints: queryFilters,
        };
      }
    }

    // Add non-filter constraints
    if (sanitizedConstraints.length > 0) {
      const mappedConstraints = sanitizedConstraints
        .map((c): QueryNonFilterConstraint | null => {
          if (c.type === "orderBy" && c.fieldPath) {
            return {
              type: "orderBy" as const,
              fieldPath: c.fieldPath,
              directionStr: (c.direction || "asc") as "asc" | "desc",
            };
          } else if (c.type === "limit" && c.limit) {
            return {
              type: "limit" as const,
              limit: c.limit,
            };
          }
          return null;
        })
        .filter((c): c is QueryNonFilterConstraint => c !== null);
      options.queryConstraints = mappedConstraints;
    }

    const result = await FirebaseFirestore.getCollection(options);
    return result.snapshots.map((snap) => ({
      id: snap.id,
      ...snap.data,
    })) as T[];
  }

  // ============================================================================
  // REAL-TIME LISTENERS
  // ============================================================================

  /**
   * Listen to a document in real-time.
   * @param path Full document path
   * @returns Observable that emits document data on changes
   */
  documentSnapshots<T>(path: string): Observable<T | null> {
    if (this.platformService.isNative()) {
      return this.documentSnapshotsNative<T>(path);
    }
    return this.documentSnapshotsWeb<T>(path);
  }

  private documentSnapshotsWeb<T>(path: string): Observable<T | null> {
    return new Observable<T | null>((observer) => {
      const docRef = rawDoc(this.firestore, path);
      const unsubscribe = rawOnSnapshot(
        docRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            observer.next(null);
            return;
          }

          observer.next({
            id: snapshot.id,
            ...snapshot.data(),
          } as T);
        },
        (error) => observer.error(error)
      );

      return () => unsubscribe();
    });
  }

  private documentSnapshotsNative<T>(path: string): Observable<T | null> {
    return new Observable<T | null>((observer) => {
      let callbackId: string | null = null;
      let isUnsubscribed = false;

      FirebaseFirestore.addDocumentSnapshotListener(
        { reference: path },
        (event, error) => {
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
              return;
            }
            if (event?.snapshot) {
              if (event.snapshot.data) {
                observer.next({
                  id: event.snapshot.id,
                  ...event.snapshot.data,
                } as T);
              } else {
                observer.next(null);
              }
            }
          });
        }
      )
        .then((id) => {
          callbackId = id;
          if (isUnsubscribed) {
            this.removeSnapshotListenerSafe(id);
          }
        })
        .catch((error) => {
          this.ngZone.run(() => observer.error(error));
        });

      // Cleanup function
      return () => {
        isUnsubscribed = true;
        if (callbackId) {
          this.removeSnapshotListenerSafe(callbackId);
          callbackId = null;
        }
      };
    });
  }

  /**
   * Listen to a collection query in real-time.
   * @param collectionPath Collection path
   * @param filters Optional array of where filters
   * @param constraints Optional array of orderBy/limit constraints
   * @returns Observable that emits array of documents on changes
   */
  collectionSnapshots<T>(
    collectionPath: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Observable<T[]> {
    if (this.platformService.isNative()) {
      return this.collectionSnapshotsNative<T>(
        collectionPath,
        filters,
        constraints
      );
    }
    return this.collectionSnapshotsWeb<T>(collectionPath, filters, constraints);
  }

  private collectionSnapshotsWeb<T>(
    collectionPath: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Observable<T[]> {
    return new Observable<T[]>((observer) => {
      const collRef = rawCollection(this.firestore, collectionPath);
      const q = rawQuery(
        collRef,
        ...this.buildRawWebQueryConstraints(collectionPath, filters, constraints)
      );

      const unsubscribe = rawOnSnapshot(
        q,
        (snapshot) => {
          observer.next(
            snapshot.docs.map((docSnapshot) => ({
              id: docSnapshot.id,
              ...docSnapshot.data(),
            })) as T[]
          );
        },
        (error) => observer.error(error)
      );

      return () => unsubscribe();
    });
  }

  private collectionSnapshotsNative<T>(
    collectionPath: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Observable<T[]> {
    return new Observable<T[]>((observer) => {
      let callbackId: string | null = null;
      let isUnsubscribed = false;

      const options: any = {
        reference: collectionPath,
      };
      const sanitizedConstraints = this.sanitizeQueryConstraints(
        constraints,
        collectionPath
      );

      // Build composite filter
      if (filters && filters.length > 0) {
        const queryFilters: QueryFieldFilterConstraint[] = filters.map((f) => ({
          type: "where" as const,
          fieldPath: f.fieldPath,
          opStr: f.opStr,
          value: f.value,
        }));

        options.compositeFilter = {
          type: "and",
          queryConstraints: queryFilters,
        };
      }

      // Add non-filter constraints
      if (sanitizedConstraints.length > 0) {
        const mappedConstraints = sanitizedConstraints
          .map((c): QueryNonFilterConstraint | null => {
            if (c.type === "orderBy" && c.fieldPath) {
              return {
                type: "orderBy" as const,
                fieldPath: c.fieldPath,
                directionStr: (c.direction || "asc") as "asc" | "desc",
              };
            } else if (c.type === "limit" && c.limit) {
              return {
                type: "limit" as const,
                limit: c.limit,
              };
            }
            return null;
          })
          .filter((c): c is QueryNonFilterConstraint => c !== null);
        options.queryConstraints = mappedConstraints;
      }

      FirebaseFirestore.addCollectionSnapshotListener(
        options,
        (event, error) => {
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
              return;
            }
            if (event?.snapshots) {
              const docs = event.snapshots.map((snap) => ({
                id: snap.id,
                ...snap.data,
              })) as T[];
              observer.next(docs);
            }
          });
        }
      )
        .then((id) => {
          callbackId = id;
          if (isUnsubscribed) {
            this.removeSnapshotListenerSafe(id);
          }
        })
        .catch((error) => {
          this.ngZone.run(() => observer.error(error));
        });

      // Cleanup function
      return () => {
        isUnsubscribed = true;
        if (callbackId) {
          this.removeSnapshotListenerSafe(callbackId);
          callbackId = null;
        }
      };
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Check if running on native platform (iOS/Android).
   */
  isNative(): boolean {
    return this.platformService.isNative();
  }

  /**
   * Get the current platform.
   */
  getPlatform(): "ios" | "android" | "web" {
    return this.platformService.getPlatform();
  }

  // ============================================================================
  // COLLECTION GROUP QUERIES
  // ============================================================================

  /**
   * Query a collection group (one-time fetch).
   * Collection group queries return documents from all collections with the same ID.
   * @param collectionId Collection ID (e.g., 'edits' to query all 'edits' subcollections)
   * @param filters Optional array of where filters
   * @param constraints Optional array of orderBy/limit constraints
   */
  async getCollectionGroup<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Promise<T[]> {
    const platform = this.platformService.getPlatform();
    if (platform === "ios") {
      return this.runCollectionQuery(
        "getCollectionGroup",
        collectionId,
        false,
        filters,
        constraints,
        async () => {
          try {
            return await this.getCollectionGroupHttp<T>(
              collectionId,
              filters,
              constraints
            );
          } catch (httpError) {
            console.warn(
              `[FirestoreAdapter] iOS getCollectionGroup HTTP failed, falling back to web SDK for ${collectionId}.`,
              httpError
            );
            return this.getCollectionGroupWeb<T>(collectionId, filters, constraints);
          }
        }
      );
    }

    const useNativeBridge = this.shouldUseNativeQueryBridge();
    return this.runCollectionQuery(
      "getCollectionGroup",
      collectionId,
      useNativeBridge,
      filters,
      constraints,
      () =>
        useNativeBridge
          ? this.getCollectionGroupNative<T>(collectionId, filters, constraints)
          : this.getCollectionGroupWeb<T>(collectionId, filters, constraints)
    );
  }

  private async getCollectionGroupWeb<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Promise<T[]> {
    return runInInjectionContext(this.injector, async () => {
      const collGroupRef = collectionGroup(this.firestore, collectionId);
      const queryConstraints: AngularFireQueryConstraint[] = [];

      // Add where clauses
      if (filters) {
        for (const filter of filters) {
          queryConstraints.push(
            where(filter.fieldPath, filter.opStr, filter.value)
          );
        }
      }

      // Add orderBy/limit constraints
      if (constraints) {
        for (const constraint of constraints) {
          if (constraint.type === "orderBy" && constraint.fieldPath) {
            queryConstraints.push(
              orderBy(constraint.fieldPath, constraint.direction)
            );
          } else if (constraint.type === "limit" && constraint.limit) {
            queryConstraints.push(limit(constraint.limit));
          }
        }
      }

      const q = query(collGroupRef, ...queryConstraints);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
    });
  }

  /**
   * Query a collection group (one-time fetch) and return documents with metadata (id, path) and the last snapshot.
   * Useful for pagination.
   */
  async getCollectionGroupWithMetadata<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[],
    startAfterDoc?: any
  ): Promise<{ data: Array<T & { id: string; path: string }>; lastDoc: any }> {
    if (this.shouldUseNativeQueryBridge()) {
      console.warn(
        "getCollectionGroupWithMetadata pagination not fully supported on native yet."
      );
      // Native fallback (no pagination support yet)
      const docs = await this.getCollectionGroupNative<T>(
        collectionId,
        filters,
        constraints
      );
      return {
        data: docs.map((d: any) => ({ ...d, path: "" })),
        lastDoc: null,
      };
    }
    return this.getCollectionGroupWebWithMetadata<T>(
      collectionId,
      filters,
      constraints,
      startAfterDoc
    );
  }

  private async getCollectionGroupWebWithMetadata<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[],
    startAfterDoc?: any
  ): Promise<{ data: Array<T & { id: string; path: string }>; lastDoc: any }> {
    return runInInjectionContext(this.injector, async () => {
      const collGroupRef = collectionGroup(this.firestore, collectionId);
      const queryConstraints: AngularFireQueryConstraint[] = [];

      if (filters) {
        for (const filter of filters) {
          queryConstraints.push(
            where(filter.fieldPath, filter.opStr, filter.value)
          );
        }
      }

      if (constraints) {
        for (const constraint of constraints) {
          if (constraint.type === "orderBy" && constraint.fieldPath) {
            queryConstraints.push(
              orderBy(constraint.fieldPath, constraint.direction)
            );
          } else if (constraint.type === "limit" && constraint.limit) {
            queryConstraints.push(limit(constraint.limit));
          }
        }
      }

      if (startAfterDoc) {
        queryConstraints.push(startAfter(startAfterDoc));
      }

      const q = query(collGroupRef, ...queryConstraints);
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({
        id: d.id,
        path: d.ref.path,
        ...d.data(),
      })) as Array<T & { id: string; path: string }>;

      return {
        data,
        lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
      };
    });
  }

  private async getCollectionGroupNative<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Promise<T[]> {
    const options: any = {
      reference: collectionId,
    };

    // Build composite filter if we have filters
    if (filters && filters.length > 0) {
      const queryFilters: QueryFieldFilterConstraint[] = filters.map((f) => ({
        type: "where" as const,
        fieldPath: f.fieldPath,
        opStr: f.opStr,
        value: f.value,
      }));

      options.compositeFilter = {
        type: "and",
        queryConstraints: queryFilters,
      };
    }

    // Add non-filter constraints
    if (constraints && constraints.length > 0) {
      const mappedConstraints = constraints
        .map((c): QueryNonFilterConstraint | null => {
          if (c.type === "orderBy" && c.fieldPath) {
            return {
              type: "orderBy" as const,
              fieldPath: c.fieldPath,
              directionStr: (c.direction || "asc") as "asc" | "desc",
            };
          } else if (c.type === "limit" && c.limit) {
            return {
              type: "limit" as const,
              limit: c.limit,
            };
          }
          return null;
        })
        .filter((c): c is QueryNonFilterConstraint => c !== null);
      options.queryConstraints = mappedConstraints;
    }

    const result = await FirebaseFirestore.getCollectionGroup(options);
    return result.snapshots.map((snap) => ({
      id: snap.id,
      ...snap.data,
    })) as T[];
  }

  /**
   * Listen to a collection group query in real-time.
   * @param collectionId Collection ID (e.g., 'edits')
   * @param filters Optional array of where filters
   * @param constraints Optional array of orderBy/limit constraints
   * @returns Observable that emits array of documents on changes
   */
  collectionGroupSnapshots<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Observable<T[]> {
    if (this.platformService.isNative()) {
      return this.collectionGroupSnapshotsNative<T>(
        collectionId,
        filters,
        constraints
      );
    }
    return this.collectionGroupSnapshotsWeb<T>(
      collectionId,
      filters,
      constraints
    );
  }

  private collectionGroupSnapshotsWeb<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Observable<T[]> {
    return new Observable<T[]>((observer) => {
      const collGroupRef = rawCollectionGroup(this.firestore, collectionId);
      const q = rawQuery(
        collGroupRef,
        ...this.buildRawWebQueryConstraints(collectionId, filters, constraints)
      );

      const unsubscribe = rawOnSnapshot(
        q,
        (snapshot) => {
          observer.next(
            snapshot.docs.map((docSnapshot) => ({
              id: docSnapshot.id,
              ...docSnapshot.data(),
            })) as T[]
          );
        },
        (error) => observer.error(error)
      );

      return () => unsubscribe();
    });
  }

  /**
   * Listen to a collection group query in real-time, returning the full document path.
   */
  collectionGroupSnapshotsWithMetadata<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Observable<Array<T & { id: string; path: string }>> {
    const injector = this.injector;

    if (this.platformService.isNative()) {
      return this.collectionGroupSnapshotsNativeWithMetadata<T>(
        collectionId,
        filters,
        constraints
      );
    }

    return runInInjectionContext(injector, () => {
      const collGroupRef = rawCollectionGroup(this.firestore, collectionId);
      const q = rawQuery(
        collGroupRef,
        ...this.buildRawWebQueryConstraints(collectionId, filters, constraints)
      );

      return new Observable<Array<T & { id: string; path: string }>>(
        (observer) => {
          const unsubscribe = rawOnSnapshot(
            q,
            (snapshot) => {
              const docs = snapshot.docs.map((docSnapshot) => ({
                id: docSnapshot.id,
                path: docSnapshot.ref.path,
                ...docSnapshot.data(),
              })) as Array<T & { id: string; path: string }>;
              observer.next(docs);
            },
            (error) => {
              observer.error(error);
            }
          );
          return () => unsubscribe();
        }
      );
    });
  }

  private collectionGroupSnapshotsNative<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Observable<T[]> {
    return new Observable<T[]>((observer) => {
      let callbackId: string | null = null;
      let isUnsubscribed = false;

      const options: any = {
        reference: collectionId,
      };

      // Build composite filter
      if (filters && filters.length > 0) {
        const queryFilters: QueryFieldFilterConstraint[] = filters.map((f) => ({
          type: "where" as const,
          fieldPath: f.fieldPath,
          opStr: f.opStr,
          value: f.value,
        }));

        options.compositeFilter = {
          type: "and",
          queryConstraints: queryFilters,
        };
      }

      // Add non-filter constraints
      if (constraints && constraints.length > 0) {
        const mappedConstraints = constraints
          .map((c): QueryNonFilterConstraint | null => {
            if (c.type === "orderBy" && c.fieldPath) {
              return {
                type: "orderBy" as const,
                fieldPath: c.fieldPath,
                directionStr: (c.direction || "asc") as "asc" | "desc",
              };
            } else if (c.type === "limit" && c.limit) {
              return {
                type: "limit" as const,
                limit: c.limit,
              };
            }
            return null;
          })
          .filter((c): c is QueryNonFilterConstraint => c !== null);
        options.queryConstraints = mappedConstraints;
      }

      FirebaseFirestore.addCollectionGroupSnapshotListener(
        options,
        (event, error) => {
          this.ngZone.run(() => {
            if (error) {
              observer.error(error);
              return;
            }
            if (event?.snapshots) {
              const docs = event.snapshots.map((snap) => ({
                id: snap.id,
                ...snap.data,
              })) as T[];
              observer.next(docs);
            }
          });
        }
      )
        .then((id) => {
          callbackId = id;
          if (isUnsubscribed) {
            this.removeSnapshotListenerSafe(id);
          }
        })
        .catch((error) => {
          this.ngZone.run(() => observer.error(error));
        });

      // Cleanup function
      return () => {
        isUnsubscribed = true;
        if (callbackId) {
          this.removeSnapshotListenerSafe(callbackId);
          callbackId = null;
        }
      };
    });
  }

  private collectionGroupSnapshotsNativeWithMetadata<T>(
    collectionId: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Observable<Array<T & { id: string; path: string }>> {
    return new Observable<Array<T & { id: string; path: string }>>(
      (observer) => {
        let callbackId: string | null = null;
        let isUnsubscribed = false;

        const options: any = {
          reference: collectionId,
        };

        // Build composite filter
        if (filters && filters.length > 0) {
          const queryFilters: QueryFieldFilterConstraint[] = filters.map(
            (f) => ({
              type: "where" as const,
              fieldPath: f.fieldPath,
              opStr: f.opStr,
              value: f.value,
            })
          );

          options.compositeFilter = {
            type: "and",
            queryConstraints: queryFilters,
          };
        }

        // Add non-filter constraints
        if (constraints && constraints.length > 0) {
          const mappedConstraints = constraints
            .map((c): QueryNonFilterConstraint | null => {
              if (c.type === "orderBy" && c.fieldPath) {
                return {
                  type: "orderBy" as const,
                  fieldPath: c.fieldPath,
                  directionStr: (c.direction || "asc") as "asc" | "desc",
                };
              } else if (c.type === "limit" && c.limit) {
                return {
                  type: "limit" as const,
                  limit: c.limit,
                };
              }
              return null;
            })
            .filter((c): c is QueryNonFilterConstraint => c !== null);
          options.queryConstraints = mappedConstraints;
        }

        FirebaseFirestore.addCollectionGroupSnapshotListener(
          options,
          (event, error) => {
            this.ngZone.run(() => {
              if (error) {
                observer.error(error);
                return;
              }
              if (event?.snapshots) {
                const docs = event.snapshots.map((snap) => ({
                  id: snap.id,
                  path: snap.path,
                  ...snap.data,
                })) as Array<T & { id: string; path: string }>;
                observer.next(docs);
              }
            });
          }
        )
          .then((id) => {
            callbackId = id;
            if (isUnsubscribed) {
              this.removeSnapshotListenerSafe(id);
            }
          })
          .catch((error) => {
            this.ngZone.run(() => observer.error(error));
          });

        // Cleanup function
        return () => {
          isUnsubscribed = true;
          if (callbackId) {
            this.removeSnapshotListenerSafe(callbackId);
            callbackId = null;
          }
        };
      }
    );
  }
}
