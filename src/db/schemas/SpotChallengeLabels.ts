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

export enum ChallengeParticipantType {
  solo = "solo",
  pair = "pair",
  group = "group",
}

export const ChallengeParticipantTypeIcons: Record<
  ChallengeParticipantType,
  string
> = {
  solo: "person",
  pair: "people",
  group: "groups",
};
