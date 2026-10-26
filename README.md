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

`vercel.json` rewrites every path to `index.html`, so deep links such as `/reports` work after a refresh.

## Where the data lives

There is no backend and no login. All data is stored in `localStorage` in each person's own browser, under a single versioned key. That means:

- Data does not sync between devices or browsers.
- Clearing the browser's site data deletes everything.
- Use **Settings > Export backup (JSON)** regularly, and **Import backup** to restore it or move it to another browser.

Payment details entered in invoice mode are stored only in that browser and are written into the downloaded invoice file.

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
  pages/           Tracker, Reports, Report editor, Settings, Setup
```

## Possible next steps

- A shared cloud backend so data syncs across devices.
- Importing an existing overtime spreadsheet to seed past weeks and redeemed time.
