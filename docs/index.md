# Project Marvin

<div class="marvin-hero-logo">
  <img src="/logo-large.svg" alt="Project Marvin logo">
</div>

Project Marvin is the operator-facing shell for private calendar mirroring across multiple calendars and providers. The user-facing product is Marvin. The hosted sync engine underneath the primary path is Paranoid Keeper.

## Start Here

If you just cloned the repo and want the real starting path, do this in order:

1. Run `npm install`
2. Run `npm run marvin:ui`
3. Open `http://localhost:4177`
4. Create your Marvin operator account
5. Save your shared Marvin profile
6. Pick one solution track and continue

## What starts where

`npm run marvin:ui` is the primary entry point.

That UI:

- creates the Marvin operator account
- collects your multi-calendar topology
- writes the shared Marvin profile
- generates the artifacts for all solution tracks
- writes the Keeper `.env`
- can trigger the Azure deployment for the hosted Marvin runtime

The older `npm run marvin:onboard` path still exists, but it is only the prompt-driven fallback.

## Which solution should I choose?

### Start with `Paranoid Keeper` if:

- you want the most practical always-on path first
- you need multi-M365 and optional Google support
- you want the hosted Azure deployment path now

Guide:

- [Paranoid Keeper](/solutions/paranoid-keeper)

### Use `Bureaucratic Flow` if:

- you specifically want Power Automate
- your main problem is Microsoft 365 calendars
- you want the Graph-backed automation artifacts generated from the same Marvin profile

Guide:

- [Bureaucratic Flow](/solutions/bureaucratic-flow)

### Use `Google Hub Of Last Resort` if:

- you are willing to use Google Calendar as the bridge between Outlook calendars
- you accept that this is not the preferred fully hosted path

Guide:

- [Google Hub Of Last Resort](/solutions/google-hub)

### Use `Marvin Engine` if:

- you want the first-party custom path
- you want the future product direction
- you are testing planning and mock sync behavior right now

Guide:

- [Marvin Engine](/solutions/marvin-engine)

## What is Marvin Engine?

`Marvin Engine` is not an installer for the other three solutions.

It is the repo's own custom sync engine prototype.

That means:

- `Paranoid Keeper`, `Bureaucratic Flow`, and `Google Hub Of Last Resort` are external-solution tracks generated from Marvin
- `Marvin Engine` is the in-repo product path
- today, `Marvin Engine` supports dry-run and mock-sync behavior
- it does not yet replace the external solutions for live production sync

## Recommended first path

If you are unsure where to start, start with:

1. `npm run marvin:ui`
2. [Paranoid Keeper](/solutions/paranoid-keeper)
3. [Deploy Keeper to Azure Container Apps](/solutions/paranoid-keeper-azure)

That is the least confusing real pilot path in the repo right now.

## More detail

- [Onboarding UI](/operator/onboarding-ui)
- [Solutions Index](/solutions)
- [Architecture](/architecture)
- [Credits](/credits)
