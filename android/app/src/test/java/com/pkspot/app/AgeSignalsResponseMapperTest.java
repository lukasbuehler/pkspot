package com.pkspot.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import com.google.android.gms.tasks.Task;
import com.google.android.play.agesignals.AgeSignalsException;
import com.google.android.play.agesignals.AgeSignalsRequest;
import com.google.android.play.agesignals.AgeSignalsResult;
import com.google.android.play.agesignals.model.AgeSignalsVerificationStatus;
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
        .setUserStatus(AgeSignalsVerificationStatus.SUPERVISED)
        .setAgeLower(0)
        .setAgeUpper(12)
        .setInstallId("test-install-id")
        .setMostRecentApprovalDate(approvalDate)
        .build();
    manager.setNextAgeSignalsResult(fakeResult);

    AgeSignalsResult result = manager
        .checkAgeSignals(AgeSignalsRequest.builder().build())
        .getResult();
    Map<String, Object> mapped = AgeSignalsResponseMapper.resultMap(result);

    assertEquals("android", mapped.get("platform"));
    assertEquals("android_play_age_signals", mapped.get("source"));
    assertEquals(true, mapped.get("available"));
    assertEquals(String.valueOf(AgeSignalsVerificationStatus.SUPERVISED), mapped.get("userStatus"));
    assertEquals(0, mapped.get("ageLower"));
    assertEquals(12, mapped.get("ageUpper"));
    assertEquals("test-install-id", mapped.get("installId"));
    assertEquals(String.valueOf(approvalDate), mapped.get("mostRecentApprovalDate"));
    assertEquals(0, ((Object[]) mapped.get("requiredRegulatoryFeatures")).length);
  }

  @Test
  public void mapsFakeVerifiedAdultSignal() throws Exception {
    FakeAgeSignalsManager manager = new FakeAgeSignalsManager();
    AgeSignalsResult fakeResult = AgeSignalsResult.builder()
        .setUserStatus(AgeSignalsVerificationStatus.VERIFIED)
        .setAgeLower(18)
        .build();
    manager.setNextAgeSignalsResult(fakeResult);

    AgeSignalsResult result = manager
        .checkAgeSignals(AgeSignalsRequest.builder().build())
        .getResult();
    Map<String, Object> mapped = AgeSignalsResponseMapper.resultMap(result);

    assertEquals(true, mapped.get("available"));
    assertEquals(String.valueOf(AgeSignalsVerificationStatus.VERIFIED), mapped.get("userStatus"));
    assertEquals(18, mapped.get("ageLower"));
    assertFalse(mapped.containsKey("response"));
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
