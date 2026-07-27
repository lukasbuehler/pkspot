package com.pkspot.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import com.google.android.gms.tasks.Task;
import com.google.android.play.agesignals.AgeSignalsException;
import com.google.android.play.agesignals.AgeSignalsRequest;
import com.google.android.play.agesignals.AgeSignalsResult;
import com.google.android.play.agesignals.model.AgeRangeSource;
import com.google.android.play.agesignals.model.AgeSignalsStatus;
import com.google.android.play.agesignals.model.SignificantChangeStatus;
import com.google.android.play.agesignals.testing.FakeAgeSignalsManager;
import java.util.Date;
import java.util.Map;
import org.junit.Test;

public class AgeSignalsResponseMapperTest {
  @Test
  public void mapsFakeSupervisedUnder13Signal() throws Exception {
    FakeAgeSignalsManager manager = new FakeAgeSignalsManager();
    Date approvalDate = new Date(1_700_000_000_000L);
    AgeSignalsResult fakeResult = AgeSignalsResult.builder()
        .setAgeRangeSource(AgeRangeSource.TIER_B)
        .setAgeLower(0)
        .setAgeUpper(12)
        .setInstallId("test-install-id")
        .setSignificantChangeStatus(SignificantChangeStatus.APPROVED)
        .setSignificantChangeApprovalDate(approvalDate)
        .build();
    manager.setNextAgeSignalsResult(fakeResult);

    AgeSignalsResult result = manager
        .checkAgeSignals(AgeSignalsRequest.builder().build())
        .getResult();
    Map<String, Object> mapped = AgeSignalsResponseMapper.resultMap(result);

    assertEquals("android", mapped.get("platform"));
    assertEquals("android_play_age_signals", mapped.get("source"));
    assertEquals(true, mapped.get("available"));
    assertEquals("shared", mapped.get("response"));
    assertEquals("shared", mapped.get("ageSignalsStatus"));
    assertEquals("tier_b", mapped.get("ageRangeSource"));
    assertEquals(0, mapped.get("ageLower"));
    assertEquals(12, mapped.get("ageUpper"));
    assertEquals("test-install-id", mapped.get("installId"));
    assertEquals("approved", mapped.get("significantChangeStatus"));
    assertEquals(String.valueOf(approvalDate), mapped.get("significantChangeApprovalDate"));
    assertEquals(0, ((Object[]) mapped.get("requiredRegulatoryFeatures")).length);
  }

  @Test
  public void mapsFakeVerifiedAdultSignal() throws Exception {
    FakeAgeSignalsManager manager = new FakeAgeSignalsManager();
    AgeSignalsResult fakeResult = AgeSignalsResult.builder()
        .setAgeRangeSource(AgeRangeSource.TIER_D)
        .setAgeLower(18)
        .build();
    manager.setNextAgeSignalsResult(fakeResult);

    AgeSignalsResult result = manager
        .checkAgeSignals(AgeSignalsRequest.builder().build())
        .getResult();
    Map<String, Object> mapped = AgeSignalsResponseMapper.resultMap(result);

    assertEquals(true, mapped.get("available"));
    assertEquals("tier_d", mapped.get("ageRangeSource"));
    assertEquals(18, mapped.get("ageLower"));
    assertEquals("shared", mapped.get("response"));
  }

  @Test
  public void mapsAccessStatusesWithoutInventingAnAgeRange() {
    Map<String, Object> notShared =
        AgeSignalsResponseMapper.accessStatusMap(AgeSignalsStatus.NOT_SHARED);
    Map<String, Object> verificationRequired =
        AgeSignalsResponseMapper.accessStatusMap(AgeSignalsStatus.VERIFICATION_REQUIRED);

    assertEquals("not_shared", notShared.get("ageSignalsStatus"));
    assertEquals("declined", notShared.get("response"));
    assertEquals("verification_required", verificationRequired.get("ageSignalsStatus"));
    assertEquals("unavailable", verificationRequired.get("response"));
  }

  @Test
  public void mapsMissingAccessStatusAsUnavailable() {
    Map<String, Object> result = AgeSignalsResponseMapper.accessStatusMap(null);

    assertEquals(false, result.get("available"));
    assertEquals("unavailable", result.get("response"));
  }

  @Test
  public void mapsFakeAgeSignalsExceptionAsUnavailable() throws Exception {
    FakeAgeSignalsManager manager = new FakeAgeSignalsManager();
    AgeSignalsException exception = new AgeSignalsException(7);
    manager.setNextAgeSignalsException(exception);

    Task<AgeSignalsResult> task = manager.checkAgeSignals(AgeSignalsRequest.builder().build());
    assertFalse(task.isSuccessful());

    Map<String, Object> mapped = AgeSignalsResponseMapper.unavailableMap(exception);

    assertEquals("android", mapped.get("platform"));
    assertEquals("android_play_age_signals", mapped.get("source"));
    assertEquals(false, mapped.get("available"));
    assertEquals("unavailable", mapped.get("response"));
    assertEquals(7, mapped.get("errorCode"));
  }
}
