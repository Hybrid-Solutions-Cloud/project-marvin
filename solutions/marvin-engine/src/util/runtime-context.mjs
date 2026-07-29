import path from "node:path";
import { loadProfile } from "./profile-loader.mjs";
import { FileMapStore } from "../storage/file-map-store.mjs";
import { FileTokenStore, buildTokenStorePath } from "../storage/file-token-store.mjs";
import { loadTokenStateForProfile } from "./token-state.mjs";
import { loadProviderSecretsForProfile } from "./provider-secrets.mjs";
import { MicrosoftGraphAdapter } from "../adapters/microsoft-graph.mjs";
import { GoogleCalendarAdapter } from "../adapters/google-calendar.mjs";
import { CalDavAdapter } from "../adapters/caldav.mjs";
import { SyncEngine } from "../core/sync-engine.mjs";

export function createRuntimeContext({
  rootDir = process.cwd(),
  profilePath,
  sourceEvents = [],
  fetchImpl,
  caldavAdapter
} = {}) {
  const { profile, connections } = loadProfile(profilePath);
  const tokenStore = new FileTokenStore(buildTokenStorePath(rootDir, profile.name));
  const tokenState = loadTokenStateForProfile(rootDir, profile.name);
  const providerSecrets = loadProviderSecretsForProfile(rootDir, profile.name);
  const store = new FileMapStore(path.join(rootDir, "artifacts", "marvin-engine", `${profile.name}.mappings.json`));
  const onTokenStateChange = async (nextState) => {
    tokenStore.save(nextState);
  };
  const adapters = {
    microsoft: new MicrosoftGraphAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange }),
    google: new GoogleCalendarAdapter({ profile, tokenState, providerSecrets, fetchImpl, onTokenStateChange }),
    caldav: caldavAdapter || new CalDavAdapter({ profile, tokenState, providerSecrets })
  };
  const engine = new SyncEngine({
    profile,
    sourceEvents,
    store,
    adapters
  });

  return {
    rootDir,
    profile,
    connections,
    tokenStore,
    tokenState,
    providerSecrets,
    store,
    adapters,
    engine
  };
}
