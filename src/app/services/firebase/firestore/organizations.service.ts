import { Injectable, LOCALE_ID, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import {
  OrganizationMemberSchema,
  OrganizationReferenceSchema,
  OrganizationRole,
  OrganizationSchema,
  OrganizationVerifiedSpotSchema,
} from "../../../../db/schemas/OrganizationSchema";
import { UserReferenceSchema } from "../../../../db/schemas/UserSchema";
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
  private _setSpotVerificationCallable = this._functions
    ? httpsCallable<
        { spotId: string; organizationId: string | null },
        { ok: true }
      >(this._functions, "setSpotVerification")
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

  async getVerifiedSpots(
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

    return this.getVerifiedSpotsBySpotQuery(organizationId, locale);
  }

  private async getVerifiedSpotsBySpotQuery(
    organizationId: string,
    locale: LocaleCode
  ): Promise<Spot[]> {
    const spotDocs = await this._firestoreAdapter.getCollection<
      SpotSchema & { id: string }
    >(
      "spots",
      [
        {
          fieldPath: "verification.organization_id",
          opStr: "==",
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

  async setSpotVerification(
    spotId: string,
    organizationId: string | null
  ): Promise<void> {
    this._requireAdmin("setSpotVerification");
    if (!this._setSpotVerificationCallable) {
      throw new Error("Functions are unavailable in this environment.");
    }
    await this._setSpotVerificationCallable({ spotId, organizationId });
  }
}
