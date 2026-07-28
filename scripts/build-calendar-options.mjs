import fs from "node:fs";
import path from "node:path";

const profilePath = process.argv[2] ?? "profiles/marvin.example.json";
const root = process.cwd();
const fullProfilePath = path.resolve(root, profilePath);
const profile = JSON.parse(fs.readFileSync(fullProfilePath, "utf8"));

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

function formatRoute(route) {
  const source = getCalendar(route.source);
  const targets = route.targets.map(getCalendar);
  return `- ${source.label} -> ${targets.map((item) => item.label).join(", ")} (${route.mirrorMode})`;
}

const outRoot = path.join(root, "artifacts", "solutions", profile.name);
ensureDir(outRoot);

const keeperRoot = path.join(outRoot, "paranoid-keeper");
const keeperRoutes = profile.routes
  .map((route) => {
    const source = getCalendar(route.source);
    const targets = route.targets.map(getCalendar);
    return [
      `## ${source.label}`,
      "",
      `Source provider: ${source.provider}`,
      `Mirror mode: ${route.mirrorMode}`,
      `Targets: ${targets.map((item) => item.label).join(", ")}`,
      `Subject prefix: ${route.subjectPrefix}`
    ].join("\n");
  })
  .join("\n\n");

writeFile(
  path.join(keeperRoot, "sync-plan.md"),
  `# Paranoid Keeper Sync Plan\n\nProfile: ${profile.name}\nTimezone: ${profile.timezone}\nSync window: ${profile.syncWindowDays} days\n\nYes, this is the least ridiculous external option.\n\n## Route Summary\n\n${profile.routes.map(formatRoute).join("\n")}\n\n## Provider Coverage\n\n- Microsoft 365 and Outlook: supported via Microsoft OAuth\n- Google: supported via Google OAuth\n- Apple Calendar: optional via iCloud or CalDAV setup\n\n## Test Sequence\n\n1. Create the local .env with solutions/paranoid-keeper/setup-env.ps1\n2. Validate prerequisites with solutions/paranoid-keeper/validate.ps1\n3. Start the stack with solutions/paranoid-keeper/start.ps1\n4. Configure provider connections in Keeper UI\n5. Apply the routes listed below\n\n## Detailed Route Notes\n\n${keeperRoutes}\n`
);

writeFile(
  path.join(keeperRoot, ".env.example"),
  [
    `BETTER_AUTH_SECRET=`,
    `ENCRYPTION_KEY=`,
    `TRUSTED_ORIGINS=http://localhost:3000`,
    `GOOGLE_CLIENT_ID=`,
    `GOOGLE_CLIENT_SECRET=`,
    `MICROSOFT_CLIENT_ID=`,
    `MICROSOFT_CLIENT_SECRET=`
  ].join("\n") + "\n"
);

const paRoot = path.join(outRoot, "bureaucratic-flow");
const paCalendars = profile.calendars.filter((item) => item.provider === "m365" || item.provider === "outlook");
const paRoutes = profile.routes.filter(
  (route) => getCalendar(route.source).provider === "m365" && route.targets.every((id) => {
    const target = getCalendar(id);
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
      notes: [
        "This solution is intentionally narrowed to Outlook and Microsoft 365 calendars.",
        "Routes involving Google or Apple are excluded, because naturally the easy thing would have been too easy."
      ]
    },
    null,
    2
  ) + "\n"
);

