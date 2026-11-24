export interface NormalizedReceiptItem {
  name: string;
  category: string;
  quantity: string;
  price: number;
  scanned: boolean;
  barcode?: string;
  ambiguous?: boolean;
  barcodeSource?: string;
  barcodeSourceUrl?: string;
}

export interface ReviewableReceiptItem extends NormalizedReceiptItem {
  id: string;
  selected: boolean;
  inOriginalList: boolean;
}

export interface BarcodeLookupResult {
  resolvedName: string;
  brand?: string;
  source: string;
  sourceUrl?: string;
}

export declare function isReceiptNonProductLine(name: string, price?: number): boolean;

export declare function sanitizeReceiptBarcode(raw: unknown): string | undefined;

export declare function isAmbiguousReceiptName(name: string): boolean;

export declare function normalizeReceiptItems(rawItems?: any[]): NormalizedReceiptItem[];

export declare function applyBarcodeLookups<T extends NormalizedReceiptItem>(
  items: T[],
  lookupResults: Record<string, BarcodeLookupResult>
): T[];

export declare function annotateItemsAgainstOriginal(
  receiptItems?: NormalizedReceiptItem[],
  originalItems?: any[]
): ReviewableReceiptItem[];
