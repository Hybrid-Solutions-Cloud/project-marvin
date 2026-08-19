# Getting Started

Project Marvin mirrors every connected calendar to every other connected calendar after authorization. Marvin Engine is its synchronization runtime.

## Start Locally

~~~powershell
npm run marvin:install
$env:MARVIN_DEV_AUTH_ENABLED='true'
npm run marvin:ui
~~~

Open http://127.0.0.1:4177.

## First Run

1. Locally, select **Local development sign-in**. On Azure, select **Continue with Microsoft** and use the Entra identity that will own the workspace.
2. The first hosted Entra identity binds the workspace; later hosted sign-ins must use that same identity. Development sign-in is loopback-only and hosted mode rejects it.
3. The management console opens. There is no setup assistant, password account, or solution picker.
4. Choose a calendar provider and enter the calendar account email.
5. Select **Add calendar**. Project Marvin saves progress and immediately starts authorization or validation.
6. Complete browser authorization for Microsoft or Google. For Apple, supply an app-specific password and complete CalDAV discovery.
7. When at least two calendars are Ready, review Sync Rules and start synchronization from the Dashboard. In hosted mode, the process starts when a saved profile exists, but provider work is limited to connected and validated calendars.

The management sign-in and calendar authorizations are separate. Entra controls access to the Project Marvin console; each calendar owner separately approves access to that calendar.

Prefixes and private-by-default copies are created automatically. You always see complete details as the calendar owner. Use **Show details** only when other viewers of a family or otherwise trusted destination calendar may also see mirrored event details.

Apple does not offer the same browser OAuth flow; it uses an Apple app-specific password. Project Marvin supplies the standard iCloud CalDAV service entry point automatically, so the user provides only the Apple Account email and app-specific password. Provider secrets and refresh tokens are encrypted at rest and are never returned by the portal API.

## Hosted Azure Path

~~~powershell
npm run marvin:azure:plan
npm run marvin:azure:deploy
# Bind DNS and TLS to the generated Container App hostname, then:
npm run marvin:azure:deploy -- -PublicBaseUrl https://<your-hostname>
~~~

The Azure deployment script creates or reuses a single-tenant Entra application registration, configures its callback URL, and stores credentials plus the data-protection key as Container App secrets. `PublicBaseUrl` keeps portal authentication, calendar OAuth, webhooks, and generated deployment output on your custom domain. Verify the Entra portal callback and Microsoft calendar callback after the final deployment.

If a Microsoft organization displays **Need admin approval**, stop the connection attempt and coordinate privately with that organization's administrator. Do not publish tenant-specific account, directory, application, or consent details in public documentation.

## Provider Notes

- Microsoft 365 and Outlook use Microsoft Graph OAuth, subscriptions, and webhook wake-ups.
- Google uses Google OAuth, event watches, and webhook wake-ups.
- Apple Calendar uses an Apple app-specific password and periodic polling.
