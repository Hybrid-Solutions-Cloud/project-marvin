# Product Boundary

_Status: working product contract · Tracking: AB#7663_

## Product identity

**Project Marvin** is the customer-facing calendar synchronization application and the repository/product-development program. **Marvin Engine** is its first-party synchronization runtime.

The product is one portal and one runtime distributed through a portable Open Container Initiative contract. Docker and cloud integrations are deployment adapters around that same application; they do not create separate Project Marvin products. Historical experiments remain useful design references, but they are not choices presented to a new operator.

## Who the product serves

The first acceptable release serves one person or household that needs a trustworthy view of availability across several calendar identities. A workspace has one Microsoft Entra owner and can connect multiple calendar accounts.

This release is not a multi-customer SaaS service and does not provide delegated workspace administration.

## Product journey

1. Use the local source workflow for development, or choose a hosted adapter whose maturity and limitations are stated in the [platform support matrix](/platform-support).
2. Sign in with the Microsoft identity that owns the workspace.
3. Connect provider accounts in release order: Microsoft first, Apple second, and Google third.
4. Select calendars, confirm privacy rules, and validate provider access.
5. Review a synchronization preview before enabling provider writes.
6. Use the portal to monitor health, manage calendars and policies, and recover failed connections.

## Synchronization contract

- Every selected calendar can originate events.
- An original event is canonical; generated mirrors are not editable sources.
- Mirrors are private by default.
- A trusted destination can receive approved subject, location, and description detail.
- Provider markers and persistent mappings prevent generated mirrors from looping back as originals.
- Create and update operations must be idempotent.
- Source deletion can remove an owned mirror only after strict ownership and successful-source-read checks.
- Live provider testing must not issue calendar deletion requests unless the environment owner separately authorizes that test.

## Included in the first acceptable release

- Guided first-run and returning-operator portal journeys
- Dashboard, Calendars, Sync Rules, Activity, Diagnostics, and Settings surfaces
- Microsoft 365 and Outlook.com connection and synchronization
- Apple Calendar connection through CalDAV
- Google Calendar connection and synchronization
- Private, busy-only, subject, and trusted-detail target policies
- Runtime status and controls
- Actionable authentication, permission, provider, and synchronization failures
- Secure credential storage, durable mappings, restart recovery, backup, upgrade, and operational documentation
- A versioned portable application artifact plus at least one deployment adapter that passes the complete support contract

## Explicitly out of scope

- Multi-customer SaaS hosting
- Multiple workspace administrators
- Mobile applications
- Editing a generated mirror to modify its original
- Providers beyond Microsoft, Apple, and Google
- General-purpose calendar-client or scheduling features
- Power Automate, Bureaucratic Flow, and Google Hub as supported installation paths

## Release sequencing

Provider work is gated rather than parallel:

1. The portal foundation must be usable before the Microsoft connection journey is released.
2. Microsoft connection, synchronization, and real-account validation must pass before Apple implementation begins.
3. Apple discovery, polling, synchronization, and real-account validation must pass before Google implementation begins.
4. Final release hardening follows three-provider proof.
