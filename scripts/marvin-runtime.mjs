import path from "node:path";
import { resolveActiveProfile } from "../solutions/marvin-engine/src/util/active-profile.mjs";
import { startRuntimeProcess, stopRuntimeProcess, getRuntimeProcessStatus } from "../solutions/marvin-engine/src/util/runtime-process.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const [action = "status"] = argv;
  const profileFlagIndex = argv.indexOf("--profile");
  const intervalFlagIndex = argv.indexOf("--interval-seconds");
  const windowDaysFlagIndex = argv.indexOf("--window-days");
  const rootDir = process.env.MARVIN_ROOT_DIR ? path.resolve(process.env.MARVIN_ROOT_DIR) : process.cwd();
  const explicitProfilePath = profileFlagIndex >= 0 ? argv[profileFlagIndex + 1] : "";
  const activeProfile = resolveActiveProfile(rootDir, explicitProfilePath);
  return {
    action,
    rootDir,
    profileName: activeProfile.profileName,
    profilePath: activeProfile.profilePath,
    profileSource: activeProfile.source,
    intervalSeconds: intervalFlagIndex >= 0 ? Number(argv[intervalFlagIndex + 1] || 300) : 300,
    windowDays: windowDaysFlagIndex >= 0 ? Number(argv[windowDaysFlagIndex + 1] || 0) : 0
  };
}

const args = parseArgs();
let result;
if (args.action === "start") {
  result = startRuntimeProcess(args.rootDir, {
    profileName: args.profileName,
    profilePath: args.profilePath,
    intervalSeconds: args.intervalSeconds,
    windowDays: args.windowDays
  });
} else if (args.action === "stop") {
  result = stopRuntimeProcess(args.rootDir, args.profileName);
} else {
  result = getRuntimeProcessStatus(args.rootDir, args.profileName);
}

console.log(JSON.stringify({ ok: true, action: args.action, profileName: args.profileName, profilePath: args.profilePath, profileSource: args.profileSource, runtimeProcess: result }, null, 2));

