# Paranoid Keeper Onboarding

Project Marvin is the repository name, not a second product or setup choice.

## First Run

1. Open Paranoid Keeper.
2. Select **Continue with Microsoft** and sign in with the Microsoft Entra identity that will own the workspace.
3. On the first successful sign-in, Paranoid Keeper creates and binds the workspace to that immutable Entra identity. No local password account is created.
4. The management console opens directly.
5. Choose Microsoft 365, Outlook, Google Calendar, or optional Apple Calendar.
6. Enter the calendar account email and select **Add calendar**.
7. Paranoid Keeper immediately starts browser authorization for Microsoft, Outlook, or Google. No prefix, scope, label, connection-plan, or manual link step is required.
8. Apple Calendar is the exception: Apple requires its app-specific password rather than browser OAuth.
9. When all calendars validate, Paranoid Keeper starts its always-on runtime automatically.

## Management Console

Use the same console to add or remove calendars. Every added calendar receives an automatic source prefix and private copies by default. Select **Share details** only on trusted target calendars, such as family calendars.

There is no setup assistant, deployment picker, solution picker, local password account, or legacy Keeper login page.

## Provider Operations

The deployment owns provider integration settings. A calendar owner only chooses its provider, enters its account email, and completes that provider's authorization prompt. Public repository files never store provider secrets, calendars, tenants, or subscription identifiers.

Entra console access is separate from calendar authorization. The Azure deployment script creates the single-tenant console application registration and stores its credential in the Container App secret store. Each calendar connection then obtains its own provider consent.