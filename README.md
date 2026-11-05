# Hourbook

A simple hours tracker that exports polished Excel files. It supports two ways of working, which can be turned on per profile:

- **Invoice mode**: for independent contractors who bill by the hour. Each profile configures its own invoice (business and client details, currency, rates, payment terms, numbering, layout) and exports it as Excel or PDF, with a ready-to-copy email.
- **Overtime mode**: for tracking hours worked above a standard week, the overtime later redeemed as time off, and the remaining balance in hours and days. Generates an overtime tracker workbook laid out like the original spreadsheet (weekly table, TOTAL HOURS summary, redeemed log, monthly blocks).

The interface is in Spanish by default, with an English option in Settings.

## Features

- Large timer with Start / Pause / Resume / Stop. It stores timestamps, so it survives a refresh or a closed tab. Entries that cross midnight are split into one entry per day, and entries shorter than one minute are discarded with an undo option.
- Manual entries with a start/end time or just a duration, editing, deleting (with confirmation and undo) and an overlap warning.
- Summary cards for today, this week and this month, plus overtime and balance (overtime mode) or billable hours and amount accrued (invoice mode). A weekly view with a bar per day.
- Optional entry fields per profile: **Requested by** (person or department), **Project**, and custom fields (text, list of options, number or checkbox). Every field can be turned on or off, so a simple profile keeps a simple form.
- Report drafts that are generated from entries and can be edited in the app before downloading. In an invoice, the timesheet edits the real entries; everything else only changes the draft. Drafts are saved and can be reopened or regenerated (with a confirmation before overwriting edits).
- Excel files built with `exceljs`: real formulas for every total and derived value (with cached results so previews work), app palette, frozen headers, number formats such as `[h]:mm`, `[h]:mm:ss`, `0.00`, currency and `d-mmm`, and print setup.
- Several profiles on the same browser, JSON backup export and import, and a full delete.

## Entry fields

Settings > **Entry fields** turns Category, Requested by and Project on or off, and manages custom fields. Requested by and Project are pickers with a saved list per profile: choose a saved value or pick "+ New..." and type one, and it is added to the list when the entry is saved. The fields appear in the timer, the manual entry form, the entry list and the invoice timesheet, and can be used in invoice descriptions, columns and grouping. Overtime mode works as before; the fields are optional there too.

## Invoices

### Settings > Invoice

Everything is optional and saved as you type:

- **Your business (From)**: name, address, email, phone, tax ID and a logo (PNG or JPG up to 300 KB, stored as a data URL).
- **Clients (Bill to)**: company, contact, address, billing email and CC. Save several and mark one as the default; pick another one when generating.
- **Currency and rates**: ISO code (USD by default) with an optional custom symbol, a default hourly rate and special rates by category, project or client (project wins, then category, then client).
- **Payment terms**: Due on receipt, Net 7, Net 14, Net 15, Net 30 or custom text with optional days. The due date is calculated from the issue date.
- **Numbering**: prefix, next number and digits (e.g. `INV-0001`), with a reset. The number only goes up when an invoice is actually exported, and the notice has an Undo button.
- **Payment instructions, notes and footer**. Do not store full card numbers here: the text goes on the invoice.
- **Taxes and discounts** added to every new invoice, as a percentage or a fixed amount. Discounts come off the subtotal first; taxes apply to the discounted amount.
- **File name template**, e.g. `{name}_Invoice_{yyyy}-{mm}` gives `Jesy_Nicole_Gonzalez_Jarquin_Invoice_2026-10.xlsx`. Tokens: `{name}`, `{number}`, `{client}`, `{yyyy}`, `{mm}`, `{dd}`, `{start}`, `{end}`. Accents and unsafe characters are removed.
- **Hour rounding**: none, nearest 0.25 h, nearest 0.1 h, or round up to 15 minutes. It is applied per entry and stated on the invoice.

### Layout templates

When editing an invoice, **Invoice layout** controls:

- **Grouping**: one line per entry, or by any mix of date, requester, project, category and custom fields (e.g. day + requester + project). Entries with different rates never share a line.
- **Line description** built from tokens, with a live preview: `{date}`, `{start}`, `{end}`, `{hours}`, `{category}`, `{requestedBy}`, `{project}`, `{description}` and custom fields by name. `{date} | {requestedBy} - {project} | {hours} hours` gives `10/29/26 | Naima - NYC Glamsquad event | 4.18 hours`. Empty values are dropped together with their separator.
- **Columns** and their order: description, date, hours, rate, amount, category, project, requester and custom fields.
- **Date format** (MM/DD/YY by default), independent of the interface language.
- **Service period**: the dates actually worked (default) or the full chosen period. The period itself is a whole month or any date range.
- **Sections** to show: From, Bill to, terms and due date, payment instructions, notes, and the timesheet sheet.
- **Other charges**: extra lines with quantity and unit price, such as reimbursable expenses.

Save the layout as a template ("Monthly - by day"), update it, make it the default or delete it. Every profile starts with "Por categoría" and "Mensual - por día".

### Hours accuracy

Hours are `hours + minutes/60 + seconds/3600` and are kept at full precision; they are rounded to 2 decimals only for display and export (7:00:28 to 11:11:19 is 4.18 h). Each amount is the hours as shown times the rate. If hours on a timesheet row are typed by hand and no longer match its start and end, the row is flagged with the calculated value and a "use calculated" button; the edit is not blocked.

### Exports

- **Excel** (`exceljs`): an Invoice sheet laid out by the template and an optional Timesheet sheet (Date, Start, End, Hours, Requested by, Project, Category, Description and custom fields). Amounts, totals, subtotal, discounts, taxes and the total are formulas with cached values; currency formats, frozen headers, print area and fit to page width are set.
- **PDF** (`pdf-lib`): the same layout and data at Letter size, with the timesheet on its own page.
- Both are built from one shared document model (`src/lib/invoice/document.ts`), and both load only when you download.
- The **email text** uses the invoice number, service period, total with currency and due date. The app never sends email.

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

The calculation logic lives in pure functions in `src/lib/calc.ts` and `src/lib/invoice/`. Tests cover weekly overtime, h:mm and decimal conversion, balance and days, midnight splitting, week grouping, monthly totals and invoice totals. `src/lib/excel/excel.test.ts` builds both workbooks, reads them back and checks the formulas and cached values.

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
    invoice/       invoice logic: hours, grouping, templates, terms, money, totals, file names, document model
    pdf/           PDF invoice export
    migrate.ts     upgrades stored data to the current schema (v2)
  components/      shared UI, timer, forms, settings and report editors
  pages/           Tracker, Reports, Report editor, Settings, Setup, Auth
api/               Vercel functions: auth (register, login, logout, me) and data sync
dev-api.ts         serves api/ inside the Vite dev server
```

## Possible next steps

- Password reset by email.
- Importing an existing overtime spreadsheet to seed past weeks and redeemed time.
