# Project Marvin Onboarding

Project Marvin is the repository name, not a second product or setup choice.

## First Run

1. Open Project Marvin.
2. Select **Continue with Microsoft** and sign in with the Microsoft Entra identity that will own the workspace.
3. On the first successful sign-in, Project Marvin creates and binds the workspace to that immutable Entra identity. No local password account is created.
4. The management console opens directly.
5. Add calendars in the supported rollout order: Microsoft 365 or Outlook first, Apple Calendar second, and Google Calendar third.
6. Enter the calendar account email and select **Add calendar**.
7. Project Marvin immediately starts browser authorization for Microsoft or Outlook. After the callback, verify the displayed Microsoft identity, choose writable calendars, and run the non-mutating capability check.
8. If the verified Microsoft email differs from the requested email, explicitly confirm it or reconnect with another account.
9. Apple Calendar is the next release gate and uses its app-specific password rather than browser OAuth. Google follows Apple.
10. When every calendar is Ready, start the always-on runtime from the Dashboard.

## Management Console

Use the same console to add or remove calendars. Every added calendar receives an automatic source prefix and private copies by default. The calendar owner always sees complete details. Select **Show details** only when other viewers of a trusted target calendar, such as a family calendar, may also see mirrored event details.

There is no setup assistant, deployment picker, solution picker, or local password account.

## Provider Operations

The deployment owns provider integration settings. A calendar owner only chooses its provider, enters its account email, and completes that provider's authorization prompt. Public repository files never store provider secrets, calendars, tenants, or subscription identifiers.

Entra console access is separate from calendar authorization. The Azure deployment script creates the single-tenant console application registration and stores its credential in the Container App secret store. Each calendar connection then obtains its own provider consent.
