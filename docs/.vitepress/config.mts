import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Project Marvin",
  description: "Private, delegated multi-calendar synchronization across Microsoft 365, Outlook, Apple, and Google.",
  base: "/project-marvin/",
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/project-marvin/favicon.svg" }]
  ],
  lastUpdated: true,
  themeConfig: {
    logo: "/favicon.svg",
    nav: [
      { text: "Home", link: "/" },
      { text: "Getting Started", link: "/getting-started" },
      { text: "Platform Support", link: "/platform-support" },
      { text: "Roadmap", link: "/roadmap" },
      { text: "Architecture", link: "/architecture" },
      { text: "Status", link: "/status" },
      { text: "Releases", link: "/releases" },
      { text: "Research", link: "/research/" },
      { text: "Solutions", link: "/solutions" },
      { text: "Credits", link: "/credits" }
    ],
    sidebar: [
      {
        text: "Project",
        items: [
          { text: "Overview", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Requirements", link: "/requirements" },
          { text: "Platform Support", link: "/platform-support" },
          { text: "Roadmap", link: "/roadmap" },
          { text: "Releases", link: "/releases" },
          { text: "Status", link: "/status" },
          { text: "Architecture", link: "/architecture" },
          { text: "Product Boundary", link: "/product-boundary" },
          { text: "Portal Architecture", link: "/portal-information-architecture" },
          { text: "Management API", link: "/management-api" },
          { text: "ADR: Durable State", link: "/adr/0001-durable-state" },
          { text: "Solutions Index", link: "/solutions" },
          { text: "Onboarding UI", link: "/operator/onboarding-ui" },
          { text: "Microsoft Connection", link: "/operator/microsoft-connection" },
          { text: "Microsoft Synchronization", link: "/operator/microsoft-sync" },
          { text: "Apple Calendar", link: "/operator/apple-calendar" },
          { text: "Operations Runbook", link: "/operator/operations-runbook" },
          { text: "Security and Privacy", link: "/operator/security-privacy" },
          { text: "Credits", link: "/credits" }
        ]
      },
      {
        text: "Primary Marvin Guides",
        items: [
          { text: "Application Contract", link: "/solutions/project-marvin" },
          { text: "Azure deployment", link: "/solutions/marvin-azure" },
          { text: "Solutions Index", link: "/solutions" }
        ]
      },
      {
        text: "Reference Guides",
        items: [
          { text: "Bureaucratic Flow", link: "/solutions/bureaucratic-flow" },
          { text: "Google Hub", link: "/solutions/google-hub" }
        ]
      },
      {
        text: "Research Spikes",
        items: [
          { text: "Index", link: "/research/" },
          { text: "Landscape", link: "/research/calendar-sync-landscape" },
          { text: "Power Automate", link: "/research/spike-power-automate" },
          { text: "Graph + CalDAV Service", link: "/research/spike-graph-caldav-service" },
          { text: "Existing OSS Tools", link: "/research/spike-existing-tools" }
        ]
      }
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/Hybrid-Solutions-Cloud/project-marvin" }
    ]
  }
});
