export class CalDavAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  describe() {
    return {
      provider: "apple-caldav",
      status: "stub",
      notes: "Implement CalDAV read/write here for optional Apple Calendar support."
    };
  }
}
