export type PantryZoneId = 'all' | 'fridge' | 'cupboard' | 'cleaning';
export type PantryStockStatus = 'depleted' | 'low' | 'ok' | 'unknown' | 'stale';
export type PantryCadenceSource = 'observed' | 'category' | 'none';

export interface PantryCatalogItem {
  key: string;
  name: string;
  category: string;
  zone: Exclude<PantryZoneId, 'all'>;
  zoneLabel: string;
  frequency: number;
  isFromHistory: boolean;
  isEssential: boolean;
  lastPurchasedAt: number | null;
  daysSinceLastPurchase: number | null;
  lastQuantity: number;
  habitualQuantity: number;
  avgIntervalDays: number | null;
  estimatedDurationDays: number | null;
  daysRemaining: number | null;
  stockPercent: number | null;
  stockStatus: PantryStockStatus;
  cadenceSource: PantryCadenceSource;
  variants: string[];
  preferredVariant: string;
  inListItem: { id: string; name: string; quantity: number } | null;
  needsRestock: boolean;
}

export interface PantryConsumptionHint {
  daysSinceLastPurchase: number;
  estimatedDurationDays: number | null;
  daysRemaining: number | null;
  stockStatus: PantryStockStatus;
  lastQuantity: number;
  habitualQuantity: number;
  cadenceSource: PantryCadenceSource;
}

export interface RestockSuggestionItem {
  key: string;
  name: string;
  reason: string;
  source: 'ai' | 'history';
  recommendedQty: number;
  inListItem: { id: string; name: string; quantity: number } | null;
}

export declare const PANTRY_ZONES: Array<{ id: PantryZoneId; label: string }>;
export declare const DEFAULT_PANTRY_STAPLES: Array<{ name: string; category: string }>;

export declare function resolvePantryFamily(
  rawName: string,
  explicitCategory?: string | null
): { familyName: string; familyKey: string; variantName: string; category: string };

export declare function getPantryZoneForCategory(category: string): Exclude<PantryZoneId, 'all'>;
export declare function getPantryZoneLabel(zoneId: PantryZoneId): string;
export declare function parseNumericQuantity(rawQty: string | number | undefined): number;
export declare function formatConsumptionSummary(item: PantryCatalogItem): string;

export declare function buildPantryCatalog(params?: {
  history?: any[];
  activities?: any[];
  activeItems?: any[];
  essentials?: Array<{ name: string; category: string }>;
  now?: number;
}): PantryCatalogItem[];

export declare function buildChecklistPantryAlerts(params?: {
  catalogItems?: PantryCatalogItem[];
  max?: number;
}): PantryCatalogItem[];

export declare function findPantryConsumptionHint(
  itemName: string,
  catalogItems?: PantryCatalogItem[]
): PantryConsumptionHint | null;

export declare function buildRestockSuggestions(params?: {
  catalogItems?: PantryCatalogItem[];
  aiSuggestions?: Array<{ name: string; reason?: string }>;
  activeItems?: any[];
  max?: number;
}): RestockSuggestionItem[];
