/** Await request-owned SDK cleanup before the Worker returns its response. */
export class SsrRequestScope {
  private cleanups: (() => Promise<void>)[] = [];

  onClose(cleanup: () => Promise<void>): void {
    this.cleanups.push(cleanup);
  }

  async close(): Promise<void> {
    const results = await Promise.allSettled(
      this.cleanups.splice(0).map((cleanup) => Promise.resolve().then(cleanup)),
    );
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) {
      throw new AggregateError(
        failures.map((result) => result.reason),
        "SSR cleanup failed",
      );
    }
  }
}
