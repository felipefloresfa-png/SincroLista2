import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  Check,
  CheckCircle2,
  AlertCircle,
  Trash2,
  X,
  ShoppingBasket,
  ShoppingCart,
  Loader2,
  Plus,
  Minus,
  ImagePlus,
  PackageCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  compressImageFile,
  analyzePantryImagesWithAI,
} from '../lib/gemini';
import {
  buildPantryGapReport,
  DetectedPantryItem,
  MissingPantryItem,
} from '../lib/pantryGapAnalysis';
import { buildSuggestionsIndex, DEFAULT_ESSENTIALS } from '../lib/quickSuggestions';
import { getCanonicalItem, areItemsEquivalent } from '../lib/itemNormalizer';

interface PantryPhoto {
  id: string;
  base64: string;
  mimeType: string;
}

interface PantryScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: any[];
  activities: any[];
  activeItems: Array<{ id: string; name: string; checked: boolean }>;
  lists: Array<{ id: string; name: string }>;
  activeListId: string | null;
  onAddMissingItems: (
    items: Array<{ name: string; quantity: string; category?: string }>,
    targetListId: string
  ) => Promise<void>;
}

const MAX_PHOTOS = 5;

export function PantryScannerModal({
  isOpen,
  onClose,
  history,
  activities,
  activeItems,
  lists,
  activeListId,
  onAddMissingItems,
}: PantryScannerModalProps) {
  const [step, setStep] = useState<'upload' | 'scanning' | 'review'>('upload');
  const [photos, setPhotos] = useState<PantryPhoto[]>([]);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [detectedItems, setDetectedItems] = useState<DetectedPantryItem[]>([]);
  const [missingItems, setMissingItems] = useState<MissingPantryItem[]>([]);
  const [skippedAlreadyInList, setSkippedAlreadyInList] = useState<string[]>([]);
  const [targetListId, setTargetListId] = useState<string>(activeListId || '');
  const [manualMissingInput, setManualMissingInput] = useState('');
  const [showDetectedSection, setShowDetectedSection] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && activeListId) {
      setTargetListId(activeListId);
    }
  }, [isOpen, activeListId]);

  const knownStaples = useMemo(() => {
    const index = buildSuggestionsIndex({
      history,
      activities,
      essentials: DEFAULT_ESSENTIALS,
    });
    return Array.from(index.values())
      .sort((a, b) => (b.isFromHistory ? 1 : 0) - (a.isFromHistory ? 1 : 0) || b.frequency - a.frequency)
      .slice(0, 60)
      .map((e) => e.displayName);
  }, [history, activities]);

  if (!isOpen) return null;

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    setErrorMsg(null);
    const remainingSlots = MAX_PHOTOS - photos.length;
    if (remainingSlots <= 0) {
      setErrorMsg(`Puedes analizar hasta ${MAX_PHOTOS} fotos por escaneo.`);
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setErrorMsg(`Se agregaron ${remainingSlots} foto(s) (máximo ${MAX_PHOTOS} por escaneo).`);
    }

    try {
      const compressed = await Promise.all(
        filesToProcess.map(async (file, idx) => {
          const { base64, mimeType } = await compressImageFile(file, 1024, 0.72);
          return {
            id: `pantry-photo-${Date.now()}-${idx}`,
            base64,
            mimeType,
          };
        })
      );
      setPhotos((prev) => [...prev, ...compressed]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo cargar una o más imágenes.');
    }
  };

  const removePhoto = (photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const handleStartAnalysis = async () => {
    if (photos.length === 0) return;
    setErrorMsg(null);
    setStep('scanning');

    try {
      const visionResult = await analyzePantryImagesWithAI(
        photos.map((p) => ({ base64: p.base64, mimeType: p.mimeType })),
        knownStaples
      );

      if (!visionResult.detectedItems || visionResult.detectedItems.length === 0) {
        setErrorMsg('No se distinguieron productos claros en las fotos. Prueba con mejor luz o un encuadre más cercano.');
        setStep('upload');
        return;
      }

      const report = buildPantryGapReport({
        detectedItems: visionResult.detectedItems,
        history,
        activities,
        activeItems,
      });

      setAiSummary(visionResult.summary);
      setDetectedItems(report.detectedItems);
      setMissingItems(report.missingItems);
      setSkippedAlreadyInList(report.skippedAlreadyInList);
      setStep('review');
    } catch (err: any) {
      console.error('Error analizando despensa:', err);
      setErrorMsg(err?.message || 'No pudimos analizar la despensa en este momento.');
      setStep('upload');
    }
  };

  const toggleMissingSelected = (id: string) => {
    setMissingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const updateMissingName = (id: string, name: string) => {
    setMissingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name } : item))
    );
  };

  const adjustMissingQty = (id: string, delta: number) => {
    setMissingItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const current = parseInt(item.quantity, 10) || 1;
        const next = Math.max(1, current + delta);
        return { ...item, quantity: String(next), selected: true };
      })
    );
  };

  const removeMissingItem = (id: string) => {
    setMissingItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addDetectedToMissing = (detected: DetectedPantryItem) => {
    const alreadyExists = missingItems.some((m) => areItemsEquivalent(m.name, detected.name));
    if (alreadyExists) {
      setMissingItems((prev) =>
        prev.map((m) => (areItemsEquivalent(m.name, detected.name) ? { ...m, selected: true } : m))
      );
      return;
    }

    setMissingItems((prev) => [
      {
        id: `missing-from-detected-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: detected.name,
        quantity: '1',
        category: detected.category || 'Despensa',
        reason: detected.stockStatus === 'low' ? 'Queda poco en la foto' : 'Marcado para reponer',
        source: detected.stockStatus === 'low' ? 'low_stock' : 'manual',
        frequency: 0,
        selected: true,
      },
      ...prev,
    ]);
  };

  const handleAddManualMissing = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = manualMissingInput.trim();
    if (!raw) return;

    const canonical = getCanonicalItem(raw);
    const displayName = canonical.name || raw.charAt(0).toUpperCase() + raw.slice(1);

    const exists = missingItems.find((m) => areItemsEquivalent(m.name, displayName));
    if (exists) {
      setMissingItems((prev) =>
        prev.map((m) => (m.id === exists.id ? { ...m, selected: true } : m))
      );
      setManualMissingInput('');
      return;
    }

    setMissingItems((prev) => [
      {
        id: `missing-manual-${Date.now()}`,
        name: displayName,
        quantity: '1',
        category: canonical.category || 'Despensa',
        reason: 'Agregado por ti',
        source: 'manual',
        frequency: 0,
        selected: true,
      },
      ...prev,
    ]);
    setManualMissingInput('');
  };

  const removeDetectedItem = (id: string) => {
    setDetectedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const selectedMissing = missingItems.filter((i) => i.selected && i.name.trim());
  const allMissingSelected = missingItems.length > 0 && selectedMissing.length === missingItems.length;

  const handleToggleAllMissing = () => {
    const nextVal = !allMissingSelected;
    setMissingItems((prev) => prev.map((item) => ({ ...item, selected: nextVal })));
  };

  const handleApply = async () => {
    if (selectedMissing.length === 0) return;
    const listToUse = targetListId || activeListId || lists[0]?.id || '';
    if (!listToUse) {
      setErrorMsg('No hay una lista activa disponible.');
      return;
    }

    setIsApplying(true);
    setErrorMsg(null);
    try {
      await onAddMissingItems(
        selectedMissing.map((i) => ({
          name: i.name.trim(),
          quantity: i.quantity || '1',
          category: i.category,
        })),
        listToUse
      );
      handleReset();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al agregar los productos a tu lista.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setPhotos([]);
    setAiSummary('');
    setDetectedItems([]);
    setMissingItems([]);
    setSkippedAlreadyInList([]);
    setManualMissingInput('');
    setErrorMsg(null);
    setIsApplying(false);
  };

  const handleCloseModal = () => {
    if (!isApplying && step !== 'scanning') {
      handleReset();
      onClose();
    }
  };

  const lowStockCount = detectedItems.filter((d) => d.stockStatus === 'low').length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white border border-border w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Encabezado */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-alt/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 text-accent flex items-center justify-center font-bold shadow-sm">
              <ShoppingBasket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-text-main">Escanear Despensa</h3>
                <span className="text-[10px] bg-accent/10 text-accent font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> IA Visión
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                Detecta lo que tienes y genera la lista de lo que falta
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            disabled={isApplying || step === 'scanning'}
            className="w-8 h-8 rounded-full hover:bg-black/5 grid place-items-center text-text-secondary transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error banner */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-100 rounded-lg">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Cuerpo */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {step === 'upload' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFilesSelected}
              />

              {photos.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-3xl p-6 sm:p-10 flex flex-col items-center justify-center text-center gap-4 bg-surface-alt/30 hover:border-accent/40 transition-colors">
                  <div className="w-16 h-16 rounded-3xl bg-accent/10 text-accent flex items-center justify-center shadow-inner">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-black text-text-main">
                      Sube una o más fotos de tu despensa o refrigerador
                    </h4>
                    <p className="text-xs text-text-secondary max-w-sm mt-1">
                      Listaremos lo que ya tienes y lo cruzaremos con tus compras habituales para sugerir lo que falta.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-xs mt-2">
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-accent text-white rounded-2xl font-bold text-xs shadow-md shadow-accent/20 active:scale-95 transition-transform"
                    >
                      <Camera className="w-4 h-4" /> Tomar Foto
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-white border border-border text-text-main rounded-2xl font-bold text-xs hover:bg-gray-50 active:scale-95 transition-transform"
                    >
                      <Upload className="w-4 h-4" /> De la Galería
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-text-secondary">
                      Fotos seleccionadas ({photos.length}/{MAX_PHOTOS})
                    </span>
                    <button
                      onClick={() => setPhotos([])}
                      className="text-[11px] font-bold text-red-500 hover:underline"
                    >
                      Limpiar todas
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="relative aspect-square rounded-2xl overflow-hidden border border-border bg-gray-50 group shadow-xs"
                      >
                        <img
                          src={photo.base64}
                          alt={`Despensa ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => removePhoto(photo.id)}
                          className="absolute top-2 right-2 w-7 h-7 bg-black/70 hover:bg-black text-white rounded-xl flex items-center justify-center shadow-md transition-transform active:scale-90"
                          title="Quitar foto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] font-bold rounded-lg">
                          Foto {index + 1}
                        </span>
                      </div>
                    ))}

                    {photos.length < MAX_PHOTOS && (
                      <div className="aspect-square rounded-2xl border-2 border-dashed border-border bg-gray-50/70 flex flex-col items-center justify-center gap-2 p-2">
                        <button
                          onClick={() => cameraInputRef.current?.click()}
                          className="w-full flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white border border-border text-[11px] font-bold text-text-main hover:border-accent hover:text-accent transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5" /> Cámara
                        </button>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white border border-border text-[11px] font-bold text-text-main hover:border-accent hover:text-accent transition-colors"
                        >
                          <ImagePlus className="w-3.5 h-3.5" /> Galería
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleStartAnalysis}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-accent hover:bg-accent-dark text-white rounded-2xl font-black text-sm shadow-lg shadow-accent/25 active:scale-98 transition-all"
                  >
                    <Sparkles className="w-4 h-4" /> Analizar Despensa y Ver Faltantes
                  </button>
                </div>
              )}

              <div className="p-4 bg-surface-alt/60 rounded-2xl border border-border/50 text-[11px] text-text-secondary space-y-1">
                <span className="font-bold text-text-main block">Tips para un mejor inventario:</span>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>Puedes subir hasta {MAX_PHOTOS} fotos en un escaneo (ej. estante seco, refrigerador y puerta).</li>
                  <li>Si un envase se ve casi vacío, lo marcaremos automáticamente para reponer.</li>
                  <li>Siempre podrás revisar y desmarcar antes de agregar a tu lista.</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-5">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center text-accent animate-pulse">
                  <ShoppingBasket className="w-10 h-10" />
                </div>
                <div className="absolute inset-0 rounded-full border-4 border-accent border-t-transparent animate-spin" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-base font-black text-text-main">
                  Revisando {photos.length} foto{photos.length > 1 ? 's' : ''} de tu despensa...
                </h4>
                <p className="text-xs text-text-secondary max-w-xs mx-auto leading-relaxed">
                  Identificando lo que tienes disponible, detectando envases por acabarse y cruzando con tus compras habituales.
                </p>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-5">
              {/* Tarjeta resumen */}
              <div className="p-4 bg-gradient-to-br from-accent/10 via-surface-alt to-white border border-accent/20 rounded-3xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-text-main">{aiSummary}</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                      {detectedItems.length} en despensa
                    </span>
                    {lowStockCount > 0 && (
                      <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">
                        {lowStockCount} queda poco
                      </span>
                    )}
                    <span className="text-[10px] font-black bg-accent text-white px-2.5 py-0.5 rounded-full">
                      {selectedMissing.length} por comprar
                    </span>
                  </div>
                </div>

                {skippedAlreadyInList.length > 0 && (
                  <p className="text-[11px] text-emerald-800 bg-white/80 border border-emerald-200/70 rounded-xl px-3 py-1.5">
                    Ya anotados en tu lista actual (omitidos):{' '}
                    <strong>{skippedAlreadyInList.slice(0, 5).join(', ')}</strong>
                    {skippedAlreadyInList.length > 5 ? ` y ${skippedAlreadyInList.length - 5} más` : ''}.
                  </p>
                )}

                {lists.length > 1 && (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-[11px] font-bold text-text-secondary">
                      Agregar faltantes a la lista:
                    </span>
                    <select
                      value={targetListId}
                      onChange={(e) => setTargetListId(e.target.value)}
                      className="text-xs font-bold text-text-main bg-white border border-border rounded-xl px-3 py-1.5 outline-none focus:border-accent"
                    >
                      {lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Sección 1: Lo que falta comprar */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-accent" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-text-main">
                      Te falta comprar ({selectedMissing.length}/{missingItems.length})
                    </h4>
                  </div>
                  {missingItems.length > 0 && (
                    <button
                      onClick={handleToggleAllMissing}
                      className="text-[11px] font-bold text-accent hover:underline"
                    >
                      {allMissingSelected ? 'Desmarcar todos' : 'Seleccionar todos'}
                    </button>
                  )}
                </div>

                {/* Agregar producto extra manual si el usuario notó algo más */}
                <form onSubmit={handleAddManualMissing} className="flex gap-2">
                  <input
                    type="text"
                    value={manualMissingInput}
                    onChange={(e) => setManualMissingInput(e.target.value)}
                    placeholder="¿Notaste algo más que falta? Escríbelo aquí..."
                    className="flex-1 bg-gray-50 border border-border rounded-xl px-3 py-2 text-xs text-text-main outline-none focus:border-accent focus:bg-white transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!manualMissingInput.trim()}
                    className="px-3 py-2 bg-accent/10 text-accent hover:bg-accent hover:text-white disabled:opacity-40 rounded-xl text-xs font-black transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Sumar
                  </button>
                </form>

                {missingItems.length === 0 ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 text-center font-medium">
                    ¡Parece que tienes todos tus habituales cubiertos! Puedes marcar alguno de abajo si necesitas reponerlo.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 border border-border rounded-2xl bg-white overflow-hidden max-h-[260px] overflow-y-auto">
                    {missingItems.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3 flex items-center gap-2.5 transition-colors ${
                          item.selected ? 'bg-white hover:bg-gray-50/70' : 'bg-gray-50/60 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => toggleMissingSelected(item.id)}
                          className="w-4 h-4 rounded text-accent focus:ring-accent border-border cursor-pointer shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateMissingName(item.id, e.target.value)}
                            className="text-xs font-bold text-text-main bg-transparent outline-none truncate w-full"
                          />
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                item.source === 'low_stock'
                                  ? 'bg-amber-100 text-amber-800'
                                  : item.source === 'history'
                                  ? 'bg-blue-50 text-blue-700'
                                  : item.source === 'manual'
                                  ? 'bg-purple-50 text-purple-700'
                                  : 'bg-gray-100 text-text-secondary'
                              }`}
                            >
                              {item.reason}
                            </span>
                          </div>
                        </div>

                        {/* Control rápido de cantidad */}
                        <div className="flex items-center gap-1 bg-gray-50 border border-border rounded-xl px-1 py-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => adjustMissingQty(item.id, -1)}
                            className="p-1 text-text-secondary hover:text-text-main"
                            title="Disminuir cantidad"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-[11px] font-black text-text-main min-w-[18px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustMissingQty(item.id, 1)}
                            className="p-1 text-text-secondary hover:text-text-main"
                            title="Aumentar cantidad"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeMissingItem(item.id)}
                          className="p-1 text-text-secondary hover:text-red-500 transition-colors shrink-0"
                          title="Ya lo tengo / quitar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sección 2: Lo detectado en la foto */}
              <div className="border border-border rounded-2xl bg-gray-50/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDetectedSection((v) => !v)}
                  className="w-full p-3.5 flex items-center justify-between text-left hover:bg-gray-100/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-black uppercase tracking-wider text-text-main">
                      Lo que hay en tu despensa ({detectedItems.length})
                    </span>
                  </div>
                  {showDetectedSection ? (
                    <ChevronUp className="w-4 h-4 text-text-secondary" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-text-secondary" />
                  )}
                </button>

                {showDetectedSection && (
                  <div className="divide-y divide-border/50 border-t border-border/60 bg-white max-h-[210px] overflow-y-auto">
                    {detectedItems.map((det) => (
                      <div key={det.id} className="p-2.5 sm:p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-text-main">{det.name}</span>
                            {det.stockStatus === 'low' ? (
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-md inline-flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" /> Queda poco
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded-md inline-flex items-center gap-1">
                                <Check className="w-2.5 h-2.5" /> Disponible
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-text-secondary mt-0.5 truncate">
                            {det.category}
                            {det.estimatedQuantity ? ` • ${det.estimatedQuantity}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => addDetectedToMissing(det)}
                            className="px-2.5 py-1 bg-accent/10 hover:bg-accent text-accent hover:text-white rounded-lg text-[10px] font-black transition-colors flex items-center gap-1"
                            title="Pasar a la lista de compras"
                          >
                            <Plus className="w-3 h-3" /> Comprar
                          </button>
                          <button
                            type="button"
                            onClick={() => removeDetectedItem(det.id)}
                            className="p-1 text-text-secondary hover:text-red-500 transition-colors"
                            title="Quitar de detectados"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="p-4 sm:p-5 border-t border-border bg-surface-alt/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {step === 'review' ? (
            <>
              <button
                onClick={handleReset}
                disabled={isApplying}
                className="py-2.5 px-4 text-xs font-bold text-text-secondary hover:bg-black/5 rounded-xl transition-all"
              >
                Otras fotos
              </button>
              <button
                onClick={handleApply}
                disabled={isApplying || selectedMissing.length === 0}
                className="flex items-center gap-2 py-3 px-6 bg-accent hover:bg-accent-dark disabled:opacity-50 text-white rounded-2xl font-black text-xs sm:text-sm shadow-lg shadow-accent/25 active:scale-95 transition-all"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Agregando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Agregar {selectedMissing.length} a mi lista
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={handleCloseModal}
              disabled={step === 'scanning'}
              className="ml-auto py-2.5 px-5 text-xs font-bold text-text-secondary hover:bg-black/5 rounded-xl transition-all disabled:opacity-40"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
