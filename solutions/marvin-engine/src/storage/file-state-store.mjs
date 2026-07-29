import fs from "node:fs";
import path from "node:path";

export class FileStateStore {
  constructor(filePath, defaultState = {}) {
    this.filePath = path.resolve(filePath);
    this.defaultState = structuredClone(defaultState);
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return structuredClone(this.defaultState);
    }

    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  save(state) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}
