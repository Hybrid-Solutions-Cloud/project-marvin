# Solutions
## Read this first
The setup wizard is not a solution picker.
It is Marvin's onboarding flow.
If you are cloning this repo to get a working product path, start with Marvin:

1. Read [Getting Started](/getting-started).
2. Run `npm run marvin:install`.
3. Run `npm run marvin:ui` if the console is not already open.
4. Create the Marvin admin sign-in, add calendars, link accounts, review sync policy, and start Marvin automation.
## Product path vs reference paths
| Path | Purpose | Automation status |
| --- | --- | --- |
| Marvin | Primary product path | Automated after Marvin setup and runtime start |
| Paranoid Keeper | Bridge-hosting reference | Automated only after separate hosted bridge deployment |
| Bureaucratic Flow | Microsoft-focused Power Automate reference | Automated only after Power Automate deployment |
| Google Hub Of Last Resort | Legacy desktop fallback reference | Not fully unattended |
## Important clarification
Marvin Engine is not a solution picker or installer for the other tracks.
It is the sync engine behind the repo's main product path.
The other documented tracks remain in the repo for comparison, credits, migration context, and bridge-hosting ideas.
They are not the recommended first-run path, and they should not appear as choices in Marvin's product onboarding.
## Recommended reading
### Start here for the actual Marvin product path
- [Getting Started](/getting-started)
- [Marvin Engine](/solutions/marvin-engine)
- [Marvin on Azure](/solutions/marvin-azure)
- [Onboarding UI](/operator/onboarding-ui)
- [Architecture](/architecture)
### Reference and comparison material
- [Paranoid Keeper](/solutions/paranoid-keeper)
- [Keeper Hosting Matrix](/solutions/paranoid-keeper-hosting)
- [Deploy Keeper to Azure Container Apps](/solutions/paranoid-keeper-azure)
- [Bureaucratic Flow](/solutions/bureaucratic-flow)
- [Google Hub Of Last Resort](/solutions/google-hub)
- [Credits](/credits)
## Shared repo artifacts
The repo still generates shared planning artifacts that reference the historical tracks:
- profiles/marvin.example.json
- profiles/marvin.example.events.json
- generated local Marvin account configurations from Marvin onboarding or marvin:setup
- generated artifacts from scripts/build-calendar-options.mjs
That shared artifact generation does not change the preferred product path: Marvin comes first.
