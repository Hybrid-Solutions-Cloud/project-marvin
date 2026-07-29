import fs from "node:fs";
import path from "node:path";
import { resolveActiveProfile } from "../solutions/marvin-engine/src/util/active-profile.mjs";
import { buildProviderRuntime } from "../solutions/marvin-engine/src/util/provider-connections.mjs";

const root = process.env.MARVIN_ROOT_DIR ? path.resolve(process.env.MARVIN_ROOT_DIR) : process.cwd();
const explicitProfilePath = process.argv[2] ?? "";
const activeProfile = resolveActiveProfile(root, explicitProfilePath);
const profilePath = activeProfile.profilePath;
const fullProfilePath = path.resolve(root, profilePath);
const profile = JSON.parse(fs.readFileSync(fullProfilePath, "utf8"));
const providerRuntime = buildProviderRuntime({
  providerConnections: profile?.runtime?.providerConnections,
  deployment: profile?.runtime?.deployment
});

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function getCalendar(id) {
  const calendar = profile.calendars.find((item) => item.id === id);
  if (!calendar) {
    throw new Error(`Unknown calendar id: ${id}`);
  }
  return calendar;
}

function getTargetConfig(targetRef) {
  return typeof targetRef === "string" ? { calendarId: targetRef } : targetRef;
}

function formatRoute(route) {
  const source = getCalendar(route.source);
  const targets = route.targets.map(getTargetConfig).map((item) => getCalendar(item.calendarId));
  return `- ${source.label} -> ${targets.map((item) => item.label).join(", ")} (${route.mirrorMode ?? profile.privacyDefaults.mirrorMode})`;
}

const outRoot = path.join(root, "artifacts", "solutions", profile.name);
ensureDir(outRoot);

const keeperRoot = path.join(outRoot, "paranoid-keeper");
const keeperRoutes = profile.routes
  .map((route) => {
    const source = getCalendar(route.source);
    const targets = route.targets.map(getTargetConfig).map((item) => ({
      config: item,
      calendar: getCalendar(item.calendarId)
    }));
    return [
      `## ${source.label}`,
      "",
      `Source provider: ${source.provider}`,
      `Source prefix: ${source.sourcePrefix}`,
      ...targets.map((item) => `- ${item.calendar.label}: visibility=${item.config.visibility ?? profile.privacyDefaults.visibility}, detailMode=${item.config.detailMode ?? route.mirrorMode ?? profile.privacyDefaults.mirrorMode}, prefix=${item.config.subjectPrefix ?? source.sourcePrefix}`)
    ].join("\n");
  })
  .join("\n\n");

writeFile(
  path.join(keeperRoot, "sync-plan.md"),
  `# Paranoid Keeper Sync Plan\n\nProfile: ${profile.name}\nTimezone: ${profile.timezone}\nSync window: ${profile.syncWindowDays} days\n\nThis remains the external runtime reference while Marvin Engine becomes the product-owned path.\n\n## Route Summary\n\n${profile.routes.map(formatRoute).join("\n")}\n\n## Provider Coverage\n\n- Microsoft 365 and Outlook: ${providerRuntime.microsoft.authMode}\n- Google: ${providerRuntime.google.authMode}\n- Apple Calendar: ${providerRuntime.caldav.authMode}\n\n## Policy Coverage\n\n- private-by-default mirrored events\n- per-target visibility overrides\n- automatic per-source prefixes\n- preserve original event timezone\n\n## Detailed Route Notes\n\n${keeperRoutes}\n`
);

writeFile(
  path.join(keeperRoot, ".env.example"),
  [
    `BETTER_AUTH_SECRET=`,
    `ENCRYPTION_KEY=`,
    `TRUSTED_ORIGINS=http://localhost:3000`,
    `GOOGLE_CLIENT_ID=${providerRuntime.google.clientId ?? ""}`,
    `GOOGLE_CLIENT_SECRET=`,
    `MICROSOFT_CLIENT_ID=${providerRuntime.microsoft.clientId ?? ""}`,
    `MICROSOFT_CLIENT_SECRET=`
  ].join("\n") + "\n"
);

const paRoot = path.join(outRoot, "bureaucratic-flow");
const paCalendars = profile.calendars.filter((item) => item.provider === "m365" || item.provider === "outlook");
const paRoutes = profile.routes.filter(
  (route) => (getCalendar(route.source).provider === "m365" || getCalendar(route.source).provider === "outlook") && route.targets.every((targetRef) => {
    const target = getCalendar(getTargetConfig(targetRef).calendarId);
    return target.provider === "m365" || target.provider === "outlook";
  })
);

