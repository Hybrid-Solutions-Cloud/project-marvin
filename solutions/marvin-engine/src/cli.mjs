import path from "node:path";
import { resolveActiveEventsPath, resolveActiveProfile } from "./util/active-profile.mjs";
import { loadEvents } from "./util/events-loader.mjs";
import { summarizeTokenState } from "./util/token-state.mjs";
import { createRuntimeContext } from "./util/runtime-context.mjs";

const args = process.argv.slice(2);
const profileFlagIndex = args.indexOf("--profile");
const eventsFlagIndex = args.indexOf("--events");
const rootDir = process.env.MARVIN_ROOT_DIR ? path.resolve(process.env.MARVIN_ROOT_DIR) : process.cwd();
const explicitProfilePath = profileFlagIndex >= 0 ? args[profileFlagIndex + 1] : "";
const explicitEventsPath = eventsFlagIndex >= 0 ? args[eventsFlagIndex + 1] : "";
const activeProfile = resolveActiveProfile(rootDir, explicitProfilePath);
const activeEvents = resolveActiveEventsPath(rootDir, explicitEventsPath, activeProfile.profilePath);
const profilePath = activeProfile.profilePath;
const eventsPath = activeEvents.eventsPath;
const dryRun = args.includes("--dry-run");
const applyMock = args.includes("--apply-mock");
const applyLive = args.includes("--apply-live");
const sourceLive = args.includes("--source-live");
const windowDaysFlagIndex = args.indexOf("--window-days");
const windowDays = windowDaysFlagIndex >= 0 ? Number(args[windowDaysFlagIndex + 1] || 45) : null;

const events = sourceLive ? [] : loadEvents(eventsPath);
const runtime = createRuntimeContext({
  rootDir,
  profilePath,
  sourceEvents: events
});
const { profile, connections, engine } = runtime;

const sourceLoad = sourceLive ? await engine.loadSourceEventsFromProviders({ windowDays }) : null;
const currentTokenState = runtime.adapters.google.config.tokenState || runtime.tokenState;
const currentTokenSummary = summarizeTokenState(currentTokenState, profile.calendars);

if (dryRun) {
  console.log(JSON.stringify({
    profileName: activeProfile.profileName,
    profilePath,
    profileSource: activeProfile.source,
    eventsPath,
    eventsSource: activeEvents.source,
    connections,
    tokens: { summary: currentTokenSummary, records: currentTokenState.records },
    sourceLoad,
    plan: engine.dryRun()
  }, null, 2));
} else if (applyMock) {
  console.log(JSON.stringify({
    profileName: activeProfile.profileName,
    profilePath,
    profileSource: activeProfile.source,
    eventsPath,
    eventsSource: activeEvents.source,
    connections,
    tokens: { summary: currentTokenSummary, records: currentTokenState.records },
    sourceLoad,
    result: engine.applyMockSync()
  }, null, 2));
} else if (applyLive) {
  console.log(JSON.stringify({
    profileName: activeProfile.profileName,
    profilePath,
    profileSource: activeProfile.source,
    eventsPath,
    eventsSource: activeEvents.source,
    connections,
    tokens: { summary: currentTokenSummary, records: currentTokenState.records },
    sourceLoad,
    result: await engine.applyLiveSync()
  }, null, 2));
} else {
  console.log("Use --dry-run, --apply-mock, or --apply-live. Reality continues to underperform expectations.");
}
