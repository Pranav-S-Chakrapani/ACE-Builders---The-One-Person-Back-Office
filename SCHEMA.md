# ClearDue data schema (v1)

## Overview

ClearDue stores all of its data in the browser's localStorage under a single key, `cleardue:v1`. The value is one JSON document of type `ClearDueData` (defined in `src/domain/types.ts`) with `schemaVersion: 1`.

The document holds five collections: `clients`, `invoices`, `payments`, `recurringBills`, and `reminders`. It also holds one singleton object, `settings`.

## Conventions

- **Ids** are strings produced by `newId()`.
- **Timestamps** (`createdAt`, `updatedAt`) are ISO 8601 datetime strings, e.g. `2025-03-01T09:30:00.000Z`.
- **Dates** (`issueDate`, `dueDate`, `receivedDate`, `nextDueDate`) are ISO 8601 calendar dates in the form `YYYY-MM-DD`.
- **Money** is an integer in minor units. For example, `12500` means 125.00 in a 2-decimal currency. Floats are never stored.
- **Currency** is an ISO 4217 code. For v1 the only allowed value is `INR` (type `Currency`, default `DEFAULT_CURRENCY`). No conversion logic exists.
- **Optional fields** are omitted when they have no value. They are never stored as `null`.

## Relationships

- **Client 1—N Invoice**: `invoice.clientId` references `client.id`.
- **Invoice 1—N Payment**: `payment.invoiceId` references `invoice.id`.
- **Client 1—N Payment**: `payment.clientId` is denormalised and must match the client of the payment's invoice.
- **Reminder → any target**: `reminder.targetType` plus `reminder.targetId` point at an invoice, a client, or a recurring bill. This is polymorphic and no foreign key is enforced.
- **RecurringBill** is standalone. These are Maya's own expenses, such as software subscriptions or rent, and have no client link.

## Client

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | From `newId()`. |
| createdAt | ISODateTime | yes | Set on create. |
| updatedAt | ISODateTime | yes | Set on every update. |
| name | string | yes | Contact or client name. |
| company | string | no | |
| email | string | no | |
| phone | string | no | |
| kind | `retainer` \| `project` | yes | Enum: `retainer`, `project`. |
| monthlyRetainerAmount | Minor | no | Minor units. Only meaningful when `kind` is `retainer`. |
| currency | Currency | yes | ISO 4217 code. v1: `INR` only. |
| paymentTermsDays | number | yes | Days from issue date to due date. |
| notes | string | no | |
| status | `active` \| `paused` \| `archived` | yes | Enum: `active`, `paused`, `archived`. |

## Invoice

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | From `newId()`. |
| createdAt | ISODateTime | yes | Set on create. |
| updatedAt | ISODateTime | yes | Set on every update. |
| clientId | string | yes | References `client.id`. |
| number | string | yes | Human-facing invoice number. |
| issueDate | ISODate | yes | `YYYY-MM-DD`. |
| dueDate | ISODate | yes | `YYYY-MM-DD`. |
| amount | Minor | yes | Total invoice amount in minor units. |
| currency | Currency | yes | ISO 4217 code. v1: `INR` only. |
| status | `draft` \| `sent` \| `partially_paid` \| `paid` \| `void` | yes | Enum: `draft`, `sent`, `partially_paid`, `paid`, `void`. Overdue is not stored; see Derived values. |
| lineItems | InvoiceLineItem[] | no | Embedded array, see below. |
| notes | string | no | |

## InvoiceLineItem

Embedded inside `invoice.lineItems`. It has no id of its own.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| description | string | yes | |
| amount | Minor | yes | Minor units. |

## Payment

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | From `newId()`. |
| createdAt | ISODateTime | yes | Set on create. |
| updatedAt | ISODateTime | yes | Set on every update. |
| invoiceId | string | yes | References `invoice.id`. |
| clientId | string | yes | Denormalised. Must match the invoice's `clientId`. |
| amount | Minor | yes | Minor units. |
| currency | Currency | yes | ISO 4217 code. v1: `INR` only. |
| receivedDate | ISODate | yes | `YYYY-MM-DD`. |
| method | string | no | Free text, for example bank transfer. |
| reference | string | no | Free text. |

## RecurringBill

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | From `newId()`. |
| createdAt | ISODateTime | yes | Set on create. |
| updatedAt | ISODateTime | yes | Set on every update. |
| name | string | yes | |
| amount | Minor | yes | Minor units. |
| currency | Currency | yes | ISO 4217 code. v1: `INR` only. |
| frequency | `weekly` \| `monthly` \| `quarterly` \| `yearly` | yes | Enum: `weekly`, `monthly`, `quarterly`, `yearly`. |
| nextDueDate | ISODate | yes | `YYYY-MM-DD`. |
| category | string | no | |
| active | boolean | yes | |
| notes | string | no | |

## Reminder

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | From `newId()`. |
| createdAt | ISODateTime | yes | Set on create. |
| updatedAt | ISODateTime | yes | Set on every update. |
| targetType | `invoice` \| `client` \| `recurring_bill` | yes | Enum: `invoice`, `client`, `recurring_bill`. |
| targetId | string | yes | Id of the record named by `targetType`. Not foreign-key checked. |
| dueAt | ISODateTime | yes | When the reminder should fire. |
| channel | `whatsapp` \| `email` \| `other` | yes | Enum: `whatsapp`, `email`, `other`. |
| message | string | no | |
| status | `pending` \| `done` \| `dismissed` | yes | Enum: `pending`, `done`, `dismissed`. |

**Reminder.dueAt is an ISO 8601 datetime and intentionally carries a time of day; Invoice.dueDate, RecurringBill.nextDueDate are calendar dates.** Reminders are acted on at a time of day (for example, a WhatsApp nudge at 10:30), so the field keeps the name `dueAt`.

## Settings

A singleton object, not a collection. It is stored as `settings` on `ClearDueData`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| startingBalance | Minor | yes | Minor units. May be negative. Defaults to `0`. |
| defaultCurrency | Currency | yes | v1: `INR` only. Defaults to `DEFAULT_CURRENCY`. |
| businessName | string | no | |

## Derived values

Computed at read time and never stored.

- **isOverdue** = `status` is `sent` or `partially_paid` AND `dueDate < today`.

## Storage adapter boundary

- `Repository<T>` is defined in `src/store/repository.ts`. It exposes `list`, `getById`, `create`, `update`, and `remove` for one collection.
- `SingletonRepository<T>` is defined in `src/store/repository.ts`. It exposes `get` and `set(patch)` for the `settings` singleton.
- `createStore()` in `src/store/index.ts` is the only factory the UI should use. It returns one repository per collection, plus `settings`.
- The current implementation is localStorage, in `src/store/localStorageRepository.ts`.
- A future database adapter must implement the same `createStore()` return shape.
- The current interface is synchronous. A database adapter will likely need async methods. That change is deferred to a future change and is not part of v1.

## Schema versioning

- `SCHEMA_VERSION = 1`, defined in `src/domain/types.ts`.
- `loadData` falls back to empty data when the stored `schemaVersion` does not match `SCHEMA_VERSION`. It also falls back when the value is missing, unparseable, or has the wrong shape. Stored data is not overwritten on load.
- Migrations are not implemented yet.
