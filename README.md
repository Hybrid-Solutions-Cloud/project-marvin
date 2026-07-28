# Project Marvin

Project Marvin is a docs-first repository for researching and eventually implementing automated private calendar mirroring across multiple providers.

The current repo includes:

- a VitePress documentation site under `docs/`
- a GitHub Pages deployment workflow
- research spikes for Microsoft 365, Outlook, Apple Calendar, Power Automate, and open-source sync tooling

## Local docs

Install dependencies:

```powershell
npm install
```

Run the docs site locally:

```powershell
npm run docs:dev
```

Build the docs site:

```powershell
npm run docs:build
```

## Research entry points

- `docs/research/calendar-sync-landscape.md`
- `docs/research/spike-power-automate.md`
- `docs/research/spike-graph-caldav-service.md`
- `docs/research/spike-existing-tools.md`
