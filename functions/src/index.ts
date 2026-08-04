import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2/options";

setGlobalOptions({ maxInstances: 10, region: "europe-west1" });
admin.initializeApp();

// post functions
export {
  countFollowersOnWrite,
  countFollowingOnWrite,
  countPostLikesOnWrite,
} from "./postFunctions";

// spot functions
export {
  updateSpotFieldsOnWrite,
  updateAllSpotsWithTypesenseFields,
  backfillAllSpotsWithLandingFields,
  auditReservedSpotSlugs,
  detectDuplicateSpots,
} from "./spotFunctions";

export {
  updateAllSpotAddresses,
  // updateAllEmptyAddressesOnSchedule,
} from "./spotAddressFunctions";

export {
  patchCommunityPageOnWrite,
  rebuildCommunityPagesOnImportWrite,
  rebuildAllCommunityPages,
  rebuildCommunityEventPreviewsOnEventWrite,
  getCommunityMergeAdminState,
  mergeUnpublishedLocality,
  unmergeUnpublishedLocality,
} from "./communityFunctions";
export {
  reviewCommunityEdit,
  saveCommunityKnowledge,
} from "./communityEditFunctions";

// event functions
export {
  backfillSpotUpcomingEvents,
  countEventRsvpsOnWrite,
  syncSpotUpcomingEventsOnEventWrite,
  updateEventFieldsOnWrite,
  updateAllEventsWithTypesenseFields,
} from "./eventFunctions";
export { backfillEventModel } from "./eventModelMaintenanceFunctions";
export {
  backfillEventTiming,
  backfillEventTimingOnCreate,
} from "./eventTimingMaintenanceFunctions";
export { resolveEventTimeZone } from "./eventTimeZoneFunctions";
export {
  respondToEventOwnershipClaim,
  reviewEventOwnershipClaim,
  submitEventOwnershipClaim,
} from "./eventOwnershipClaimFunctions";
export {
  rebuildEventDiscovery,
  rebuildEventDiscoveryOnCreate,
  syncEventDiscoveryOnEventWrite,
} from "./eventDiscoveryFunctions";
export {
  applyEventOperationalChange,
  onEventLiveUpdateCreate,
  publishEventLiveUpdate,
} from "./eventLiveUpdateFunctions";
export {
  cancelEventRegistration,
  onEventRegistrationPromotion,
  reconcileEventWaitlistOnEventUpdate,
  registerForEvent,
} from "./eventRegistrationFunctions";

export { computeRatingOnWrite } from "./spotRatingFunctions";

// spot edit functions
export {
  applySpotEditOnCreate,
  evaluateSpotEditVotesOnVoteWrite,
  evaluatePendingSpotEditVotesOnSchedule,
  reviewVerifiedSpotEdit,
  setSpotOrganizationRelationship,
} from "./spotEditFunctions";
export {
  cleanupSpotCreateSubmissions,
  createSpotSubmission,
  getSpotCreationDiagnostics,
  recordSpotCreateGuardBlock,
} from "./spotCreationFunctions";
export {
  previewSpotDuplicateResolution,
  resolveSpotDuplicate,
} from "./spotDuplicateFunctions";
export { syncVerifiedSpotOrganizationSnapshots } from "./organizationFunctions";
export {
  processImportChunkOnCreate,
  retryFailedImportChunksOnCreate,
} from "./importFunctions";
export { getPublicImportProvenance } from "./importProvenanceFunctions";

// fixes and migrations
export {
  fixSpotLocations,
  fixLocaleMaps,
  backfillSignupNumbers,
  recalculateUserEditStats,
} from "./fixFunctions";
export {
  backfillEditTargetMetadata,
  backfillEditTargetMetadataOnCreate,
} from "./editMaintenanceFunctions";

// storage triggers
export { processVideoUpload } from "./storageFunctions";
export {
  backfillStorageImageSizes,
  processImageUpload,
} from "./imageProcessingFunctions";
export {
  markMediaUploadSafe,
  processMediaIntakeUpload,
  reconcilePublishedMediaReviews,
  runMediaIntakeBackfill,
  runMediaModerationAudit,
} from "./mediaModerationFunctions";

