# Google Hub Of Last Resort

## Status

Google Hub Of Last Resort is a **legacy desktop fallback reference** based on `OutlookGoogleCalendarSync`.
It is kept in the repo for comparison, research, and migration context only.

It does **not** satisfy Project Marvin's unattended automation requirement by itself.

## Why it is not the main path

This track depends on:

- a desktop runtime
- manual provider sign-in inside OGCS
- Google acting as the structural bridge
- ongoing client-state health on the machine where OGCS runs

That makes it useful as a reference, but not the primary Marvin answer.

## When to read this page

Use this page only when you need to understand:

- how earlier Outlook-to-Google sync tooling approached the problem
- what compromises appear when Google becomes the hub
- what a desktop-managed fallback would require

## Repo scope

The repo only automates the generated configuration artifacts around this reference track.
It does **not** turn OGCS into a fully unattended Marvin deployment.

## Fast truth

- unattended product path: **no**
- useful research reference: **yes**
- preferred new-user starting point: **no**

## Start with Marvin instead

If your goal is the real repo product path, use:

- [Getting Started](/getting-started)
- [Marvin Engine](/solutions/marvin-engine)
- [Marvin on Azure](/solutions/marvin-azure)
- [Onboarding UI](/operator/onboarding-ui)

## Kept for credits and research

This page remains because the repo gives credit to the community tools that informed Marvin's design, including `OutlookGoogleCalendarSync`.
