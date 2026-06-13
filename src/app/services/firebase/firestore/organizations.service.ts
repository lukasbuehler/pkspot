import { Injectable, LOCALE_ID, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import {
  OrganizationMemberSchema,
  OrganizationReferenceSchema,
  OrganizationRole,
  OrganizationSchema,
  OrganizationManagedSpotSchema,
  OrganizationUsedSpotSchema,
  OrganizationVerifiedSpotSchema,
} from "../../../../db/schemas/OrganizationSchema";
import {
  UserReferenceSchema,
  UserSchema,
} from "../../../../db/schemas/UserSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Spot } from "../../../../db/models/Spot";
import { LocaleCode } from "../../../../db/models/Interfaces";
import { SpotId, SpotSchema } from "../../../../db/schemas/SpotSchema";

export type OrganizationDocument = OrganizationSchema & { id: string };

@Injectable({ providedIn: "root" })
export class OrganizationsService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private _authService = inject(AuthenticationService);
  private _functions = inject(Functions, { optional: true });
  private _locale = inject<LocaleCode>(LOCALE_ID);
  private _setSpotOrganizationRelationshipCallable = this._functions
    ? httpsCallable<
        {
          spotId: string;
          organizationId: string | null;
          relationship: "steward" | "manager" | "used";
          enabled?: boolean;
        },
        { ok: true }
      >(this._functions, "setSpotOrganizationRelationship")
    : null;

  private _requireAdmin(action: string): void {
    if (this._authService.user.data?.isAdmin !== true) {
      throw new Error(`OrganizationsService.${action}: requires admin privileges.`);
    }
  }

  async getOrganizations(): Promise<OrganizationDocument[]> {
    return this._firestoreAdapter.getCollection<OrganizationDocument>(
      "organizations"
    );
  }

  async getOrganizationById(id: string): Promise<OrganizationDocument | null> {
    const document =
      await this._firestoreAdapter.getDocument<OrganizationSchema>(
        `organizations/${id}`
      );
    return document ? { ...document, id } : null;
  }

  async getOrganizationBySlugOrId(
    slugOrId: string
  ): Promise<OrganizationDocument | null> {
    const byId = await this.getOrganizationById(slugOrId);
    if (byId) return byId;

    const matches = await this._firestoreAdapter.getCollection<
      OrganizationDocument
    >(
      "organizations",
      [{ fieldPath: "slug", opStr: "==", value: slugOrId }],
      [{ type: "limit", limit: 1 }]
    );
    return matches[0] ?? null;
  }

  async getOrganizationMembers(
    organizationId: string
  ): Promise<(OrganizationMemberSchema & { id: string })[]> {
    return this._firestoreAdapter.getCollection<
      OrganizationMemberSchema & { id: string }
    >(`organizations/${organizationId}/members`);
  }

  async getStewardedSpots(
    organizationId: string,
    locale: LocaleCode = this._locale
  ): Promise<Spot[]> {
    const verifiedSpotRefs = await this._firestoreAdapter.getCollection<
      OrganizationVerifiedSpotSchema & { id: string }
    >(`organizations/${organizationId}/verified_spots`);

    if (verifiedSpotRefs.length > 0) {
      const spots = await Promise.all(
        verifiedSpotRefs.slice(0, 24).map((verifiedSpot) =>
          this._firestoreAdapter.getDocument<SpotSchema>(
            `spots/${verifiedSpot.spot_id}`
          ).then((spotData) => ({ verifiedSpot, spotData }))
        )
      );

      return spots
        .map(({ verifiedSpot, spotData }) => {
          if (!spotData) return null;
          try {
            return new Spot(verifiedSpot.spot_id as SpotId, spotData, locale);
          } catch (error) {
            console.warn(
              `[OrganizationsService] Ignoring incomplete verified spot ${verifiedSpot.spot_id}`,
              error
            );
            return null;
          }
        })
        .filter((spot): spot is Spot => spot !== null);
    }

    return this.getStewardedSpotsBySpotQuery(organizationId, locale);
  }

  async getManagedSpots(
    organizationId: string,
    locale: LocaleCode = this._locale
  ): Promise<Spot[]> {
    const managedSpotRefs = await this._firestoreAdapter.getCollection<
      OrganizationManagedSpotSchema & { id: string }
    >(`organizations/${organizationId}/managed_spots`);

    const spots = await Promise.all(
      managedSpotRefs.slice(0, 24).map((managedSpot) =>
        this._firestoreAdapter
          .getDocument<SpotSchema>(`spots/${managedSpot.spot_id}`)
          .then((spotData) => ({ managedSpot, spotData }))
      )
    );

    return spots
      .map(({ managedSpot, spotData }) => {
        if (!spotData) return null;
        try {
          return new Spot(managedSpot.spot_id as SpotId, spotData, locale);
        } catch (error) {
          console.warn(
            `[OrganizationsService] Ignoring incomplete managed spot ${managedSpot.spot_id}`,
            error
          );
          return null;
        }
      })
      .filter((spot): spot is Spot => spot !== null);
  }

  async getUsedSpots(
    organizationId: string,
    locale: LocaleCode = this._locale
  ): Promise<Spot[]> {
    const usedSpotRefs = await this._firestoreAdapter.getCollection<
      OrganizationUsedSpotSchema & { id: string }
    >(`organizations/${organizationId}/used_spots`);

    const spots = await Promise.all(
      usedSpotRefs.slice(0, 48).map((usedSpot) =>
        this._firestoreAdapter
          .getDocument<SpotSchema>(`spots/${usedSpot.spot_id}`)
          .then((spotData) => ({ usedSpot, spotData }))
      )
    );

    return spots
      .map(({ usedSpot, spotData }) => {
        if (!spotData) return null;
        try {
          return new Spot(usedSpot.spot_id as SpotId, spotData, locale);
        } catch (error) {
          console.warn(
            `[OrganizationsService] Ignoring incomplete used spot ${usedSpot.spot_id}`,
            error
          );
          return null;
        }
      })
      .filter((spot): spot is Spot => spot !== null);
  }

  // Compatibility alias for older call sites. User-facing copy calls these
  // spots verified by the organization, while the internal model is stewardship.
  getVerifiedSpots(organizationId: string, locale: LocaleCode = this._locale) {
    return this.getStewardedSpots(organizationId, locale);
  }

  private async getStewardedSpotsBySpotQuery(
    organizationId: string,
    locale: LocaleCode
  ): Promise<Spot[]> {
    const spotDocs = await this._firestoreAdapter.getCollection<
      SpotSchema & { id: string }
    >(
      "spots",
      [
        {
          fieldPath: "stewardship.organization_ids",
          opStr: "array-contains",
          value: organizationId,
        },
      ],
      [{ type: "limit", limit: 24 }]
    );

    return spotDocs
      .map((spotDoc) => {
        try {
          return new Spot(spotDoc.id as SpotId, spotDoc, locale);
        } catch (error) {
          console.warn(
            `[OrganizationsService] Ignoring incomplete verified spot ${spotDoc.id}`,
            error
          );
          return null;
        }
      })
      .filter((spot): spot is Spot => spot !== null);
  }

  async getReviewerOrganizations(): Promise<OrganizationDocument[]> {
    if (this._authService.user.data?.isAdmin === true) {
      return this.getOrganizations();
    }
    const uid = this._authService.user.uid;
    if (!uid) return [];
    const organizations = await this.getOrganizations();
    const memberships = await Promise.all(
      organizations.map(async (organization) => ({
        organization,
        member: await this._firestoreAdapter.getDocument<OrganizationMemberSchema>(
          `organizations/${organization.id}/members/${uid}`
        ),
      }))
    );
    return memberships
      .filter(({ member }) =>
        member
          ? member.role === "owner" ||
            member.role === "admin" ||
            member.role === "reviewer"
          : false
      )
      .map(({ organization }) => organization);
  }

  async createOrganization(
    id: string,
    data: Omit<OrganizationSchema, "time_created" | "time_updated">
  ): Promise<void> {
    this._requireAdmin("createOrganization");
    const now = Timestamp.now();
    await this._firestoreAdapter.setDocument(`organizations/${id}`, {
      ...data,
      time_created: now,
      time_updated: now,
    });
  }

  async updateOrganization(
    id: string,
    patch: Partial<OrganizationSchema>
  ): Promise<void> {
    this._requireAdmin("updateOrganization");
    await this._firestoreAdapter.updateDocument(`organizations/${id}`, {
      ...patch,
      time_updated: Timestamp.now(),
    });
  }

  async upsertMember(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
    user: UserReferenceSchema
  ): Promise<void> {
    this._requireAdmin("upsertMember");
    const member: OrganizationMemberSchema = {
      role,
      user,
      joined_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await this._firestoreAdapter.setDocument(
      `organizations/${organizationId}/members/${userId}`,
      member
    );
  }

  async upsertMemberByUserId(
    organizationId: string,
    userId: string,
    role: OrganizationRole
  ): Promise<void> {
    this._requireAdmin("upsertMemberByUserId");
    const user = await this._firestoreAdapter.getDocument<UserSchema>(
      `users/${userId}`
    );
    const userReference: UserReferenceSchema = {
      uid: userId,
      display_name: user?.display_name ?? "",
      ...(user?.profile_picture ? { profile_picture: user.profile_picture } : {}),
    };
    await this.upsertMember(organizationId, userId, role, userReference);
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    this._requireAdmin("removeMember");
    await this._firestoreAdapter.deleteDocument(
      `organizations/${organizationId}/members/${userId}`
    );
  }

  makeReference(org: OrganizationDocument): OrganizationReferenceSchema {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo_url: org.logo_url,
      logo_background_color: org.logo_background_color,
    };
  }

  private async _setSpotOrganizationRelationship(
    spotId: string,
    organizationId: string | null,
    relationship: "steward" | "manager" | "used",
    enabled = organizationId !== null
  ): Promise<void> {
    this._requireAdmin("setSpotOrganizationRelationship");
    if (!this._setSpotOrganizationRelationshipCallable) {
      throw new Error("Functions are unavailable in this environment.");
    }
    await this._setSpotOrganizationRelationshipCallable({
      spotId,
      organizationId,
      relationship,
      enabled,
    });
  }

  async setSpotStewardship(
    spotId: string,
    organizationId: string,
    enabled = true
  ): Promise<void> {
    await this._setSpotOrganizationRelationship(
      spotId,
      organizationId,
      "steward",
      enabled
    );
  }

  async setSpotManagement(
    spotId: string,
    organizationId: string | null
  ): Promise<void> {
    await this._setSpotOrganizationRelationship(
      spotId,
      organizationId,
      "manager"
    );
  }

  async setOrganizationUsedSpot(
    organizationId: string,
    spotId: string,
    enabled = true
  ): Promise<void> {
    await this._setSpotOrganizationRelationship(
      spotId,
      organizationId,
      "used",
      enabled
    );
  }

  // Compatibility alias: old verification is now public-spot stewardship.
  async setSpotVerification(
    spotId: string,
    organizationId: string | null
  ): Promise<void> {
    if (organizationId === null) {
      await this._setSpotOrganizationRelationship(spotId, null, "steward", false);
      return;
    }
    await this.setSpotStewardship(spotId, organizationId, true);
  }
}
