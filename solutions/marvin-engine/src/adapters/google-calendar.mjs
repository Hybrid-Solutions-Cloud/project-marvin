export class GoogleCalendarAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  describe() {
    return {
      provider: "google",
      status: "stub",
      notes: "Implement Google Calendar event read/write here if a Google hub remains in scope."
    };
  }
}