writeFile(
  path.join(paRoot, "flow-settings.json"),
  JSON.stringify(
    {
      profile: profile.name,
      timezone: profile.timezone,
      syncWindowDays: profile.syncWindowDays,
      eligibleCalendars: paCalendars,
      eligibleRoutes: paRoutes,
      providerRuntime: providerRuntime.microsoft,
      notes: [
        "This solution is intentionally narrowed to Outlook and Microsoft 365 calendars.",
        "Routes involving Google or Apple are excluded because the Power Automate baseline is not the full Marvin target architecture."
      ]
    },
    null,
    2
  ) + "\n"
);

writeFile(
  path.join(paRoot, "import-checklist.md"),
  `# Bureaucratic Flow Import Checklist\n\nProfile: ${profile.name}\n\nThis is the pragmatic Microsoft-only route.\n\n## Eligible Calendars\n\n${paCalendars.map((item) => `- ${item.label} (${item.email})`).join("\n")}\n\n## Eligible Routes\n\n${paRoutes.length ? paRoutes.map(formatRoute).join("\n") : "- None in this profile."}\n\n## Runtime Mode\n\n- auth mode: ${providerRuntime.microsoft.authMode}\n- auth path: Marvin-native provider linking\n`
);

const ogcsRoot = path.join(outRoot, "google-hub");
const googleHub = profile.calendars.find((item) => item.provider === "google");
const outlookCalendars = profile.calendars.filter((item) => item.provider === "m365" || item.provider === "outlook");
const ogcsPairs = googleHub
  ? outlookCalendars.map((item, index) => ({
      profileName: `OGCS-${index + 1}`,
      outlook: item,
      google: googleHub
    }))
  : [];

const xmlProfiles = ogcsPairs.map((pair, index) => `  <Profile index="${index + 1}" name="${pair.profileName}">\n    <OutlookCalendar>${pair.outlook.email}</OutlookCalendar>\n    <GoogleCalendar>${pair.google.email}</GoogleCalendar>\n    <SyncDirection>Bidirectional</SyncDirection>\n    <TargetPrivacy>Private</TargetPrivacy>\n    <TargetSubjectPrefix>${pair.outlook.sourcePrefix}</TargetSubjectPrefix>\n  </Profile>`).join("\n");

writeFile(
  path.join(ogcsRoot, "settings.template.xml"),
  `<OGCSConfig>\n  <ProfileName>${profile.name}</ProfileName>\n  <Timezone>${profile.timezone}</Timezone>\n  <SyncWindowDays>${profile.syncWindowDays}</SyncWindowDays>\n${xmlProfiles || "  <!-- No Google calendar found in the profile. -->"}\n</OGCSConfig>\n`
);

writeFile(
  path.join(ogcsRoot, "runbook.md"),
  `# Google Hub Of Last Resort Runbook\n\nProfile: ${profile.name}\n\nThis is still a compromise option, not the primary Marvin target architecture.\n\nCurrent Google runtime mode: ${providerRuntime.google.authMode}\n`
);

const marvinRoot = path.join(outRoot, "marvin-engine");
writeFile(
  path.join(marvinRoot, "dry-run-plan.md"),
  `# Marvin Engine Dry Run Plan\n\nProfile: ${profile.name}\nTimezone: ${profile.timezone}\nSync window: ${profile.syncWindowDays} days\n\nThis is the in-repo first-party service path.\n\n## Planned Routes\n\n${profile.routes.map(formatRoute).join("\n")}\n\n## Provider Runtime\n\n- Microsoft: ${providerRuntime.microsoft.authMode}\n- Google: ${providerRuntime.google.authMode}\n- CalDAV: ${providerRuntime.caldav.authMode}\n\n## Policy Guarantees Under Design\n\n- private-by-default mirrored events\n- family-calendar visibility overrides\n- per-source prefixes\n- preserved source timezone behavior\n- account connection status tracked per calendar\n`
);

const summary = {
  profile: profile.name,
  generatedAt: new Date().toISOString(),
  routes: profile.routes.length,
  providerRuntime,
  solutions: [
    { name: "paranoid-keeper", path: path.relative(root, keeperRoot) },
    { name: "bureaucratic-flow", path: path.relative(root, paRoot) },
    { name: "google-hub", path: path.relative(root, ogcsRoot) },
    { name: "marvin-engine", path: path.relative(root, marvinRoot) }
  ]
};

writeFile(path.join(outRoot, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`Generated solution artifacts for ${profile.name} at ${path.relative(root, outRoot)} (${activeProfile.source})`);

