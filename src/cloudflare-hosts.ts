/** Public production and trial hosts must use their respective compiled app. */
export function cloudflareSsrAllowedHosts(environmentName: string): string[] {
  return [
    ...(environmentName === "Production"
      ? ["pkspot.app"]
      : ["test.pkspot.app", "*.test.pkspot.app"]),
    "*.workers.dev",
    "localhost",
    "127.0.0.1",
    "[::1]",
  ];
}
