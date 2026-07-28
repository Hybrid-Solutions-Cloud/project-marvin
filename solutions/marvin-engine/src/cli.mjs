import path from "node:path";
import { loadProfile } from "./util/profile-loader.mjs";
import { FileMapStore } from "./storage/file-map-store.mjs";
import { MicrosoftGraphAdapter } from "./adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "./adapters/google-calendar.mjs";
import { CalDavAdapter } from "./adapters/caldav.mjs";
import { SyncEngine } from "./core/sync-engine.mjs";

const args = process.argv.slice(2);
const profileFlagIndex = args.indexOf("--profile");
const profilePath = profileFlagIndex >= 0 ? args[profileFlagIndex + 1] : "profiles/marvin.example.json";
const dryRun = args.includes("--dry-run");

const { profile } = loadProfile(profilePath);
const store = new FileMapStore(path.join("artifacts", "marvin-engine", `${profile.name}.mappings.json`));
const engine = new SyncEngine({
  profile,
  store,
  adapters: {
    microsoft: new MicrosoftGraphAdapter(),
    google: new GoogleCalendarAdapter(),
    caldav: new CalDavAdapter()
  }
});

if (dryRun) {
  console.log(JSON.stringify(engine.dryRun(), null, 2));
} else {
  console.log("Only --dry-run is implemented right now. The universe remains imperfect.");
}
