---
layout: page
sidebar: false
aside: false
title: Project Marvin
description: Private, delegated multi-calendar synchronization across Microsoft 365, Outlook, Apple, and Google.
---

<div class="marvin-hero-logo">
  <img src="/logo-large.svg" alt="Project Marvin — the paranoid android of calendar sync">
</div>

<div class="marvin-home-intro">
  <p class="marvin-home-kicker">Private multi-calendar synchronization</p>
  <h1>One schedule across the calendars you already use.</h1>
  <p>Project Marvin connects authorized Microsoft 365, Outlook.com, Apple / CalDAV, and Google calendars. It mirrors availability automatically while preserving source ownership, privacy rules, and time zones.</p>
  <div class="marvin-home-actions">
    <a class="marvin-action" href="/project-marvin/getting-started.html">Getting started</a>
    <a class="marvin-action secondary" href="/project-marvin/platform-support.html">Platform status</a>
  </div>
</div>

<div class="marvin-feature-grid">
  <section>
    <h2>Private by default</h2>
    <p>Mirrored events default to private. Per-target policies control visibility, details, location, description, and source prefixes.</p>
  </section>
  <section>
    <h2>Delegated access</h2>
    <p>Each calendar owner authorizes their own account. Project Marvin requests delegated provider access rather than tenant-wide Microsoft Graph application permissions.</p>
  </section>
  <section>
    <h2>Provider-aware sync</h2>
    <p>Microsoft and Google support webhook-driven synchronization. Apple / CalDAV uses scheduled polling.</p>
  </section>
  <section>
    <h2>Loop and delete safety</h2>
    <p>Managed-event markers and durable mappings prevent loops. Provider deletion is disabled by default and source events remain owned by their original calendars.</p>
  </section>
</div>
