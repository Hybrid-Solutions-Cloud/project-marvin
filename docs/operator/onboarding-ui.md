# Marvin Onboarding UI Architecture

## Goal

A fresh operator should be able to clone the repo, launch one setup experience, provide account and routing information once, and then receive solution-specific configuration for any of the three external solutions or the first-party Marvin Engine.

## Product intent

The UI is not just a form. It is the operator-facing shell for:

- creating the Marvin operator account
- collecting calendar topology
- selecting provider types
- collecting privacy policy choices
- generating solution-specific configuration
- launching the hosted Marvin runtime
- routing the operator into backend engine linking when needed

## Current implementation

Run:

```powershell
npm install
npm run marvin:ui
```

Then open `http://localhost:4177`.

The current implementation now does all of this locally:

- creates a Marvin operator account record
- collects multi-calendar topology
- writes the shared Marvin profile
- writes the generated event fixture
- writes the Keeper `.env`
- generates per-solution artifacts
- can trigger the Azure hosted deployment path from the local repo

## Hosted model

For the Azure Container Apps path, Marvin is the public front door.

That means:

- the public URL opens Marvin first
- Marvin sits in front of the Keeper engine
- Keeper remains the backend sync runtime
- provider linking happens by routing from Marvin into the embedded Keeper path

## Remaining limits

The repo now owns the operator experience and deployment flow, but a few identity-bound steps still exist:

- Microsoft Entra app registration and consent
- Google OAuth app registration and consent if Google is included
- provider account authorization inside the backend sync engine
- final route confirmation against the generated sync plan

Those are provider authorization steps, not local repo setup steps.
