# Paranoid Keeper Onboarding

Project Marvin is the repository name, not a second product or setup choice.

## First Run

1. Open Paranoid Keeper.
2. Create the security account with an email and password. That email is retained as the account recovery identity.
3. The management console opens directly.
4. Choose Microsoft 365, Outlook, Google Calendar, or optional Apple Calendar.
5. Enter the calendar account email and select **Add calendar**.
6. Paranoid Keeper immediately starts browser authorization for Microsoft, Outlook, or Google. No prefix, scope, label, connection-plan, or manual link step is required.
7. Apple Calendar is the exception: Apple requires its app-specific password rather than browser OAuth.
8. When all calendars validate, Paranoid Keeper starts its always-on runtime automatically.

## Management Console

Use the same console to add or remove calendars. Every added calendar receives an automatic source prefix and private copies by default. Select **Share details** only on trusted target calendars, such as family calendars.

There is no setup assistant, deployment picker, solution picker, or legacy Keeper login page.

## Provider Operations

The deployment owns provider integration settings. A calendar owner only chooses its provider, enters its account email, and completes that provider's authorization prompt. Public repository files never store provider secrets, calendars, tenants, or subscription identifiers.
