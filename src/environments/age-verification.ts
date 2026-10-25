/** Build-time availability only; server eligibility checks remain authoritative. */
export const ageVerificationProviders = {
  google_play: true,
  apple: true,
  oneid: false,
};

export type AgeVerificationProvider = keyof typeof ageVerificationProviders;
