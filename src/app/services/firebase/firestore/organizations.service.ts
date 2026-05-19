import { Injectable, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import {
  OrganizationMemberSchema,
  OrganizationReferenceSchema,
  OrganizationRole,
  OrganizationSchema,
} from "../../../../db/schemas/OrganizationSchema";
import { UserReferenceSchema } from "../../../../db/schemas/UserSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { Functions, httpsCallable } from "@angular/fire/functions";

type OrganizationDocument = OrganizationSchema & { id: string };

@Injectable({ providedIn: "root" })
export class OrganizationsService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private _authService = inject(AuthenticationService);
  private _functions = inject(Functions, { optional: true });

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
    return this._firestoreAdapter.getDocument<OrganizationDocument>(
      `organizations/${id}`
    );
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
    };
  }

  async setSpotVerification(
    spotId: string,
    organizationId: string | null
  ): Promise<void> {
    this._requireAdmin("setSpotVerification");
    if (!this._functions) {
      throw new Error("Functions are unavailable in this environment.");
    }
    const callable = httpsCallable<
      { spotId: string; organizationId: string | null },
      { ok: true }
    >(this._functions, "setSpotVerification");
    await callable({ spotId, organizationId });
  }
}
