# Calendar Sync Landscape

## Problem statement

You need event mirroring across multiple calendars, including Microsoft 365 / Outlook and Apple Calendar, with destination events marked private or reduced to blocker-level detail.

Typical user stories:

- Accept a work meeting in Microsoft 365 and have it auto-block personal and contracting calendars.
- Create a contracting event and have it auto-block work and personal calendars.
- Keep everything synchronized without manually duplicating events.

## Constraints that matter

- Microsoft 365 supports rich API access through Microsoft Graph.
- Apple Calendar usually enters the picture through CalDAV or iCloud app authorization.
- Cross-provider sync gets difficult around recurrence, updates, deletes, and loop prevention.
- Privacy rules vary by provider and connector.

## Viable implementation paths

### 1. Power Automate

Strong fit when:

- most calendars are Outlook or Microsoft 365
- you want a low-code starting point
- you accept slower runs and more operational friction

Weak fit when:

- you need Apple Calendar as a first-class writable target
- you want reproducible infrastructure-as-code
- you want strong control over loops, retries, and state

### 2. Custom sync service

Strong fit when:

- you need durable automation
- you want scripted deployment
- you need precise privacy policies
- you need Apple via CalDAV and Microsoft via Graph in one engine

Weak fit when:

- you want the lowest possible implementation effort right now

### 3. Existing open-source sync product

Strong fit when:

- you want to stand something up quickly
- the tool already supports the providers you need
- you can accept the tool's event model and operational shape

Weak fit when:

- you need very specific mirror semantics
- you need narrow control over metadata or tenant policy

## Recommended short list

1. `MShekow/outlook-calendar-sync` as a reference for the Power Automate algorithm and flow packaging.
2. A custom Graph plus CalDAV service if your priority is long-term ownership and scripted deployment.

## Decision

Current recommendation:

- Use Power Automate only as a short-term proof of concept for M365-to-M365.
- For the real Project Marvin target, prefer either:
  - adapting an existing open-source multi-provider sync engine, or
  - building a narrow custom service around Microsoft Graph plus CalDAV.
