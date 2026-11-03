export interface QuickSuggestion {
  name: string;
  habitualQuantity: string;
  category?: string;
  frequency: number;
  lastPurchasedAt?: number;
  isFromHistory: boolean;
  alreadyInList: boolean;
  icon?: string;
  score?: number;
}

export interface EssentialItem {
  name: string;
  icon?: string;
  category?: string;
}

export declare const DEFAULT_ESSENTIALS: EssentialItem[];

export declare function normalizeText(str: string): string;
export declare function formatItemName(str: string): string;
export declare function extractTimestamp(ts: any): number;
export declare function getHabitualQuantity(quantitiesRecord: Record<string, number>): string;

export declare function buildSuggestionsIndex(options?: {
  history?: any[];
  activities?: any[];
  essentials?: EssentialItem[];
}): Map<string, any>;

export declare function getQuickSuggestions(options?: {
  query?: string;
  index: Map<string, any>;
  activeItems?: Array<{ name: string; checked?: boolean }>;
  limit?: number;
  now?: number;
}): QuickSuggestion[];
