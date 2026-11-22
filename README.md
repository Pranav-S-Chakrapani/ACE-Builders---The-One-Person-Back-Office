# ClearDue

A cash-flow back office for solo freelancers, built for Problem Statement 1 (Small Business Operations).

Live demo: _(add deployed URL)_

## The problem and persona

A solo freelancer or micro-business owner with no accounting staff tracks invoices, late payments and upcoming expenses in chat and spreadsheets. From there it is hard to see who owes money, when cash will run short, or what to do first on a bad day.

Persona: **Maya**, a freelance brand and web designer with 7 active clients (3 monthly retainers, 4 project-based). Today she tracks everything on WhatsApp and a spreadsheet.

## Features (mapped to the brief)

### Invoice-to-cash flow
Create invoices with a quick-add form, filter them (Open, Overdue, Paid, Draft), open a detail page, and mark invoices sent or paid.
**Where:** Invoices tab (`#/invoices`)

### Dashboard
Three headline numbers (total outstanding, overdue amount, paid this month), a "Who owes you" list ranked by how overdue each client is (overdue amount and total outstanding shown separately), and a six-month collections bar chart.
**Where:** Dashboard tab (`#/dashboard`, the default)

### 30/90-day forecast
A daily projected cash balance from the starting balance. It uses outstanding invoices on their due dates, retainer clients' expected next invoices, and recurring bills. It shows balances at day 30, 60 and 89, has a 30/60/90 toggle, and flags a cash shortfall with its date.
**Where:** Forecast tab (`#/forecast`)

### What-if scenario
Pick a client and how many days they pay late (0–120). The chart overlays the adjusted projection, and one sentence states the impact, including the first day the balance goes negative.
**Where:** Forecast tab, What-if panel

### AI-drafted reminders
A prioritised Today queue: overdue invoices, invoices due within 3 days, and recurring bills that could cause a shortfall. "Draft reminder" writes a message in a tone chosen from how late the invoice is (gentle nudge under 7 days, firm follow-up 7–30 days, final notice over 30). Messages are editable and can be copied; "Mark as sent" records a reminder. By default drafts come from built-in templates with no model call. A live model is used only if a server-side endpoint is configured via `VITE_LLM_ENDPOINT`.
**Where:** Today tab (`#/today`)

## Tech stack

- **Framework:** React 18 with TypeScript (strict)
- **Build tool and dev server:** Vite 5
- **Storage:** the browser's localStorage, one key (`cleardue:v1`), behind a repository layer so a real database can replace it
- **Charts:** hand-written SVG and CSS bars (no chart library)
- **Browser verification:** a Playwright script (`scripts/verify.mjs`)
- No backend, no login, no external services by default

## How to run locally

```sh
npm install
npm run dev        # serves on http://localhost:5173
npm run build      # type-checks, then builds to dist/
npm run typecheck  # type-check only
npm run preview    # serves the built dist/
npm run verify     # browser check script; start npm run dev first
```

Data model reference: [SCHEMA.md](./SCHEMA.md).

## How this was built (Codebenders usage)

Written by the builder, in order:

- **Schema design and correction round.** I first drafted the data model (clients, invoices, payments, recurring bills, reminders), then corrected four things: added a settings singleton holding starting balance and currency; narrowed invoice status to draft, sent, partially paid, paid and void, with overdue derived at read time rather than stored; locked currency to INR; kept the reminder's due field as a datetime because reminders act at a time of day.
- **Invoice flow.** I built the list, quick-add form, detail page and mark-as-paid. The first type check failed on four possibly-undefined errors in the detail page; I fixed them with a not-found guard.
- **Dashboard and a reconciliation bug.** Each client row labelled the whole outstanding total with the overdue badge of the most overdue invoice. Vikram Sethi showed ₹1,05,000 "overdue 25 days" when only ₹30,000 was overdue. I separated overdue amount (drives the red badge and the sort) from total outstanding (secondary). Overdue amounts now sum to the Overdue card, ₹1,07,000.
- **Overdue filter.** The Overdue filter appeared to omit CD-0012 (partially paid, 25 days late). A logic run did not reproduce it; the filter already included it. I then made Open and Overdue mutually exclusive, and the overdue label now shows the amount already paid.
- **Forecast engine and seed tuning.** The first seed had too much headroom to ever show a shortfall. I added one annual software renewal of ₹3,25,000 due on day 60. The baseline now bottoms out at ₹84,400 on 23 Jan 2027: no shortfall by default, but little headroom.
- **What-if simulator and the slider cap.** The slider stopped at 60 days, so the "0 days earlier" wording looked wrong. The day calculation was correct (the low point stayed on the same date); the real bug was the 60-day cap. I raised it to 120. The first shortfall for Vikram Sethi is at 86 days late. I also made the status line and the impact sentence report the same first-negative-day fact.
- **Today tab and AI reminders.** The first build had type errors (`invoiceNumber` vs `number`, an untyped `import.meta.env`, an optional value); I fixed them. The reported empty-draft bug could not be reproduced on any card, on first open or after reload, and I found no root cause. I added defensive fixes anyway: fallback to the local template on error, ignoring late results, disabling "Mark as sent" while drafting or when the text is empty, and a manual-copy message when clipboard access fails. The error branches were not exercised live.
- **Polish and verification pass.** I fixed touch targets below 640px (buttons and chips are now 44px tall) and added the dashboard tagline and an overdue empty state. In a browser at 360px and 1280px: no horizontal overflow, and the empty state and tagline appear. The empty state was verified by editing stored data, not by clicking Mark as paid.
- **Not finished.** The end-to-end demo chain (create invoice, overdue reminder, mark paid, dashboard and forecast update) was started but not fully verified. A check script set a new invoice's due date before its issue date, which the form rejects.

## Known limitations

- Single currency: INR only for v1; no conversion.
- No deployed live link yet.
- No unit tests. The only automated check is the browser verification script, which covers console errors, overflow, filter lists, one partially paid invoice, one void invoice and reset.
- The AI draft path uses built-in templates by default. The live-model endpoint, the loading indicator ("Drafting…") and the error fallback exist in code but were not exercised live.
- One console 404 appears on page load; its URL has not been identified.
- Reset demo data reloads the page.
- The end-to-end demo chain was not fully verified.
- Browser data is local to each browser; there is no sync or multi-user support.

## Responsible AI and data notes

All data in this project is synthetic seed data created for the demo. Client names, companies, invoice numbers and amounts are invented; no real client information was used. The AI feature is optional and sends nothing to any model by default. If a live model endpoint is configured, the reminder inputs (client name, invoice number, balance, days late, business name) are sent to that endpoint, and the API key must live server-side, never in frontend code.

Built with Codebenders.
