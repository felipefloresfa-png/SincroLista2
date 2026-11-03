export interface CanonicalItemResult {
  name: string;
  category?: string;
  priorityLevel?: 'low' | 'medium' | 'high' | string;
}

export declare const CANONICAL_ITEMS_MAP: Record<string, {
  canonical: string;
  category: string;
  priorityLevel: string;
}>;

export declare function normalizeItemKey(str: string): string;
export declare function getStemmedKey(str: string): string;
export declare function areItemsEquivalent(nameA: string, nameB: string): boolean;
export declare function getCanonicalItem(rawName: string): CanonicalItemResult;
export declare function deduplicateItemList<T = any>(items: T[]): T[];
