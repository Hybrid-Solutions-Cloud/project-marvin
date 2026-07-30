# Getting Started

Paranoid Keeper mirrors every connected calendar to every other connected calendar after authorization.

## Start Locally

~~~powershell
npm run marvin:install
npm run marvin:ui
~~~

Open http://127.0.0.1:4177.

## First Run

1. Create the security account. Its email is retained as the recovery identity for this deployment.
2. The management console opens. There is no setup assistant or solution picker.
3. Choose a calendar provider and enter the calendar account email.
4. Select **Add calendar**. Paranoid Keeper immediately starts Microsoft, Outlook, or Google authorization.
5. Repeat for the remaining calendars. When every calendar validates, the background runtime starts automatically.

Prefixes and private-by-default copies are created automatically. Use **Share details** only for a family or other trusted target calendar after it has been added.

Apple Calendar is optional. Apple does not offer the same browser OAuth flow; its one exception is an Apple app-specific password, which Paranoid Keeper uses to connect to Apple Calendar.

## Hosted Azure Path

~~~powershell
npm run marvin:azure:plan
npm run marvin:azure:deploy
~~~

Open the resulting HTTPS URL and complete the same first-run flow.

## Provider Notes

- Microsoft 365 and Outlook use Microsoft Graph OAuth, subscriptions, and webhook wake-ups.
- Google uses Google OAuth, event watches, and webhook wake-ups.
- Apple Calendar uses an Apple app-specific password and periodic polling.
