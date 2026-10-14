import Dexie, { type EntityTable, type Transaction } from "dexie";
import type { DealDay, Feedback, Item, Occasion, Outfit, Wear, Weights } from "@/engine/types";
import type { ThemeMode } from "@/lib/theme";

export interface ImageBlob {
  id: string;
  kind: "original" | "cutout" | "thumb";
  blob: Blob;
  w: number;
  h: number;
  mime: string;
}
// original: max 1600px long edge, JPEG q0.82 (only when keepOriginals)
// cutout: max 1024px, WebP with alpha q0.85 (PNG fallback)
// thumb: 320px WebP

export interface Settings {
  id: "me";
  themeMode: ThemeMode;
  units: "c" | "f";
  location?: { name: string; lat: number; lon: number; source: "geo" | "search" };
  morningHour: number; // local hour, default 7
  defaultOccasionByWeekday: Occasion[]; // index = Date.getDay(), 0 is Sunday
  aiConsent: boolean | null; // null = not asked yet
  keepOriginals: boolean;
  reducedMotion: "system" | "on";
  installId: string; // local only, seeds the daily deal (8.7)
  installToken?: string; // from /api/install, never exported
  badges: string[];
  onboardedAt?: string;
  scanGoal: 10 | 15;
  cardLayout: "flat" | "stacked"; // 10.1
  cutoutModel: "isnet_quint8" | "isnet_fp16"; // 6.1
  modelReady?: boolean; // cutout model downloaded once
  persistAsked?: boolean; // navigator.storage.persist() asked after the 3rd item
  tagPausedUntil?: string; // daily budget pause (7.4)
  neverWornBoostUntil?: string; // 10.5, x3 neverWornBoost for 7 days
  lastBackupAt?: string;
}

export interface TagJob {
  id: string;
  itemId: string;
  attempts: number;
  nextAt: string;
  lastError?: string;
  state: "waiting" | "running" | "done" | "dead";
}

export const DB_NAME = "masta-wastra";
export const SCHEMA_VERSION = 2;

export class MastaDB extends Dexie {
  items!: EntityTable<Item, "id">;
  images!: EntityTable<ImageBlob, "id">;
  outfits!: EntityTable<Outfit, "id">;
  dealDays!: EntityTable<DealDay, "localDate">;
  wears!: EntityTable<Wear, "id">;
  feedback!: EntityTable<Feedback, "id">;
  weights!: EntityTable<Weights, "id">;
  settings!: EntityTable<Settings, "id">;
  tagJobs!: EntityTable<TagJob, "id">;

  constructor(name = DB_NAME) {
    super(name);

    // v1: the store list from the build prompt (section 5), verbatim.
    this.version(1).stores(V1_STORES);

    // v2: IndexedDB cannot index booleans, so the `archived` index never matched anything.
    // Archived items are filtered in memory (a closet is hundreds of rows, not millions).
    // Also fills fields added after v1. Logged in docs/DECISIONS.md.
    this.version(2)
      .stores({
        items: "id, category, subtype, primaryHex, warmth, pattern, *vibes, *occasions, tagStatus, createdAt",
      })
      .upgrade(upgradeV1toV2);
  }
}

export const V1_STORES = {
  items: "id, category, subtype, primaryHex, warmth, pattern, *vibes, *occasions, tagStatus, archived, createdAt",
  images: "id, kind",
  outfits: "id, &signature, createdAt",
  dealDays: "localDate",
  wears: "id, localDate, outfitId, *itemIds",
  feedback: "id, outfitId, at, signal",
  weights: "id",
  settings: "id",
  tagJobs: "id, itemId, state, nextAt",
} as const;

// Shared with backup import, so an old export goes through the same steps.
export function migrateItemV1(item: Partial<Item> & { id: string }): Item {
  return { cutoutQuality: "auto", ...item } as Item;
}

export function migrateDealDayV1(day: Partial<DealDay> & { localDate: string }): DealDay {
  return { ...day, shownOutfitIds: day.shownOutfitIds ?? [...(day.outfitIds ?? [])] } as DealDay;
}

export function migrateSettingsV1(s: Partial<Settings>): Settings {
  return { ...defaultSettings(), ...s, id: "me" };
}

async function upgradeV1toV2(tx: Transaction) {
  await tx.table("items").toCollection().modify((item: Item) => {
    Object.assign(item, migrateItemV1(item));
  });
  await tx.table("dealDays").toCollection().modify((day: DealDay) => {
    Object.assign(day, migrateDealDayV1(day));
  });
  await tx.table("settings").toCollection().modify((s: Settings) => {
    Object.assign(s, migrateSettingsV1(s));
  });
}

export function defaultSettings(): Settings {
  return {
    id: "me",
    themeMode: "system",
    units: "c",
    morningHour: 7,
    // Sunday first, matching Date.getDay(): weekends casual, weekdays work (8.7).
    defaultOccasionByWeekday: ["casual", "work", "work", "work", "work", "work", "casual"],
    aiConsent: null,
    keepOriginals: true,
    reducedMotion: "system",
    installId: crypto.randomUUID(),
    badges: [],
    scanGoal: 10,
    cardLayout: "flat",
    cutoutModel: "isnet_quint8",
  };
}

let instance: MastaDB | undefined;

// One shared connection in the browser. Tests construct their own MastaDB(name).
export function getDb(): MastaDB {
  instance ??= new MastaDB();
  return instance;
}
