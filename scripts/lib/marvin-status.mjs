export function buildRequirementCoverage() {
  const requirements = [
    {
      id: 1,
      requirement: "An event created or accepted in any connected calendar mirrors to every other connected calendar.",
      status: "partial",
      evidence: [
        "npm run marvin:smoke-live",
        "npm run marvin:smoke-live-readiness",
        "npm run marvin:smoke-subscriptions",
        "npm run marvin:smoke-runtime-webhook-wake"
      ],
      remainingGap: "Not yet proven against real customer-owned live calendars."
    },
    {
      id: 2,
      requirement: "Marvin mirrors that event to every other connected calendar.",
      status: "partial",
      evidence: [
        "npm run marvin:smoke-live",
        "npm run marvin:smoke-live-readiness",
        "npm run marvin:smoke-subscriptions",
        "npm run marvin:smoke-runtime-webhook-wake"
      ],
      remainingGap: "Not yet proven in a real always-on deployed runtime."
    },
    {
      id: 3,
      requirement: "Mirrored events are private by default.",
      status: "partial",
      evidence: [
        "npm run marvin:smoke-live"
      ],
      remainingGap: "Not yet proven against real tenant data and viewer permissions."
    },
    {
      id: 4,
      requirement: "Selected target calendars, such as family calendars, can receive full detail instead.",
      status: "partial",
      evidence: [
        "npm run marvin:smoke-live",
        "npm run marvin:smoke-account-management"
      ],
      remainingGap: "Not yet proven in real customer calendars."
    },
    {
      id: 5,
      requirement: "Every mirrored event carries the source calendar prefix.",
      status: "proven-locally",
      evidence: [
        "npm run marvin:smoke-live",
        "npm run marvin:smoke-account-management"
      ],
      remainingGap: "Not yet proven end-to-end in real tenant-backed writes."
    },
    {
      id: 6,
      requirement: "Timezone behavior follows the source event instead of being hardcoded.",
      status: "proven-locally",
      evidence: [
        "npm run marvin:smoke-live",
        "npm run marvin:smoke-microsoft-timezone"
      ],
      remainingGap: "Not yet proven with real travel and provider edge cases."
    },
    {
      id: 7,
      requirement: "Real provider authentication and connected-account validation must work before Marvin treats a calendar as ready.",
      status: "partial",
      evidence: [
        "npm run marvin:smoke-onboard-api",
        "npm run marvin:smoke-operator-journey",
        "npm run marvin:smoke-connection-validation",
        "npm run marvin:smoke-auth-gating"
      ],
      remainingGap: "Still not proven across real hosted runtimes and real customer-owned provider tenants."
    },
    {
      id: 8,
      requirement: "Simple onboarding and ongoing account-management UI must exist for Marvin operators.",
      status: "partial",
      evidence: [
        "npm run marvin:smoke-ui-surface",
        "npm run marvin:smoke-operator-journey",
        "npm run marvin:smoke-onboarding-guidance"
      ],
      remainingGap: "Still not proven as a finished production UX across real tenants and hosted runtime."
    },
    {
      id: 9,
      requirement: "Ongoing management must allow adding, removing, and updating calendars and mirror policy.",
      status: "proven-locally",
      evidence: [
        "npm run marvin:smoke-account-management",
        "npm run marvin:smoke-ui-surface"
      ],
      remainingGap: "Not yet proven in a real deployed multi-user environment."
    },
    {
      id: 10,
      requirement: "Installer, bootstrap, verification, and deployment flows must be scriptable.",
      status: "partial",
      evidence: [
        "npm run marvin:smoke-install",
        "npm run marvin:smoke-bootstrap",
        "npm run marvin:smoke-docs-commands",
        "npm run marvin:smoke-deploy-plan"
      ],
      remainingGap: "Full production deployment and operations proof is still missing."
    },
    {
      id: 11,
      requirement: "Microsoft 365, Outlook, and Google are in scope. Apple / CalDAV remains optional.",
      status: "partial",
      evidence: [
        "npm run marvin:smoke-live",
        "npm run marvin:smoke-operator-journey",
        "npm run marvin:smoke-caldav-live",
        "npm run marvin:smoke-outlook"
      ],
      remainingGap: "Real end-to-end customer proof across all providers is still missing."
    },
    {
      id: 12,
      requirement: "Repository documentation must reflect the true architecture, implementation status, setup, deployment, and testing process.",
      status: "partial",
      evidence: [
        "npm run marvin:smoke-docs-commands",
        "npm run marvin:smoke-status-reporting",
        "npm run docs:build"
      ],
      remainingGap: "Docs render and status wiring are proven locally, but they still describe a locally proven product rather than a fully completed production deployment."
    }
  ];

  const summary = {
    total: requirements.length,
    provenLocally: requirements.filter((item) => item.status === "proven-locally").length,
    partial: requirements.filter((item) => item.status === "partial").length,
    missing: requirements.filter((item) => item.status === "missing").length
  };

  return {
    asOf: "2026-07-30",
    docsPath: "docs/requirements.md",
    summary,
    requirements
  };
}
