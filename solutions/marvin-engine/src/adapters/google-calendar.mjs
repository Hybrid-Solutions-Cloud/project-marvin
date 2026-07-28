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

  planWrite(operation) {
    return {
      adapter: "google-calendar",
      action: "upsert-private-blocker",
      targetCalendar: operation.target.label,
      payload: operation.payload
    };
  }
}
