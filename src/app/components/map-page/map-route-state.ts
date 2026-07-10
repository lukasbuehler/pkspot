export interface MapSpotRouteState {
  spotIdOrSlug: string | null;
  showChallenges: boolean;
  challengeId: string | null;
  showEditHistory: boolean;
}

function emptyMapSpotRouteState(): MapSpotRouteState {
  return {
    spotIdOrSlug: null,
    showChallenges: false,
    challengeId: null,
    showEditHistory: false,
  };
}

/** Parses spot panel state from canonical and legacy map URLs. */
export function parseMapSpotRouteState(url: string): MapSpotRouteState {
  const cleanUrl = (url || "").split("?")[0].split("#")[0];

  if (
    /^\/map\/communities\/[^/]+$/u.test(cleanUrl) ||
    /^\/map\/events\/[^/]+$/u.test(cleanUrl)
  ) {
    return emptyMapSpotRouteState();
  }

  const urlParts = cleanUrl.split("/").filter((segment) => segment);
  if (urlParts.length < 2 || urlParts[0] !== "map") {
    return emptyMapSpotRouteState();
  }

  const hasSpotPrefix = urlParts[1] === "spots";
  const spotSegmentIndex = hasSpotPrefix ? 2 : 1;
  const potentialSpot = urlParts[spotSegmentIndex]
    ? decodeURIComponent(urlParts[spotSegmentIndex])
    : null;
  if (!potentialSpot) {
    return emptyMapSpotRouteState();
  }

  const routeState = emptyMapSpotRouteState();
  routeState.spotIdOrSlug = potentialSpot;

  const actionSegmentIndex = spotSegmentIndex + 1;
  const action = urlParts[actionSegmentIndex];
  if (action === "c") {
    routeState.showChallenges = true;
    const challenge = urlParts[actionSegmentIndex + 1];
    routeState.challengeId = challenge ? decodeURIComponent(challenge) : null;
  } else if (action === "edits") {
    routeState.showEditHistory = true;
  }

  return routeState;
}
