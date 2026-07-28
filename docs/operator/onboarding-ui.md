# Marvin Onboarding UI Architecture

## Goal

A fresh operator should be able to clone the repo, launch one setup experience, provide account and routing information once, and then receive solution-specific configuration for any of the three external solutions or the first-party Marvin Engine.

## Product intent

The UI is not just a form. It is an orchestration shell for:

- collecting calendar topology
- selecting provider types
- collecting privacy policy choices
- launching provider-specific authentication
- validating prerequisites
- generating solution-specific configuration
- guiding the user into a narrow pilot test window

## User flow

### Step 1. Workspace initialization

The operator launches Marvin setup.

Inputs:

- solution preference
- profile name
- timezone
- sync window length

Outputs:

- local profile scaffold
- local event fixture scaffold

### Step 2. Calendar inventory

The operator adds each calendar source or destination.

Required fields per calendar:

- label
- provider type
- account email
- optional flag

Provider values:

- Microsoft 365 / Outlook
- Google Calendar
- Apple / CalDAV

### Step 3. Route design

The operator chooses which calendars mirror into which targets.

Required route settings:

- source calendar
- target calendars
- privacy mode
- subject prefix or replacement policy

### Step 4. Provider authentication

This is where the UI behavior diverges by solution.

#### For Marvin Engine

The UI should:

- launch Microsoft OAuth for Graph
- launch Google OAuth if Google is included
- collect CalDAV host, username, app-specific password, and calendar URL for Apple
- store tokens or secrets in a local encrypted config store

#### For Paranoid Keeper

The UI should:

- collect the required OAuth client IDs and secrets
- render the `.env` file automatically
- open the Keeper service after startup
- drive the operator into the Keeper connection setup steps

#### For Bureaucratic Flow

The UI should:

- collect calendar pairing information
- generate flow settings JSON
- generate a Power Automate import checklist
- optionally open links to Power Automate and the upstream flow package

#### For Google Hub Of Last Resort

The UI should:

- collect Outlook and Google account bindings
- generate OGCS settings XML
- place the file into the chosen OGCS runtime folder
- prompt the operator to complete sign-in inside OGCS

### Step 5. Validation

The UI should verify:

- profile schema validity
- presence of required provider data
- route consistency
- solution prerequisites

### Step 6. Pilot preparation

The UI should instruct the operator to:

- start with a 1 to 3 day sync window
- use blocker-only mirroring first
- validate creates before testing updates and deletes

## Backend responsibilities

The backend needs to provide:

- profile read and write functions
- schema validation
- artifact generation per solution
- secret placeholder generation
- provider-specific auth handlers
- prerequisite checks
- test orchestration

## Suggested implementation shape

### Frontend

A small local web app is the cleanest fit.

Suggested views:

- welcome
- calendars
- routes
- auth
- solution selection
- validation
- test checklist

### Backend

Use a local Node service that:

- reads and writes profile files
- serves generated artifacts
- triggers scripts already present in this repo
- stores local encrypted secrets outside the repo

## Data boundaries

The shared profile remains the source of truth.

Generated outputs remain derivatives.

That means:

- the UI writes one profile
- generators render per-solution outputs
- solution runtimes consume those outputs

## Security expectations

The UI must not commit secrets into git.

Secrets should live in:

- environment files excluded by `.gitignore`
- local encrypted stores
- OS-protected secret managers where practical

## Current repo status

The repo already contains the non-UI backend pieces needed to support this direction:

- profile schema
- setup script
- solution generators
- validation scripts
- per-solution test flows

What is still missing is the actual GUI layer and live OAuth orchestration.
