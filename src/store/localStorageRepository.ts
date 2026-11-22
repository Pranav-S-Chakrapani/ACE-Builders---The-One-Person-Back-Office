import { DEFAULT_CURRENCY, SCHEMA_VERSION, type ClearDueData, type Settings } from '../domain/types';
import type {
  Client,
  Invoice,
  Payment,
  RecurringBill,
  Reminder,
} from '../domain/types';
import { newId, now } from '../domain/ids';
import { todayISO } from '../domain/invoiceStatus';
import { buildSeedData } from './seed';
import type { Repository, SingletonRepository } from './repository';

export const STORAGE_KEY = 'cleardue:v1';

/** Collection keys only (array-valued). The settings singleton is excluded. */
type CollectionKey = Exclude<keyof ClearDueData, 'schemaVersion' | 'settings'>;
type Item<K extends CollectionKey> = ClearDueData[K][number];

/** Shape as it may exist in storage: settings can be absent in older data. */
type StoredData = Omit<ClearDueData, 'settings'> & { settings?: Settings };

function defaultSettings(): Settings {
  return { startingBalance: 0, defaultCurrency: DEFAULT_CURRENCY };
}

export function emptyData(): ClearDueData {
  return {
    schemaVersion: SCHEMA_VERSION,
    clients: [],
    invoices: [],
    payments: [],
    recurringBills: [],
    reminders: [],
    settings: defaultSettings(),
  };
}

function defaultStorage(): Storage | undefined {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

function isValidData(value: unknown): value is StoredData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === SCHEMA_VERSION &&
    Array.isArray(v.clients) &&
    Array.isArray(v.invoices) &&
    Array.isArray(v.payments) &&
    Array.isArray(v.recurringBills) &&
    Array.isArray(v.reminders)
  );
}

/**
 * Fills in settings when missing (older data) and maps the removed stored
 * status 'overdue' to 'sent'. No other migration.
 */
function normaliseData(stored: StoredData): ClearDueData {
  const invoices = stored.invoices.map((inv) =>
    (inv.status as string) === 'overdue' ? { ...inv, status: 'sent' as const } : inv,
  );
  const settings: Settings =
    typeof stored.settings === 'object' && stored.settings !== null
      ? { ...defaultSettings(), ...stored.settings }
      : defaultSettings();
  return { ...stored, invoices, settings };
}

/**
 * Loads the persisted document. First run (nothing stored) persists and returns
 * the demo seed. Returns emptyData() when storage is unavailable, or when the
 * stored value is unparseable or has the wrong shape. Never throws. Does not
 * overwrite a corrupt raw value.
 */
export function loadData(storage: Storage | undefined = defaultStorage()): ClearDueData {
  if (!storage) return emptyData();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      // Persist the seed so ids and dates stay stable across reloads.
      const seed = buildSeedData(todayISO());
      saveData(seed, storage);
      return seed;
    }
    const parsed: unknown = JSON.parse(raw);
    return isValidData(parsed) ? normaliseData(parsed) : emptyData();
  } catch {
    return emptyData();
  }
}

/** Overwrites storage with the demo seed set. Used by the footer reset button. */
export function resetToSeed(storage: Storage | undefined = defaultStorage()): void {
  saveData(buildSeedData(todayISO()), storage);
}

/** Persists the document. Write failures (quota, unavailable storage) are swallowed. */
export function saveData(data: ClearDueData, storage: Storage | undefined = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota / availability errors.
  }
}

function collection<K extends CollectionKey>(
  key: K,
  storage?: Storage,
): Repository<Item<K>> {
  const readRows = (): Item<K>[] => loadData(storage)[key] as Item<K>[];

  const writeRows = (rows: Item<K>[]): void => {
    const next = { ...loadData(storage), [key]: rows } as ClearDueData;
    saveData(next, storage);
  };

  return {
    list: () => readRows(),

    getById: (id) => readRows().find((row) => row.id === id),

    create: (input) => {
      const ts = now();
      const row = { ...input, id: newId(), createdAt: ts, updatedAt: ts } as Item<K>;
      const rows = readRows();
      rows.push(row);
      writeRows(rows);
      return row;
    },

    update: (id, patch) => {
      const rows = readRows();
      const idx = rows.findIndex((row) => row.id === id);
      if (idx === -1) return undefined;
      const current = rows[idx];
      const updated = {
        ...current,
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: now(),
      } as Item<K>;
      rows[idx] = updated;
      writeRows(rows);
      return updated;
    },

    remove: (id) => {
      const rows = readRows();
      const next = rows.filter((row) => row.id !== id);
      if (next.length === rows.length) return false;
      writeRows(next);
      return true;
    },
  };
}

function settingsSingleton(storage?: Storage): SingletonRepository<Settings> {
  return {
    get: () => loadData(storage).settings,

    set: (patch) => {
      const data = loadData(storage);
      const next: Settings = { ...data.settings, ...patch };
      saveData({ ...data, settings: next }, storage);
      return next;
    },
  };
}

export function createLocalStorageRepositories(storage?: Storage): {
  clients: Repository<Client>;
  invoices: Repository<Invoice>;
  payments: Repository<Payment>;
  recurringBills: Repository<RecurringBill>;
  reminders: Repository<Reminder>;
  settings: SingletonRepository<Settings>;
} {
  return {
    clients: collection('clients', storage),
    invoices: collection('invoices', storage),
    payments: collection('payments', storage),
    recurringBills: collection('recurringBills', storage),
    reminders: collection('reminders', storage),
    settings: settingsSingleton(storage),
  };
}
