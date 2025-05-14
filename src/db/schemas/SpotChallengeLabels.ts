export enum ChallengeLabel {
  sketchy = "sketchy",
  creative = "creative",
  techy = "techy",
  fun = "fun",
  core = "core",
}

export const ChallengeLabelIcons: Record<ChallengeLabel, string> = {
  sketchy: "psychology", // warning
  creative: "palette",
  techy: "biotech", // "engineering", square_foot, architecture, biotech
  fun: "mood",
  core: "adjust",
};

// Get all possible values of ChallengeLabel as an array
export const ChallengeLabelValues = Object.values(ChallengeLabel);

export enum ChallengeParticipantType {
  solo = "solo",
  pair = "pair",
  team = "team",
}

export const ChallengeParticipantTypeIcons: Record<
  ChallengeParticipantType,
  string
> = {
  solo: "person",
  pair: "people",
  team: "groups",
};

// Get all possible values of ChallengeParticipantType as an array
export const ChallengeParticipantTypeValues = Object.values(
  ChallengeParticipantType
);
