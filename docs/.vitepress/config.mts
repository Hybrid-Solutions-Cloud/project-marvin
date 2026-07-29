import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Project Marvin",
  description: "A mildly miserable lab for solving private multi-calendar mirroring.",
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
      { text: "Architecture", link: "/architecture" },
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
          { text: "Architecture", link: "/architecture" },
          { text: "Solutions Index", link: "/solutions" },
          { text: "Onboarding UI", link: "/operator/onboarding-ui" },
          { text: "Credits", link: "/credits" }
        ]
      },
      {
        text: "Primary Marvin Guides",
        items: [
          { text: "Marvin Engine", link: "/solutions/marvin-engine" },
          { text: "Marvin on Azure", link: "/solutions/marvin-azure" },
          { text: "Solutions Index", link: "/solutions" }
        ]
      },
      {
        text: "Reference Guides",
        items: [
          { text: "Paranoid Keeper", link: "/solutions/paranoid-keeper" },
          { text: "Keeper Hosting", link: "/solutions/paranoid-keeper-hosting" },
          { text: "Keeper on Azure", link: "/solutions/paranoid-keeper-azure" },
          { text: "Keeper on Cloudflare", link: "/solutions/paranoid-keeper-cloudflare" },
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
