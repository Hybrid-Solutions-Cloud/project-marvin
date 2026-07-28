# Project Marvin

![Project Marvin logo](/logo-large.svg)

Project Marvin is a repo for setting up private calendar mirroring across multiple calendars and providers.

## Start Here

If you just cloned the repo and want to get moving, do this in order:

1. Run `npm install`
2. Run `npm run marvin:onboard`
3. Run `npm run solutions:test`
4. Pick **one** solution track below
5. Follow that solution's guide

## Which solution should I choose?

### Start with `Paranoid Keeper` if:

- you want the most practical external solution first
- you need Microsoft 365 plus Google
- Apple support might matter later

Guide:

- [Paranoid Keeper](/solutions/paranoid-keeper)

### Use `Bureaucratic Flow` if:

- you specifically want Power Automate
- your main problem is Microsoft 365 calendars
- you are comfortable with a Power Platform environment and Graph-backed deployment

Guide:

- [Bureaucratic Flow](/solutions/bureaucratic-flow)

### Use `Google Hub Of Last Resort` if:

- you are willing to use Google Calendar as the bridge between Outlook calendars
- you are comfortable running OGCS locally

Guide:

- [Google Hub Of Last Resort](/solutions/google-hub)

### Use `Marvin Engine` if:

- you want the first-party custom path
- you want the future product direction
- you are testing planning and mock sync behavior right now

Guide:

- [Marvin Engine](/solutions/marvin-engine)

## What is Marvin Engine?

`Marvin Engine` is **not** an installer for the other three solutions.

It is the repo's own custom sync engine prototype.

That means:

- `Paranoid Keeper`, `Bureaucratic Flow`, and `Google Hub Of Last Resort` are external-solution tracks
- `Marvin Engine` is the in-repo product path
- today, `Marvin Engine` supports dry-run and mock-sync behavior
- it does **not** yet replace the external solutions for live production sync

## Recommended first path

If you are unsure where to start, start with:

1. `npm run marvin:onboard`
2. [Paranoid Keeper](/solutions/paranoid-keeper)

That is the least confusing real pilot path in the repo right now.

## More detail

- [Solutions Index](/solutions)
- [Architecture](/architecture)
- [Credits](/credits)
