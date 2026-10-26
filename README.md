# Hourbook

A simple hours tracker that exports polished Excel files. It supports two ways of working, which can be turned on per profile:

- **Invoice mode**: for independent contractors who bill by the hour. Generates a monthly invoice workbook (Invoice + Timesheet sheets) and a ready-to-copy email.
- **Overtime mode**: for tracking hours worked above a standard week, the overtime later redeemed as time off, and the remaining balance in hours and days. Generates an overtime tracker workbook laid out like the original spreadsheet (weekly table, TOTAL HOURS summary, redeemed log, monthly blocks).

The interface is in Spanish by default, with an English option in Settings.

## Features

- Large timer with Start / Pause / Resume / Stop. It stores timestamps, so it survives a refresh or a closed tab. Entries that cross midnight are split into one entry per day, and entries shorter than one minute are discarded with an undo option.
- Manual entries with a start/end time or just a duration, editing, deleting (with confirmation and undo) and an overlap warning.
- Summary cards for today, this week and this month, plus overtime and balance (overtime mode) or billable hours and amount accrued (invoice mode). A weekly view with a bar per day.
- Report drafts that are generated from entries and can be edited in the app before downloading. Edits only change the draft. Drafts are saved and can be reopened or regenerated (with a confirmation before overwriting edits).
- Excel files built with `exceljs`: real formulas for every total and derived value (with cached results so previews work), app palette, frozen headers, number formats such as `[h]:mm`, `[h]:mm:ss`, `0.00`, currency and `d-mmm`, and print setup.
- Several profiles on the same browser, JSON backup export and import, and a full delete.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open the URL that Vite prints (by default http://localhost:5173).

## Test

```bash
npm test
```

The calculation logic lives in `src/lib/calc.ts` as pure functions. Tests cover weekly overtime, h:mm and decimal conversion, balance and days, midnight splitting, week grouping, monthly totals and invoice totals. `src/lib/excel/excel.test.ts` builds both workbooks, reads them back and checks the formulas and cached values.

## Build

```bash
npm run build
```

The output goes to `dist/`.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, choose **Add New > Project** and import the GitHub repository.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Deploy.

`vercel.json` rewrites every path except `/api` to `index.html`, so deep links such as `/reports` work after a refresh.

## Accounts and where the data lives

Hourbook works in two modes:

- **With a database (recommended)**: when `DATABASE_URL` is set, the app asks you to sign in. Each person has an account (email and password, with an option to stay signed in on that device for 60 days). Data is saved to Neon Postgres and syncs across devices. A local copy is kept so the timer keeps working through short connection drops; changes are pushed when the connection comes back, and edits made on two devices at once are merged.
- **Without a database**: if no backend is configured, everything stays in the browser's `localStorage`, as before.

The first time you create an account in a browser that already has Hourbook data, that data is uploaded to the new account. You can also move data with **Settings > Export backup (JSON)** and **Import backup**.

### Setting up Neon

1. Create a Neon project and copy the pooled connection string (Dashboard > Connect).
2. Locally: copy `.env.example` to `.env.local` and paste it as `DATABASE_URL`. `npm run dev` then serves the API too.
3. On Vercel: Project > Settings > Environment Variables, add `DATABASE_URL` (and optionally `ALLOWED_EMAILS`) for Production and Preview, then redeploy.

The tables (`users`, `sessions`, `user_data`) are created automatically on the first request.

Set `ALLOWED_EMAILS` to a comma separated list so only those addresses can create accounts. There is no email-based password reset: to reset one, delete that row from `users` in the Neon SQL editor and sign up again (this also deletes that account's synced data, so export a backup first).

Security notes: passwords are hashed with scrypt, sessions are random tokens stored only as hashes in an HttpOnly, SameSite cookie, write requests must be JSON (blocks cross-site form posts), and an account locks for 15 minutes after 10 wrong passwords.

## Project structure

```
src/
  lib/
    calc.ts        pure calculation functions (tested)
    drafts.ts      builds report drafts from entries
    excel/         workbook builders for both reports
    storage.ts     versioned localStorage access and backup validation
    store.tsx      app state and actions
    i18n.ts        Spanish and English dictionary
    timer.ts       timer to entries, midnight aware
    tz.ts          time zone helpers based on Intl
  components/      shared UI, timer, forms and report editors
  pages/           Tracker, Reports, Report editor, Settings, Setup, Auth
api/               Vercel functions: auth (register, login, logout, me) and data sync
dev-api.ts         serves api/ inside the Vite dev server
```

## Possible next steps

- Password reset by email.
- Importing an existing overtime spreadsheet to seed past weeks and redeemed time.
