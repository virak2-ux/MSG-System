# MSG System

A Google Apps Script web application for managing a savings group.

## Features

- Member, meeting, savings, loan, repayment, and other-transaction workflows
- Approval and posting controls
- Dashboard indicators and operational reports
- Member statements, cashbook, journal, and portfolio-at-risk reporting
- Read-only historical cash-flow archive views
- Searchable, responsive web interface

## Project structure

- `appsscript.json` — Apps Script manifest
- `00_Code.gs` — web app entry point and spreadsheet menu
- `Index.html` — application markup
- `Stylesheet.html` — responsive visual design
- `JavaScript.html` — client-side application logic
- `01_Config.gs`–`30_Reports.gs` — configuration, data services, workflows, posting, and reports

## Deploying

1. Create or open a Google Sheet.
2. Open **Extensions → Apps Script**.
3. Add the files in this repository to the Apps Script project.
4. Confirm the manifest settings in `appsscript.json`.
5. Select **Deploy → New deployment → Web app**.
6. Choose the required execution identity and access policy.
7. Deploy and authorize the requested Google services.

The application is designed as a spreadsheet-bound Apps Script project and uses the active spreadsheet as its data store.

## Data and security

This repository contains application source only. Operational spreadsheet data, account credentials, spreadsheet identifiers, deployment identifiers, and secrets are not included. Review the web-app access policy before deploying to production.