writeFile(
  path.join(paRoot, "import-checklist.md"),
  `# Bureaucratic Flow Import Checklist\n\nProfile: ${profile.name}\n\nThis is the pragmatic Microsoft-only route. Slow, visual, and irritating, but still usable.\n\n## Eligible Calendars\n\n${paCalendars.map((item) => `- ${item.label} (${item.email})`).join("\n")}\n\n## Eligible Routes\n\n${paRoutes.length ? paRoutes.map(formatRoute).join("\n") : "- None in this profile."}\n\n## Test Sequence\n\n1. Validate local generated inputs with solutions/bureaucratic-flow/validate.ps1\n2. Build the staging bundle with solutions/bureaucratic-flow/build-solution.ps1\n3. Create Office 365 Outlook connections in Power Automate\n4. Import or rebuild the MShekow flow package\n5. Apply the settings from flow-settings.json\n6. Run a 1-day test window before increasing to ${profile.syncWindowDays} days\n`
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

const xmlProfiles = ogcsPairs.map((pair, index) => `  <Profile index="${index + 1}" name="${pair.profileName}">\n    <OutlookCalendar>${pair.outlook.email}</OutlookCalendar>\n    <GoogleCalendar>${pair.google.email}</GoogleCalendar>\n    <SyncDirection>Bidirectional</SyncDirection>\n    <TargetPrivacy>Private</TargetPrivacy>\n    <TargetSubjectPrefix>BUSY:</TargetSubjectPrefix>\n  </Profile>`).join("\n");

writeFile(
  path.join(ogcsRoot, "settings.template.xml"),
  `<OGCSConfig>\n  <ProfileName>${profile.name}</ProfileName>\n  <Timezone>${profile.timezone}</Timezone>\n  <SyncWindowDays>${profile.syncWindowDays}</SyncWindowDays>\n${xmlProfiles || "  <!-- No Google calendar found in the profile; naturally this option collapses without its hub. -->"}\n</OGCSConfig>\n`
);

writeFile(
  path.join(ogcsRoot, "runbook.md"),
  `# Google Hub Of Last Resort Runbook\n\nProfile: ${profile.name}\n\nThis is the compromise option. One introduces Google as an availability hub because direct elegance was apparently unavailable.\n\n## Outlook <-> Google Pairs\n\n${ogcsPairs.length ? ogcsPairs.map((pair) => `- ${pair.outlook.label} <-> ${pair.google.label}`).join("\n") : "- No Google calendar found in profile."}\n\n## Test Sequence\n\n1. Validate generated inputs with solutions/google-hub/validate.ps1\n2. Install OGCS with solutions/google-hub/install-ogcs.ps1\n3. Render the XML with solutions/google-hub/render-settings.ps1\n4. Open OGCS and bind Outlook calendars to the Google hub\n5. Start with a limited date window\n\n## Notes\n\n- This is not the strongest fit for direct multi-M365 mirroring.\n- It is useful when you want one Google visibility hub and are comfortable running a desktop sync tool.\n- Apple Calendar is not directly covered by this solution.\n`
);

const marvinRoot = path.join(outRoot, "marvin-engine");
writeFile(
  path.join(marvinRoot, "dry-run-plan.md"),
  `# Marvin Engine Dry Run Plan\n\nProfile: ${profile.name}\nTimezone: ${profile.timezone}\nSync window: ${profile.syncWindowDays} days\n\nThis is the in-repo first-party service path. It can now execute a deterministic mock sync and write mapping state. Remarkable, really.\n\n## Planned Routes\n\n${profile.routes.map(formatRoute).join("\n")}\n\n## Intended Providers\n\n- Microsoft Graph for Microsoft 365 and Outlook\n- Google Calendar API if a Google hub remains relevant\n- CalDAV for optional Apple calendar support\n\n## Local Test Sequence\n\n1. Run npm run marvin:dry-run\n2. Run npm run marvin:apply-mock\n3. Inspect artifacts/marvin-engine/${profile.name}.mappings.json\n`
);

const summary = {
  profile: profile.name,
  generatedAt: new Date().toISOString(),
  routes: profile.routes.length,
  solutions: [
    { name: "paranoid-keeper", path: path.relative(root, keeperRoot) },
    { name: "bureaucratic-flow", path: path.relative(root, paRoot) },
    { name: "google-hub", path: path.relative(root, ogcsRoot) },
    { name: "marvin-engine", path: path.relative(root, marvinRoot) }
  ]
};

writeFile(path.join(outRoot, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`Generated solution artifacts for ${profile.name} at ${path.relative(root, outRoot)}`);
