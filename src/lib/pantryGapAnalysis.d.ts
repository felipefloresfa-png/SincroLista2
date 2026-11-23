export type PantryStockStatus = 'ok' | 'low';

export interface DetectedPantryItem {
  id: string;
  name: string;
  category: string;
  stockStatus: PantryStockStatus;
  estimatedQuantity: string;
  notes: string;
}

export interface MissingPantryItem {
  id: string;
  name: string;
  quantity: string;
  category: string;
  reason: string;
  source: 'low_stock' | 'history' | 'essential' | 'manual';
  frequency: number;
  selected: boolean;
}

export interface PantryGapReport {
  detectedItems: DetectedPantryItem[];
  missingItems: MissingPantryItem[];
  skippedAlreadyInList: string[];
  hasHouseholdHistory: boolean;
}

export declare function arePantryItemsMatching(detectedName: string, targetName: string): boolean;
export declare function normalizeDetectedPantryItems(rawItems: any[]): DetectedPantryItem[];
export declare function buildPantryGapReport(params: {
  detectedItems?: any[];
  history?: any[];
  activities?: any[];
  activeItems?: any[];
  essentials?: any[];
  maxMissingItems?: number;
}): PantryGapReport;
