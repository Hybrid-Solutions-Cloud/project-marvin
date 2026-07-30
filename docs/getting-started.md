# Getting Started

Paranoid Keeper mirrors every connected calendar to every other connected calendar after authorization.

## Start Locally

~~~powershell
npm run marvin:install
npm run marvin:ui
~~~

Open http://127.0.0.1:4177.

## First Run

1. Select **Continue with Microsoft**.
2. Sign in with the Microsoft Entra identity that will own this Paranoid Keeper workspace. The first verified identity binds the workspace; later sign-ins must use that same identity.
3. The management console opens. There is no setup assistant, password account, or solution picker.
4. Choose a calendar provider and enter the calendar account email.
5. Select **Add calendar**. Paranoid Keeper immediately starts Microsoft, Outlook, or Google authorization.
6. Repeat for the remaining calendars. When every calendar validates, the background runtime starts automatically.

The management sign-in and calendar authorizations are separate. Entra controls access to the Paranoid Keeper console; each calendar owner separately approves access to that calendar.

Prefixes and private-by-default copies are created automatically. Use **Share details** only for a family or other trusted target calendar after it has been added.

Apple Calendar is optional. Apple does not offer the same browser OAuth flow; its one exception is an Apple app-specific password, which Paranoid Keeper uses to connect to Apple Calendar.

## Hosted Azure Path

~~~powershell
npm run marvin:azure:plan
npm run marvin:azure:deploy
~~~

The Azure deployment script creates or reuses a single-tenant Entra application registration, configures its callback URL, and stores its credential as a Container App secret. Open the resulting HTTPS URL and select **Continue with Microsoft**.

## Provider Notes

- Microsoft 365 and Outlook use Microsoft Graph OAuth, subscriptions, and webhook wake-ups.
- Google uses Google OAuth, event watches, and webhook wake-ups.
- Apple Calendar uses an Apple app-specific password and periodic polling.