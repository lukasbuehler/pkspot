import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { AgeAssuranceAdminService } from "./age-assurance-admin.service";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";

describe("AgeAssuranceAdminService", () => {
  it("previews before invalidating every server batch", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        dry_run: true,
        matching_users: 3,
      })
      .mockResolvedValueOnce({
        ok: true,
        dry_run: false,
        processed_users: 2,
        has_more: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        dry_run: false,
        processed_users: 1,
        has_more: false,
      });
    TestBed.configureTestingModule({
      providers: [
        AgeAssuranceAdminService,
        {
          provide: FunctionsAdapterService,
          useValue: { callAuthenticatedAppChecked: call },
        },
      ],
    });
    const service = TestBed.inject(AgeAssuranceAdminService);

    await expect(
      service.previewInvalidation("basis:v1", "Method withdrawn"),
    ).resolves.toBe(3);
    await expect(
      service.invalidate("basis:v1", "Method withdrawn"),
    ).resolves.toBe(3);
    expect(call).toHaveBeenCalledTimes(3);
  });
});
