import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Check,
  Loader2,
  Plus,
  Receipt,
  Sparkles,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import {
  annotateItemsAgainstOriginal,
  isReceiptNonProductLine,
  ReviewableReceiptItem,
} from '../lib/receiptParser';

interface ReceiptReviewModalProps {
  isOpen: boolean;
  mode: 'scan_review' | 'history_edit';
  initialStoreName: string;
  initialTotalCost: number;
  initialItems: ReviewableReceiptItem[];
  onClose: () => void;
  onRescanFile?: (file: File) => Promise<void>;
  isRescanning?: boolean;
  onLookupItemBarcode?: (barcode: string, rawName: string, storeName: string) => Promise<{
    resolvedName: string;
    source: string;
    sourceUrl?: string;
  } | null>;
  onSave: (payload: {
    storeName: string;
    totalCost: number;
    items: Array<{
      name: string;
      category: string;
      quantity: string;
      price: number;
      scanned?: boolean;
      barcode?: string;
    }>;
  }) => Promise<void>;
}

export function ReceiptReviewModal({
  isOpen,
  mode,
  initialStoreName,
  initialTotalCost,
  initialItems,
  onClose,
  onRescanFile,
  isRescanning = false,
  onLookupItemBarcode,
  onSave,
}: ReceiptReviewModalProps) {
  const [storeName, setStoreName] = useState(initialStoreName);
  const [totalInput, setTotalInput] = useState(String(initialTotalCost || 0));
  const [items, setItems] = useState<ReviewableReceiptItem[]>(initialItems);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [lookingUpId, setLookingUpId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStoreName(initialStoreName);
    setTotalInput(String(initialTotalCost || 0));
    setItems(initialItems);
    setNewItemName('');
    setNewItemPrice('');
  }, [isOpen, initialStoreName, initialTotalCost, initialItems]);

  const nonProductCount = useMemo(
    () => items.filter((it) => it.selected && isReceiptNonProductLine(it.name, it.price)).length,
    [items]
  );

  const selectedCount = useMemo(() => items.filter((it) => it.selected).length, [items]);
  const flaggedNewCount = useMemo(
    () => items.filter((it) => it.selected && !it.inOriginalList).length,
    [items]
  );

  if (!isOpen) return null;

  const handleToggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it))
    );
  };

  const handleUpdateField = (
    id: string,
    field: 'name' | 'price' | 'quantity',
    value: string
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (field === 'price') {
          const parsed = Number(value.replace(/[^\d]/g, ''));
          return { ...it, price: Number.isFinite(parsed) ? parsed : 0 };
        }
        return { ...it, [field]: value };
      })
    );
  };

  const handleRemoveNonProducts = () => {
    setItems((prev) =>
      prev.filter((it) => !isReceiptNonProductLine(it.name, it.price))
    );
  };

  const handleAddManualItem = () => {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    const parsedPrice = Number(newItemPrice.replace(/[^\d]/g, ''));
    const added = annotateItemsAgainstOriginal(
      [
        {
          name: trimmed,
          category: 'Otros',
          quantity: '1',
          price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : 0,
          scanned: false,
        },
      ],
      []
    )[0];

    setItems((prev) => [added, ...prev]);
    setNewItemName('');
    setNewItemPrice('');
  };

  const handleConfirmSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const cleanItems = items
        .filter((it) => it.selected && it.name.trim())
        .map((it) => ({
          name: it.name.trim(),
          category: it.category || 'Otros',
          quantity: it.quantity.trim() || '1',
          price: Math.max(0, Math.round(Number(it.price) || 0)),
          scanned: it.scanned,
          ...(it.barcode ? { barcode: it.barcode } : {}),
        }));

      const parsedTotal = Number(String(totalInput).replace(/[^\d]/g, ''));
      const sumFallback = cleanItems.reduce(
        (acc, it) => acc + it.price,
        0
      );
      const safeTotal =
        Number.isFinite(parsedTotal) && parsedTotal > 0 ? Math.round(parsedTotal) : Math.round(sumFallback);

      await onSave({
        storeName: storeName.trim().slice(0, 100) || 'Supermercado',
        totalCost: safeTotal,
        items: cleanItems,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleConfirmSave}
        className="bg-white border border-border w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-text-main truncate">
                {mode === 'scan_review' ? 'Revisa la boleta antes de guardar' : 'Editar compra y boleta'}
              </h3>
              <p className="text-xs text-text-secondary truncate">
                Desmarca errores, ajusta precios o quita descuentos antes de guardar
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-xl hover:bg-gray-100 flex items-center justify-center text-text-secondary cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Comercio + Total */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" /> Comercio
              </span>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                maxLength={100}
                className="w-full min-h-[44px] px-3.5 py-2 bg-gray-50 border border-border rounded-xl text-sm font-semibold text-text-main focus:outline-none focus:border-accent"
                placeholder="Supermercado"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-text-secondary">Total pagado (CLP)</span>
              <input
                type="text"
                inputMode="numeric"
                value={totalInput}
                onChange={(e) => setTotalInput(e.target.value.replace(/[^\d]/g, ''))}
                className="w-full min-h-[44px] px-3.5 py-2 bg-gray-50 border border-border rounded-xl text-sm font-bold text-text-main tabular-nums focus:outline-none focus:border-accent"
                placeholder="0"
              />
            </label>
          </div>

          {/* Banner de análisis en curso */}
          {isRescanning && (
            <div className="flex items-center gap-3 bg-accent/10 border border-accent/20 rounded-2xl px-4 py-3 text-xs font-semibold text-accent">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Leyendo la foto de la boleta y verificando códigos...</span>
            </div>
          )}

          {/* Barra de ayuda rápida si se detectaron descuentos o ítems nuevos */}
          {(nonProductCount > 0 || flaggedNewCount > 0 || onRescanFile) && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 border border-border rounded-2xl px-3.5 py-2.5 text-xs">
              <div className="text-text-secondary space-y-0.5">
                {nonProductCount > 0 && (
                  <p className="font-medium text-amber-700">
                    Detectamos {nonProductCount} {nonProductCount === 1 ? 'línea de descuento/total' : 'líneas de descuento/totales'}.
                  </p>
                )}
                {flaggedNewCount > 0 && (
                  <p>
                    {flaggedNewCount} {flaggedNewCount === 1 ? 'ítem no figuraba' : 'ítems no figuraban'} en tu lista original (revisa por si hubo mala lectura).
                  </p>
                )}
                {nonProductCount === 0 && flaggedNewCount === 0 && (
                  <p>Revisa los productos y precios extraídos.</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {nonProductCount > 0 && (
                  <button
                    type="button"
                    onClick={handleRemoveNonProducts}
                    disabled={isRescanning}
                    className="min-h-[36px] px-3 py-1.5 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-900 font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Quitar descuentos ({nonProductCount})</span>
                  </button>
                )}
                {onRescanFile && (
                  <label
                    className={`min-h-[36px] px-3 py-1.5 bg-white border border-border hover:border-accent text-text-main font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors ${
                      isRescanning || isSaving ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                    }`}
                  >
                    {isRescanning ? (
                      <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5 text-accent" />
                    )}
                    <span>{isRescanning ? 'Leyendo...' : 'Nueva foto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={isRescanning || isSaving}
                      onChange={async (e) => {
                        const selected = e.target.files?.[0];
                        e.currentTarget.value = '';
                        if (selected) {
                          await onRescanFile(selected);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Agregar producto faltante rápido */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddManualItem();
                }
              }}
              placeholder="Agregar producto que faltó..."
              className="flex-1 min-h-[42px] px-3.5 py-2 bg-white border border-border rounded-xl text-sm text-text-main placeholder:text-text-secondary/70 focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              inputMode="numeric"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddManualItem();
                }
              }}
              placeholder="$ Precio"
              className="w-24 min-h-[42px] px-3 py-2 bg-white border border-border rounded-xl text-sm text-text-main tabular-nums focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleAddManualItem}
              className="min-h-[42px] px-3.5 py-2 bg-gray-100 hover:bg-accent hover:text-white text-text-main text-xs font-semibold rounded-xl inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Sumar</span>
            </button>
          </div>

          {/* Lista editable de ítems */}
          <div className="border border-border rounded-2xl divide-y divide-gray-100 overflow-hidden">
            {items.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-secondary">
                No hay productos seleccionados todavía.
              </div>
            ) : (
              items.map((item) => {
                const isDiscount = isReceiptNonProductLine(item.name, item.price);
                return (
                  <div
                    key={item.id}
                    className={`p-3 flex items-center gap-2.5 transition-colors ${
                      !item.selected
                        ? 'bg-gray-50 opacity-50'
                        : isDiscount
                          ? 'bg-amber-50/70'
                          : 'bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleItem(item.id)}
                      aria-label={item.selected ? `Descartar ${item.name}` : `Incluir ${item.name}`}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                        item.selected
                          ? 'bg-accent border-accent text-white'
                          : 'bg-white border-border text-transparent'
                      }`}
                    >
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                    </button>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleUpdateField(item.id, 'name', e.target.value)}
                        className="w-full text-sm font-medium text-text-main bg-transparent outline-none focus:underline"
                      />
                      {(isDiscount || !item.inOriginalList || item.barcode || item.barcodeSource) && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                          {isDiscount && (
                            <span className="text-amber-700">Línea de descuento/boleta</span>
                          )}
                          {!isDiscount && !item.inOriginalList && (
                            <span className="text-amber-700">No estaba en la lista original</span>
                          )}
                          {item.barcodeSource && (
                            <span className="text-emerald-700">
                              Verificado ({item.barcodeSource}{item.barcode ? ` · ${item.barcode}` : ''})
                            </span>
                          )}
                          {item.barcode && !item.barcodeSource && (
                            <span className="text-text-secondary inline-flex items-center gap-1.5">
                              <span className="tabular-nums">Cód. {item.barcode}</span>
                              {onLookupItemBarcode && (
                                <button
                                  type="button"
                                  disabled={lookingUpId === item.id}
                                  onClick={async () => {
                                    setLookingUpId(item.id);
                                    try {
                                      const found = await onLookupItemBarcode(item.barcode!, item.name, storeName);
                                      if (found?.resolvedName) {
                                        setItems((prev) =>
                                          prev.map((curr) =>
                                            curr.id === item.id
                                              ? {
                                                  ...curr,
                                                  name: found.resolvedName,
                                                  ambiguous: false,
                                                  barcodeSource: found.source,
                                                  ...(found.sourceUrl ? { barcodeSourceUrl: found.sourceUrl } : {}),
                                                }
                                              : curr
                                          )
                                        );
                                      }
                                    } finally {
                                      setLookingUpId(null);
                                    }
                                  }}
                                  className="text-accent hover:underline font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  {lookingUpId === item.id ? 'Buscando...' : 'Buscar código'}
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <input
                      type="text"
                      value={item.quantity}
                      onChange={(e) => handleUpdateField(item.id, 'quantity', e.target.value)}
                      aria-label="Cantidad"
                      className="w-12 min-h-[34px] text-center text-xs font-semibold text-text-secondary bg-gray-50 border border-border rounded-lg tabular-nums outline-none focus:border-accent"
                    />

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-text-secondary">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.price ? String(item.price) : ''}
                        onChange={(e) => handleUpdateField(item.id, 'price', e.target.value)}
                        placeholder="0"
                        aria-label="Precio"
                        className="w-20 min-h-[34px] px-2 text-right text-xs font-bold text-text-main bg-gray-50 border border-border rounded-lg tabular-nums outline-none focus:border-accent"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleItem(item.id)}
                      aria-label={`Quitar ${item.name}`}
                      className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-red-600 rounded-lg cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-border flex items-center justify-between gap-3 shrink-0 bg-gray-50/70">
          <span className="text-xs font-medium text-text-secondary tabular-nums">
            {selectedCount} {selectedCount === 1 ? 'producto' : 'productos'} seleccionados
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-gray-200/70 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || selectedCount === 0}
              className="min-h-[42px] px-5 py-2 bg-accent hover:bg-accent-dark disabled:opacity-50 text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors"
            >
              {isSaving ? 'Guardando...' : 'Guardar boleta'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
