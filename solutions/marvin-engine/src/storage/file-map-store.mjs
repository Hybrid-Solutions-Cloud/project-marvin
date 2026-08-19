import path from "node:path";
import { FileStateStore } from "./file-state-store.mjs";

export class FileMapStore extends FileStateStore {
  constructor(filePath) {
    super(path.resolve(filePath), { mappings: [] });
  }
}
