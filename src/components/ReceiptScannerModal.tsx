import React, { useState, useRef } from 'react';
import { 
  Camera, 
  Upload, 
  Receipt, 
  Sparkles, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Edit3, 
  X, 
  Store, 
  Calendar, 
  ShoppingBag, 
  Loader2, 
  RefreshCw,
  Plus
} from 'lucide-react';
import { 
  compressImageFile, 
  scanReceiptWithAI, 
  ReceiptScanResult, 
  ReceiptScanItem 
} from '../lib/gemini';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeItems: Array<{ id: string; name: string; checked: boolean }>;
  onApplyResults: (options: {
    result: ReceiptScanResult;
    markMatchingAsChecked: boolean;
    saveToHistory: boolean;
    addUnmatchedToList: boolean;
  }) => Promise<void>;
}

export function ReceiptScannerModal({
  isOpen,
  onClose,
  activeItems,
  onApplyResults
}: ReceiptScannerModalProps) {
  const [step, setStep] = useState<'upload' | 'scanning' | 'review'>('upload');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Opciones de aplicación
  const [markMatching, setMarkMatching] = useState(true);
  const [saveHistory, setSaveHistory] = useState(true);
  const [addUnmatched, setAddUnmatched] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const { base64, mimeType: detectedMime } = await compressImageFile(file, 1600, 0.85);
      setImagePreview(base64);
      setImageBase64(base64);
      setMimeType(detectedMime);
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo cargar la imagen.');
    }
  };

  const handleStartScan = async () => {
    if (!imageBase64) return;
    setErrorMsg(null);
    setStep('scanning');

    try {
      const result = await scanReceiptWithAI(imageBase64, mimeType, activeItems);
      if (!result.items || result.items.length === 0) {
        setErrorMsg('No se detectaron productos claros en la imagen. Intenta con una toma más enfocada o con mejor luz.');
        setStep('upload');
        return;
      }
      setScanResult(result);
      setStep('review');
    } catch (err: any) {
      console.error('Error al escanear:', err);
      setErrorMsg(err.message || 'Error al conectar con la IA para analizar la boleta.');
      setStep('upload');
    }
  };

  const toggleItemSelection = (itemId: string) => {
    if (!scanResult) return;
    setScanResult({
      ...scanResult,
      items: scanResult.items.map(item => 
        item.id === itemId ? { ...item, selected: !item.selected } : item
      )
    });
  };

  const updateItemField = (itemId: string, field: 'name' | 'price' | 'quantity', value: any) => {
    if (!scanResult) return;
    setScanResult({
      ...scanResult,
      items: scanResult.items.map(item => 
        item.id === itemId ? { ...item, [field]: value } : item
      )
    });
  };

  const removeItem = (itemId: string) => {
    if (!scanResult) return;
    setScanResult({
      ...scanResult,
      items: scanResult.items.filter(item => item.id !== itemId)
    });
  };

  const handleApply = async () => {
    if (!scanResult) return;
    setIsApplying(true);
    try {
      await onApplyResults({
        result: scanResult,
        markMatchingAsChecked: markMatching,
        saveToHistory: saveHistory,
        addUnmatchedToList: addUnmatched
      });
      handleReset();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar los resultados.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setImagePreview(null);
    setImageBase64(null);
    setScanResult(null);
    setErrorMsg(null);
    setIsApplying(false);
  };

  // Contar coincidencias con la lista activa
  const matchingCount = scanResult?.items.filter(i => i.selected && i.matchedActiveItem).length || 0;
  const totalSelected = scanResult?.items.filter(i => i.selected).length || 0;
  const calculatedSum = scanResult?.items
    .filter(i => i.selected)
    .reduce((sum, i) => sum + (Number(i.price) || 0), 0) || 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white border border-border w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Encabezado */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-alt/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold shadow-sm">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-text-main">Escáner de Boleta con IA</h3>
                <span className="text-[10px] bg-emerald-100 text-emerald-700 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Gemini Vision
                </span>
              </div>
              <p className="text-xs text-text-secondary">Extrae precios, total y concilia con tu lista automáticamente</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-black/5 grid place-items-center text-text-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mensaje de error si ocurre */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-100 rounded-lg">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Contenido según el paso */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Entradas de archivo ocultas */}
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileChange} 
              />
              <input 
                ref={cameraInputRef}
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                onChange={handleFileChange} 
              />

              {!imagePreview ? (
                <div className="border-2 border-dashed border-border rounded-3xl p-6 sm:p-10 flex flex-col items-center justify-center text-center gap-4 bg-surface-alt/30 hover:border-emerald-500/50 transition-colors">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                    <Receipt className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-black text-text-main">Toma una foto de tu boleta o súbela</h4>
                    <p className="text-xs text-text-secondary max-w-sm mt-1">
                      Gemini detectará el supermercado, cada producto comprado, su precio unitario y el total pagado.
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-xs mt-2">
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 text-white rounded-2xl font-bold text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-transform"
                    >
                      <Camera className="w-4 h-4" /> Tomar Foto
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-surface border border-border text-text-main rounded-2xl font-bold text-xs hover:bg-surface-alt active:scale-95 transition-transform"
                    >
                      <Upload className="w-4 h-4" /> De la Galería
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-2xl overflow-hidden border border-border bg-black/5 max-h-[320px] flex items-center justify-center group">
                    <img 
                      src={imagePreview} 
                      alt="Boleta cargada" 
                      className="max-h-[300px] w-auto object-contain mx-auto rounded-lg shadow-sm"
                    />
                    <div className="absolute top-2 right-2 flex gap-2">
                      <button
                        onClick={() => {
                          setImagePreview(null);
                          setImageBase64(null);
                        }}
                        className="p-2 bg-black/70 hover:bg-black text-white rounded-xl shadow-md transition-all active:scale-90"
                        title="Cambiar foto"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleStartScan}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-emerald-600/25 active:scale-95 transition-all"
                    >
                      <Sparkles className="w-4 h-4" /> Analizar Boleta con IA
                    </button>
                    <button
                      onClick={() => {
                        setImagePreview(null);
                        setImageBase64(null);
                      }}
                      className="py-3 px-4 border border-border text-text-secondary rounded-2xl font-bold text-xs hover:bg-surface-alt active:scale-95 transition-all"
                    >
                      Cambiar
                    </button>
                  </div>
                </div>
              )}

              {/* Consejos para una buena lectura */}
              <div className="p-4 bg-surface-alt/60 rounded-2xl border border-border/50 text-[11px] text-text-secondary space-y-1">
                <span className="font-bold text-text-main block">Consejos para una lectura perfecta:</span>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>Asegúrate de que la boleta esté bien iluminada y sin sombras fuertes.</li>
                  <li>Enfoca especialmente el desglose de productos y el monto total final.</li>
                  <li>Funciona con boletas de Lider, Jumbo, Santa Isabel, Unimarc, Tottus, ferias, etc.</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-5">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 animate-pulse">
                  <Receipt className="w-10 h-10 animate-bounce" />
                </div>
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-black text-text-main">Gemini Vision está leyendo tu boleta...</h4>
                <p className="text-xs text-text-secondary max-w-xs mx-auto">
                  Detectando supermercado, desglosando productos, leyendo precios y buscando coincidencias con tu lista.
                </p>
              </div>
            </div>
          )}

          {step === 'review' && scanResult && (
            <div className="space-y-5">
              
              {/* Tarjeta de Resumen Detectado */}
              <div className="p-4 sm:p-5 bg-gradient-to-br from-emerald-500/10 via-surface-alt to-surface border border-emerald-500/20 rounded-3xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-white shadow-sm border border-border/80 flex items-center justify-center text-emerald-600 font-black">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <input 
                        type="text"
                        value={scanResult.storeName}
                        onChange={(e) => setScanResult({ ...scanResult, storeName: e.target.value })}
                        className="text-base font-black text-text-main bg-transparent border-b border-dashed border-text-secondary/40 focus:border-emerald-600 outline-none pb-0.5"
                        placeholder="Supermercado"
                      />
                      <p className="text-[10px] text-text-secondary flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" /> {scanResult.date || 'Hoy'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary block">Total de la boleta</span>
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-xl sm:text-2xl font-black text-emerald-700">
                        ${Number(scanResult.totalCost).toLocaleString('es-CL')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 bg-white/80 border border-emerald-500/10 rounded-2xl flex items-center justify-between text-xs text-text-main">
                  <span className="text-[11px] text-emerald-800 font-medium">{scanResult.summaryText}</span>
                  <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full shrink-0">
                    {scanResult.items.length} productos
                  </span>
                </div>
              </div>

              {/* Lista de Productos Extraídos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-xs font-black uppercase tracking-wider text-text-secondary">
                    Productos detectados ({totalSelected} seleccionados)
                  </h4>
                  <span className="text-[10px] text-text-secondary font-bold">
                    Suma seleccionados: <strong className="text-text-main">${calculatedSum.toLocaleString('es-CL')}</strong>
                  </span>
                </div>

                <div className="divide-y divide-border/60 border border-border rounded-2xl bg-surface overflow-hidden max-h-[300px] overflow-y-auto">
                  {scanResult.items.map((item) => (
                    <div 
                      key={item.id}
                      className={`p-3 flex items-center gap-3 transition-colors ${
                        item.selected ? 'bg-surface hover:bg-surface-alt/40' : 'bg-surface-alt/50 opacity-50'
                      }`}
                    >
                      <input 
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItemSelection(item.id)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-border cursor-pointer shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <input 
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                            className="text-xs font-bold text-text-main bg-transparent outline-none truncate w-full"
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-text-secondary bg-surface-alt px-1.5 py-0.2 rounded font-medium">
                            {item.category}
                          </span>
                          {item.matchedActiveItem && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded-md font-bold flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> En lista: {item.matchedActiveItem}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-0.5 justify-end">
                          <span className="text-xs font-black text-text-main">
                            ${Number(item.price).toLocaleString('es-CL')}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-secondary">x{item.quantity}</span>
                      </div>

                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1 text-text-secondary hover:text-red-500 transition-colors shrink-0"
                        title="Eliminar de la lista"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Opciones de conciliación */}
              <div className="p-3.5 bg-surface-alt/50 border border-border rounded-2xl space-y-2.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-text-secondary block">
                  ¿Cómo deseas aplicar esta boleta?
                </span>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-text-main select-none">
                  <input 
                    type="checkbox"
                    checked={markMatching}
                    onChange={(e) => setMarkMatching(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-border mt-0.5 shrink-0"
                  />
                  <div>
                    <span className="font-bold">Marcar productos como comprados en mi lista ({matchingCount} coincidencias)</span>
                    <p className="text-[10px] text-text-secondary">Tacha los productos que tenías anotados y actualiza su precio real.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-text-main select-none">
                  <input 
                    type="checkbox"
                    checked={saveHistory}
                    onChange={(e) => setSaveHistory(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-border mt-0.5 shrink-0"
                  />
                  <div>
                    <span className="font-bold">Guardar gasto en el Historial y Gráficos Mensuales</span>
                    <p className="text-[10px] text-text-secondary">Registra el monto de ${Number(scanResult.totalCost).toLocaleString('es-CL')} para llevar las cuentas claras de la pareja.</p>
                  </div>
                </label>
              </div>

            </div>
          )}

        </div>

        {/* Pie de modal */}
        <div className="p-4 sm:p-5 border-t border-border bg-surface-alt/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {step === 'review' ? (
            <>
              <button
                onClick={handleReset}
                className="py-2.5 px-4 text-xs font-bold text-text-secondary hover:bg-black/5 rounded-xl transition-all"
              >
                Volver a escanear
              </button>
              <button
                onClick={handleApply}
                disabled={isApplying || totalSelected === 0}
                className="flex items-center gap-2 py-3 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs sm:text-sm shadow-lg shadow-emerald-600/25 active:scale-95 transition-all"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Aplicar y Guardar Boleta
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="ml-auto py-2.5 px-5 text-xs font-bold text-text-secondary hover:bg-black/5 rounded-xl transition-all"
            >
              Cerrar
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
