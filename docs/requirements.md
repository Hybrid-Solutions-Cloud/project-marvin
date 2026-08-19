# Product Requirements

Project Marvin must provide fully automated bidirectional calendar mirroring.

1. An event created or accepted in any connected calendar mirrors to every other connected calendar.
2. The copied event includes the subject, location, description, time range, and source timezone.
3. Copies are private by default.
4. Family or other trusted targets can be configured to show normal visibility and detail.
5. Each source calendar has a visible prefix on copies.
6. Provider-created mirrors cannot loop back as sources.
7. Setup links and validates Microsoft 365 and Outlook first, Apple / CalDAV second, and Google third.
8. The UI provides first-run setup and account/policy management.
9. Successful validation starts the background runtime automatically.
10. Installer and Azure Bicep deployment are scriptable and do not commit tenant, subscription, or secret data.

## Local evidence

`marvin:smoke-live` covers full-mesh routing, loop prevention, mappings, provider writes, prefixes, privacy, and timezone behavior. The onboarding, UI, subscription, and daemon wake smokes cover setup and automated runtime behavior. Real tenant testing remains required before a production claim.
