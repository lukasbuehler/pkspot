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
  collectionData,
  collectionGroup,
  docData,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  getDocs,
  QueryConstraint as AngularFireQueryConstraint,
} from "@angular/fire/firestore";

// Native imports (Capacitor Firebase)
import {
  FirebaseFirestore,
  GetCollectionOptions,
  QueryCompositeFilterConstraint,
  QueryFieldFilterConstraint,
  QueryNonFilterConstraint,
  DocumentSnapshot,
} from "@capacitor-firebase/firestore";

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

  // Track active listeners for cleanup
  private activeListeners = new Map<string, () => void>();

  constructor() {
    console.log(
      `[FirestoreAdapter] Initialized for platform: ${this.platformService.getPlatform()}`
    );
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
    if (this.platformService.isNative()) {
      return this.getCollectionNative<T>(collectionPath, filters, constraints);
    }
    return this.getCollectionWeb<T>(collectionPath, filters, constraints);
  }

  private async getCollectionWeb<T>(
    collectionPath: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Promise<T[]> {
    return runInInjectionContext(this.injector, async () => {
      const collRef = collection(this.firestore, collectionPath);
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
    return runInInjectionContext(this.injector, () => {
      const docRef = doc(this.firestore, path);
      return docData(docRef, { idField: "id" }).pipe(
        map((data) => (data ? (data as T) : null))
      );
    });
  }

  private documentSnapshotsNative<T>(path: string): Observable<T | null> {
    return new Observable<T | null>((observer) => {
      let callbackId: string | null = null;

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
      ).then((id) => {
        callbackId = id;
      });

      // Cleanup function
      return () => {
        if (callbackId) {
          FirebaseFirestore.removeSnapshotListener({ callbackId });
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
    return runInInjectionContext(this.injector, () => {
      const collRef = collection(this.firestore, collectionPath);
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

      const q = query(collRef, ...queryConstraints);
      return collectionData(q, { idField: "id" }) as Observable<T[]>;
    });
  }

  private collectionSnapshotsNative<T>(
    collectionPath: string,
    filters?: QueryFilter[],
    constraints?: QueryConstraintOptions[]
  ): Observable<T[]> {
    return new Observable<T[]>((observer) => {
      let callbackId: string | null = null;

      const options: any = {
        reference: collectionPath,
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
      ).then((id) => {
        callbackId = id;
      });

      // Cleanup function
      return () => {
        if (callbackId) {
          FirebaseFirestore.removeSnapshotListener({ callbackId });
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
    if (this.platformService.isNative()) {
      return this.getCollectionGroupNative<T>(
        collectionId,
        filters,
        constraints
      );
    }
    return this.getCollectionGroupWeb<T>(collectionId, filters, constraints);
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
    return runInInjectionContext(this.injector, () => {
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

      const q = query(collGroupRef, ...queryConstraints);
      return collectionData(q, { idField: "id" }).pipe(
        map((docs: any[]) =>
          docs.map((d) => {
            // DocumentData from collectionData doesn't naturally include the ref path when using idField
            // We need to use snapshotChanges if we want the ref, but collectionData is simpler.
            // However, for collection group queries, we absolutely need the path.
            // Let's switch to proper snapshot handling if we need the path.
            // BUT, for now, let's try to see if we can get the path from the ref if we weren't using data().
            // Actually, collectionData with idField just gives data + id.
            // To get the path, we need to inspect the document reference.
            // Since collectionData hides the ref, we might need to use collectionChanges or getDocs.
            // But real-time is required.
            return d;
          })
        )
      ) as Observable<T[]>;
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

      const q = query(collGroupRef, ...queryConstraints);

      return new Observable<Array<T & { id: string; path: string }>>(
        (observer) => {
          let unsubscribe: any;
          runInInjectionContext(injector, () => {
            unsubscribe = onSnapshot(
              q,
              (snapshot: any) => {
                const docs = snapshot.docs.map((d: any) => ({
                  id: d.id,
                  path: d.ref.path,
                  ...d.data(),
                }));
                observer.next(docs);
              },
              (error: any) => {
                observer.error(error);
              }
            );
          });
          return () => unsubscribe && unsubscribe();
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
      ).then((id) => {
        callbackId = id;
      });

      // Cleanup function
      return () => {
        if (callbackId) {
          FirebaseFirestore.removeSnapshotListener({ callbackId });
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
        ).then((id) => {
          callbackId = id;
        });

        // Cleanup function
        return () => {
          if (callbackId) {
            FirebaseFirestore.removeSnapshotListener({ callbackId });
          }
        };
      }
    );
  }
}
