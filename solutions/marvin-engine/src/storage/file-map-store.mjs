import fs from "node:fs";
import path from "node:path";

export class FileMapStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return { mappings: [] };
    }

    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  save(state) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}
