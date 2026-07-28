import { Injectable, inject } from "@angular/core";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

type InvalidationRequest = {
  approval_basis: string;
  reason: string;
  dry_run: boolean;
};

type InvalidationDryRunResponse = {
  ok: true;
  dry_run: true;
  matching_users: number;
};

type InvalidationApplyResponse = {
  ok: true;
  dry_run: false;
  processed_users: number;
  has_more: boolean;
};

@Injectable({ providedIn: "root" })
export class AgeAssuranceAdminService {
  private readonly functions = inject(FunctionsAdapterService);

  async previewInvalidation(
    approvalBasis: string,
    reason: string,
  ): Promise<number> {
    const result = await this.functions.callAuthenticatedAppChecked<
      InvalidationRequest,
      InvalidationDryRunResponse
    >("invalidateAgeAssuranceApprovals", {
      approval_basis: approvalBasis,
      reason,
      dry_run: true,
    });
    return result.matching_users;
  }

  async invalidate(
    approvalBasis: string,
    reason: string,
  ): Promise<number> {
    let processedUsers = 0;
    let hasMore = true;
    let batches = 0;
    while (hasMore && batches < 100) {
      const result = await this.functions.callAuthenticatedAppChecked<
        InvalidationRequest,
        InvalidationApplyResponse
      >("invalidateAgeAssuranceApprovals", {
        approval_basis: approvalBasis,
        reason,
        dry_run: false,
      });
      processedUsers += result.processed_users;
      hasMore = result.has_more && result.processed_users > 0;
      batches += 1;
    }
    if (hasMore) {
      throw new Error("Age assurance invalidation exceeded its safety limit");
    }
    return processedUsers;
  }
}
