export class MicrosoftGraphAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  describe() {
    return {
      provider: "m365",
      status: "stub",
      notes: "Implement Microsoft Graph event read/write and subscription renewal here."
    };
  }
}
