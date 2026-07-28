# Solutions

## One onboarding flow

Every solution now starts from one source of truth:

- generated profile JSON
- generated event fixture JSON
- solution-specific rendered artifacts

Run this first from a fresh clone:

```powershell
npm install
npm run marvin:onboard
npm run solutions:test
```

That gives an operator a local profile, generated artifacts, a Keeper `.env` placeholder, and a validated starting point.

## GUI direction

The long-term product direction is documented here:

- [Onboarding UI Architecture](/operator/onboarding-ui)

## Solution guides

- [Paranoid Keeper](/solutions/paranoid-keeper)
- [Bureaucratic Flow](/solutions/bureaucratic-flow)
- [Google Hub Of Last Resort](/solutions/google-hub)
- [Marvin Engine](/solutions/marvin-engine)

## Repo Persona

This repo speaks in the voice of Marvin:

- dry
- pessimistic
- technically competent
- unimpressed by needless complexity

The point is not random novelty. The point is to make tedious infrastructure work feel deliberate.

## Shared input

All solution tracks share:

- `profiles/marvin.example.json`
- `profiles/marvin.example.events.json`
- generated local profiles from `scripts/setup-marvin.ps1`

Run the whole local test pass with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-all-solutions.ps1
```