// spot challenge functions
export { setTopChallengesForSpotOnWrite } from "./spotChallengeFunctions";

// media report functions
export {
  onMediaReportCreate,
  onRootMediaReportCreate,
} from "./mediaReportFunctions";
export {
  cleanupMediaReportSubmissionMetadata,
  submitMediaReport,
} from "./mediaReportSubmissionFunctions";
export {
  addSafetyCaseMessage,
  appealSafetyCaseDecision,
  cleanupSafetyCaseSecurityMetadata,
  exchangeSafetyCaseAccessLink,
  getSafetyCaseView,
  submitSafetyCase,
} from "./safetyCaseSubmissionFunctions";
export {
  decideSafetyCase,
  getAdminSafetyCase,
  listSafetyCases,
  restoreSafetyCaseDecision,
  updateSafetyCase,
} from "./safetyCaseAdminFunctions";
export {
  aggregateSafetyCaseMetrics,
  backfillSafetyCases,
  onLegacyMediaReportSafetyCaseCreate,
  onModerationActionSafetyCaseCreate,
  onRootReportSafetyCaseCreate,
  onSpotReportSafetyCaseCreate,
  onUserReportSafetyCaseCreate,
} from "./safetyCaseProjectionFunctions";

// contact message functions
export { onContactMessageCreate } from "./contactMessageFunctions";

// spot report functions
export { onSpotReportCreate, resolveSpotReport } from "./spotReportFunctions";

// moderation action functions
export { handleModerationAction } from "./moderationActionFunctions";
export {
  createSafetyIncident,
  getModerationMediaPreview,
  updateSafetyIncident,
} from "./safetyIncidentFunctions";
export {
  backfillReportReporterIdentities,
  migrateSpotReportsToPublicWarnings,
  resyncReportedSpotsToTypesenseOnCreate,
  runSafetyDataCleanup,
} from "./safetyDataMaintenanceFunctions";

// user report functions
export { onUserReportCreate } from "./userReportFunctions";

// sitemap functions
export {
  generateSitemapOnSchedule,
  generateSitemapManual,
} from "./sitemapFunctions";

// social card functions
// export {
//   generateSocialCards,
//   onUserProfileUpdate,
// } from "./socialCardFunctions";

export { cleanupOnUserDelete } from "./authFunctions";
export { assignSignupNumberOnCreate } from "./userSignupFunctions";

export {
  onCheckInCreate,
  syncVisitedSpotsCountOnPrivateDataWrite,
  updateAgePolicy,
  updateAgePolicyV2,
} from "./userFunctions";
export {
  beginAgeAssuranceV3,
  cleanupAgeAssuranceChallenges,
  invalidateAgeAssuranceApprovals,
  updateAgePolicyV3,
} from "./ageAssuranceFunctions";
export {
  activateUserProfilePrivacyCutover,
  backfillPublicUserProfiles,
  getUserProfile,
  syncPublicUserProfileOnWrite,
} from "./userProfileFunctions";

export { cleanupAllOrphanedMedia } from "./mediaCleanupFunctions";

export { cleanupExpiredWeatherCache, getWeather } from "./weatherFunctions";
export {
  cleanupExpiredOsmAmenityCache,
  getOsmAmenityTile,
} from "./osmAmenityFunctions";

export {
  onEventNotificationSourceWrite,
  onEventNotificationSubscriptionWrite,
  onEventRsvpNotificationWrite,
  onFollowRequestNotificationCreate,
  onFollowingNotificationWrite,
  onCommunityInfoNotificationWrite,
  onMediaReportNotificationWrite,
  onRootMediaReportNotificationWrite,
  onModerationActionNotificationCreate,
  onNewFollowerNotificationWrite,
  onImmediateNotificationIntentCreate,
  onNotificationIntentWrite,
  onSpotReportNotificationWrite,
  onSpotEditNotificationWrite,
  sendDueNotificationIntents,
  performNotificationAction,
  getMyEventNotificationMigrationState,
  reconcileMyEventNotifications,
} from "./notificationFunctions";
export {
  migrateCommunityFollowsOnMerge,
  onCommunityEventDiscoveryWrite,
  onCommunitySpotRecommendationWrite,
  sendCommunitySpotDigests,
} from "./communityNotificationFunctions";
