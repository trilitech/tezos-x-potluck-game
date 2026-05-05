import type { EventLogEntry } from "./potzluckLog";

const EVENT_LOG_STORAGE_KEY = "potzluck_event_log_v1";
const MAX_STORED_LOG_ENTRIES = 25;
const PAYOUT_WAIT_IDS_KEY = "potzluck_payout_wait_ids_v1";
const PAYOUT_DONE_IDS_KEY = "potzluck_payout_done_ids_v1";
const PAYOUT_POT_META_KEY = "potzluck_payout_pot_meta_v1";

export const RELAYER_PROGRESS_LOG_KEY_PREFIX = "potzluck_relayer_progress_v1_";
export const PASSIVE_CLAIM_WAIT_LOG_KEY_PREFIX = "potzluck_passive_claim_wait_v1_";

export type PayoutPotMeta = Record<string, { potRaw: string; potDisplay: string }>;

export function readStoredEventLog(): EventLogEntry[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(EVENT_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is EventLogEntry =>
          e != null &&
          typeof e === "object" &&
          typeof (e as EventLogEntry).id === "string" &&
          typeof (e as EventLogEntry).msg === "string" &&
          ((e as EventLogEntry).tone === "info" ||
            (e as EventLogEntry).tone === "success" ||
            (e as EventLogEntry).tone === "error"),
      )
      .map((e) => {
        const x = e as EventLogEntry & { relatedUrl?: unknown; relatedLabel?: unknown };
        return {
          ...e,
          ...(typeof x.relatedUrl === "string" ? { relatedUrl: x.relatedUrl } : {}),
          ...(typeof x.relatedLabel === "string" ? { relatedLabel: x.relatedLabel } : {}),
        };
      })
      .slice(-MAX_STORED_LOG_ENTRIES);
  } catch {
    return [];
  }
}

export function writeStoredEventLog(entries: EventLogEntry[]) {
  try {
    sessionStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_STORED_LOG_ENTRIES)));
  } catch {
    /* ignore */
  }
}

export function readStringIdSet(key: string): Set<string> {
  if (typeof sessionStorage === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function writeStringIdSet(key: string, ids: Set<string>) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function readPayoutPotMeta(): PayoutPotMeta {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(PAYOUT_POT_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as PayoutPotMeta) : {};
  } catch {
    return {};
  }
}

export function writePayoutPotMeta(meta: PayoutPotMeta) {
  try {
    sessionStorage.setItem(PAYOUT_POT_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function markPayoutSessionCompletedInStorage(sessionId: string) {
  const waitSet = readStringIdSet(PAYOUT_WAIT_IDS_KEY);
  waitSet.delete(sessionId);
  writeStringIdSet(PAYOUT_WAIT_IDS_KEY, waitSet);

  const doneSet = readStringIdSet(PAYOUT_DONE_IDS_KEY);
  doneSet.add(sessionId);
  writeStringIdSet(PAYOUT_DONE_IDS_KEY, doneSet);

  const meta = readPayoutPotMeta();
  if (sessionId in meta) {
    delete meta[sessionId];
    writePayoutPotMeta(meta);
  }

  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(`${RELAYER_PROGRESS_LOG_KEY_PREFIX}${sessionId}`);
    sessionStorage.removeItem(`${PASSIVE_CLAIM_WAIT_LOG_KEY_PREFIX}${sessionId}`);
  }
}

export function getPayoutStorageKeys() {
  return {
    payoutWaitIdsKey: PAYOUT_WAIT_IDS_KEY,
    payoutDoneIdsKey: PAYOUT_DONE_IDS_KEY,
  };
}
