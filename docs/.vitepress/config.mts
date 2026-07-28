import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Project Marvin",
  description: "Research and implementation notes for private multi-calendar mirroring.",
  base: "/project-marvin/",
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Architecture", link: "/architecture" },
      { text: "Research", link: "/research/" }
    ],
    sidebar: [
      {
        text: "Project",
        items: [
          { text: "Overview", link: "/" },
          { text: "Architecture", link: "/architecture" }
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
