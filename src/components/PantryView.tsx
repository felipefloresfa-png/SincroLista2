import React, { useMemo, useState } from 'react';
import {
  Camera,
  Check,
  Droplet,
  Menu,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBasket,
  ShoppingCart,
  Snowflake,
  Sparkles,
  X,
  ArrowRight,
  Clock,
} from 'lucide-react';
import {
  buildPantryCatalog,
  buildRestockSuggestions,
  formatConsumptionSummary,
  PANTRY_ZONES,
  PantryZoneId,
  PantryCatalogItem,
} from '../lib/pantryCatalog';

interface PantryViewProps {
  onOpenMenu: () => void;
  activeItems: Array<{
    id: string;
    listId?: string;
    name: string;
    quantity?: string;
    checked: boolean;
  }>;
  catalogItems?: PantryCatalogItem[];
  lists: Array<{ id: string; name: string }>;
  activeListId: string | null;
  onSelectListId: (listId: string) => void;
  onGoToList: () => void;
  history: any[];
  activities?: any[];
  suggestions: Array<{ name: string; reason?: string }>;
  onStepItem: (name: string, delta: 1 | -1, initialQty?: number) => Promise<void> | void;
  onAddMultiple?: (items: Array<{ name: string; quantity: number }>) => Promise<void> | void;
  onAddCustomItem: (name: string) => Promise<void> | void;
  onOpenPantryScanner: () => void;
}

type StatusFilter = 'all' | 'restock' | 'in_list';

function ZoneIcon({ zone, inList }: { zone: PantryCatalogItem['zone']; inList: boolean }) {
  const baseClass = inList
    ? 'w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center shrink-0 transition-colors'
    : 'w-10 h-10 rounded-xl bg-gray-100 text-text-secondary flex items-center justify-center shrink-0 transition-colors';

  if (zone === 'fridge') {
    return (
      <div className={baseClass}>
        <Snowflake className="w-4.5 h-4.5" />
      </div>
    );
  }
  if (zone === 'cleaning') {
    return (
      <div className={baseClass}>
        <Droplet className="w-4.5 h-4.5" />
      </div>
    );
  }
  return (
    <div className={baseClass}>
      <Package className="w-4.5 h-4.5" />
    </div>
  );
}

function getStockLabel(item: PantryCatalogItem) {
  if (item.stockStatus === 'stale') {
    return {
      text: `Sin compras hace ${item.daysSinceLastPurchase ?? 90} d`,
      colorClass: 'text-text-secondary',
      barClass: 'bg-gray-300',
      percent: 12,
    };
  }
  if (item.stockStatus === 'depleted') {
    if (item.daysRemaining !== null && item.daysRemaining < 0) {
      const overdue = Math.abs(item.daysRemaining);
      return {
        text: `Pasado ${overdue} ${overdue === 1 ? 'día' : 'días'}`,
        colorClass: 'text-red-600',
        barClass: 'bg-red-500',
        percent: 6,
      };
    }
    return {
      text: 'Toca reponer hoy',
      colorClass: 'text-red-600',
      barClass: 'bg-red-500',
      percent: 10,
    };
  }
  if (item.stockStatus === 'low') {
    const rem = Math.max(1, item.daysRemaining ?? 1);
    return {
      text: `Quedan ${rem} ${rem === 1 ? 'día' : 'días'}`,
      colorClass: 'text-amber-600',
      barClass: 'bg-amber-500',
      percent: Math.max(15, item.stockPercent ?? 22),
    };
  }
  if (item.stockStatus === 'ok' && item.daysRemaining !== null) {
    return {
      text: `Quedan ${item.daysRemaining} ${item.daysRemaining === 1 ? 'día' : 'días'}`,
      colorClass: 'text-emerald-700',
      barClass: 'bg-emerald-500',
      percent: Math.max(28, item.stockPercent ?? 70),
    };
  }
  return null;
}

export function PantryView({
  onOpenMenu,
  activeItems,
  catalogItems: providedCatalog,
  lists,
  activeListId,
  onSelectListId,
  onGoToList,
  history = [],
  activities = [],
  suggestions = [],
  onStepItem,
  onAddMultiple,
  onAddCustomItem,
  onOpenPantryScanner,
}: PantryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [zoneFilter, setZoneFilter] = useState<PantryZoneId>('all');
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isAddingBatch, setIsAddingBatch] = useState(false);

  const activeList = useMemo(
    () => lists.find((l) => l.id === activeListId) || lists[0] || null,
    [lists, activeListId]
  );

  const pendingActiveCount = useMemo(
    () => activeItems.filter((i) => !i.checked).length,
    [activeItems]
  );

  const catalogItems = useMemo(
    () =>
      providedCatalog ||
      buildPantryCatalog({
        history,
        activities,
        activeItems,
      }),
    [providedCatalog, history, activities, activeItems]
  );

  const restockSuggestions = useMemo(
    () =>
      buildRestockSuggestions({
        catalogItems,
        aiSuggestions: suggestions,
        activeItems,
        max: 3,
      }),
    [catalogItems, suggestions, activeItems]
  );

  const urgentRestockItems = useMemo(
    () =>
      catalogItems.filter(
        (item) => !item.inListItem && (item.stockStatus === 'depleted' || item.stockStatus === 'low')
      ),
    [catalogItems]
  );

  const stats = useMemo(() => {
    const inListCount = catalogItems.filter((item) => Boolean(item.inListItem)).length;
    const restockCount = catalogItems.filter((item) => item.needsRestock).length;
    return {
      totalCount: catalogItems.length,
      inListCount,
      restockCount,
    };
  }, [catalogItems]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchQuery
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return catalogItems.filter((item) => {
      if (zoneFilter !== 'all' && item.zone !== zoneFilter) return false;
      if (statusFilter === 'in_list' && !item.inListItem) return false;
      if (statusFilter === 'restock' && !item.needsRestock) return false;

      if (normalizedSearch) {
        const hay = `${item.name} ${item.variants.join(' ')} ${item.category} ${item.zoneLabel}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (!hay.includes(normalizedSearch)) return false;
      }
      return true;
    });
  }, [catalogItems, zoneFilter, statusFilter, searchQuery]);

  const hasExactSearchMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return catalogItems.some(
      (item) =>
        item.name.toLowerCase() === q || item.variants.some((v) => v.toLowerCase() === q)
    );
  }, [catalogItems, searchQuery]);

  const handleStep = async (key: string, name: string, delta: 1 | -1, initialQty = 1) => {
    if (busyKey === key) return;
    setBusyKey(key);
    try {
      await onStepItem(name, delta, initialQty);
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddAllUrgent = async () => {
    if (urgentRestockItems.length === 0 || isAddingBatch) return;
    setIsAddingBatch(true);
    try {
      const payload = urgentRestockItems.slice(0, 8).map((item) => ({
        name: selectedVariants[item.key] || item.preferredVariant || item.name,
        quantity: item.habitualQuantity || 1,
      }));
      if (onAddMultiple) {
        await onAddMultiple(payload);
      } else {
        for (const it of payload) {
          await onStepItem(it.name, 1, it.quantity);
        }
      }
    } finally {
      setIsAddingBatch(false);
    }
  };

  const handleQuickCustomAdd = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setBusyKey('custom-add');
    try {
      await onAddCustomItem(trimmed);
      setSearchQuery('');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="p-4 md:p-8 lg:p-10 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Abrir menú"
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center bg-white border border-border rounded-xl shadow-xs active:scale-95 transition-transform"
          >
            <Menu className="w-5 h-5 text-text-main" />
          </button>
          <div className="w-11 h-11 bg-accent/10 rounded-xl grid place-items-center shrink-0">
            <ShoppingBasket className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-main leading-tight">
              Modo Despensa
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary">
              Agrupa tus compras por producto base, estima cuánto duran y envía faltantes al checklist
            </p>
          </div>
        </div>

        {/* Lista destino + acceso rápido */}
        <div className="flex flex-wrap items-center gap-2.5">
          {lists.length > 1 ? (
            <label className="flex items-center gap-2 bg-white border border-border rounded-xl px-3 min-h-[44px] text-xs text-text-secondary">
              <span className="whitespace-nowrap">Lista:</span>
              <select
                value={activeList?.id || ''}
                onChange={(e) => onSelectListId(e.target.value)}
                className="bg-transparent font-semibold text-text-main outline-none cursor-pointer pr-1"
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
          ) : activeList ? (
            <div className="text-xs text-text-secondary px-1 whitespace-nowrap">
              Lista: <span className="font-semibold text-text-main">{activeList.name}</span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onGoToList}
            className="min-h-[44px] px-4 py-2 bg-white hover:bg-gray-50 border border-border rounded-xl text-xs font-semibold text-text-main inline-flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4 text-accent" />
            <span className="tabular-nums">Ver checklist ({pendingActiveCount})</span>
            <ArrowRight className="w-3.5 h-3.5 text-text-secondary" />
          </button>
        </div>
      </div>

      {/* Hero Split: Escáner Visual + Estado de Reposición */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Ancla principal */}
        <div className="lg:col-span-7 bg-white border border-border rounded-2xl p-6 flex flex-col justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-accent">
              <Camera className="w-4 h-4" />
              <span>Inventario visual con IA</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-text-main leading-snug text-balance">
              ¿Revisando qué falta en la alacena o el refrigerador?
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              Sube fotos de tus estantes. Identificamos lo que ya tienes, detectamos envases casi
              vacíos y preparamos tu checklist con lo que toca reponer.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onOpenPantryScanner}
              className="min-h-[44px] px-5 py-2.5 bg-accent hover:bg-accent-dark text-white font-semibold text-sm rounded-xl shadow-sm active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Escanear despensa con foto</span>
            </button>
            <p className="text-xs text-text-secondary">
              Hasta 5 fotos · Cruza con tu historial · Revisas antes de agregar
            </p>
          </div>
        </div>

        {/* Estado en vivo del hogar */}
        <div className="lg:col-span-5 bg-white border border-border rounded-2xl p-6 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-text-main">Ritmo de tu despensa</h3>
            {urgentRestockItems.length > 0 ? (
              <button
                type="button"
                disabled={isAddingBatch}
                onClick={handleAddAllUrgent}
                className="text-xs font-semibold text-accent hover:text-accent-dark whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {isAddingBatch
                  ? 'Agregando...'
                  : `+ Pedir urgentes (${Math.min(urgentRestockItems.length, 8)})`}
              </button>
            ) : (
              <span className="text-xs text-text-secondary">Conectado al checklist</span>
            )}
          </div>

          <div className="divide-y divide-gray-100">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="w-full py-2.5 flex items-center justify-between text-left hover:bg-gray-50/70 rounded-lg px-2 -mx-2 transition-colors cursor-pointer"
            >
              <div>
                <p className="text-sm font-medium text-text-main">Productos seguidos</p>
                <p className="text-xs text-text-secondary">Sabores unificados por producto base</p>
              </div>
              <span className="text-lg font-bold text-text-main tabular-nums">
                {stats.totalCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('restock')}
              className="w-full py-2.5 flex items-center justify-between text-left hover:bg-gray-50/70 rounded-lg px-2 -mx-2 transition-colors cursor-pointer"
            >
              <div>
                <p className="text-sm font-medium text-text-main">Por reponer ahora</p>
                <p className="text-xs text-text-secondary">Agotados o en últimos días de stock</p>
              </div>
              <span className="text-lg font-bold text-amber-600 tabular-nums">
                {stats.restockCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('in_list')}
              className="w-full py-2.5 flex items-center justify-between text-left hover:bg-gray-50/70 rounded-lg px-2 -mx-2 transition-colors cursor-pointer"
            >
              <div>
                <p className="text-sm font-medium text-text-main">Ya en tu checklist</p>
                <p className="text-xs text-text-secondary">Al finalizar compra vuelven a 100%</p>
              </div>
              <span className="text-lg font-bold text-accent tabular-nums">
                {stats.inListCount}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Sugeridos para reponer hoy */}
      {restockSuggestions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <h3 className="text-base font-bold text-text-main">Próximos a acabarse</h3>
            </div>
            <span className="text-xs text-text-secondary">Según fecha y cantidad comprada</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {restockSuggestions.map((s) => {
              const isBusy = busyKey === `restock-${s.key}`;
              const qtyLabel = s.recommendedQty > 1 ? ` x${s.recommendedQty}` : '';
              return (
                <div
                  key={s.key}
                  className="bg-white border border-border rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <h4 className="text-sm font-semibold text-text-main truncate">{s.name}</h4>
                    <p className="text-xs text-text-secondary line-clamp-2 flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="truncate">{s.reason}</span>
                    </p>
                  </div>

                  {s.inListItem ? (
                    <div className="inline-flex items-center bg-accent-light border border-accent/30 rounded-xl overflow-hidden shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleStep(`restock-${s.key}`, s.inListItem!.name, -1)}
                        aria-label={`Quitar o restar ${s.inListItem.name}`}
                        className="w-10 h-10 flex items-center justify-center text-accent-dark hover:bg-accent/15 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="min-w-[24px] text-center text-xs font-bold text-accent-dark tabular-nums">
                        {s.inListItem.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleStep(`restock-${s.key}`, s.inListItem!.name, 1)}
                        aria-label={`Sumar ${s.inListItem.name}`}
                        className="w-10 h-10 flex items-center justify-center text-accent-dark hover:bg-accent/15 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleStep(`restock-${s.key}`, s.name, 1, s.recommendedQty)}
                      className="min-h-[40px] px-3.5 py-2 bg-accent hover:bg-accent-dark text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 tabular-nums"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar{qtyLabel}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Catálogo rápido por zonas */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-text-main">Inventario y duración estimada</h3>
            <p className="text-xs text-text-secondary">
              Los sabores y presentaciones comparten un mismo ciclo (ej. todo tipo de yogurt)
            </p>
          </div>

          {/* Buscador */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-text-secondary absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim() && filteredItems.length === 0) {
                  handleQuickCustomAdd();
                }
              }}
              placeholder="Buscar producto o sabor..."
              className="w-full min-h-[44px] pl-10 pr-9 bg-white border border-border rounded-xl text-sm text-text-main placeholder:text-text-secondary/70 focus:outline-none focus:border-accent transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-main absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filtros interactivos: Estado + Zona */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-xl self-start overflow-x-auto max-w-full">
            {[
              { id: 'all' as const, label: `Todos (${stats.totalCount})` },
              { id: 'restock' as const, label: `Por reponer (${stats.restockCount})` },
              { id: 'in_list' as const, label: `En lista (${stats.inListCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors cursor-pointer tabular-nums ${
                  statusFilter === tab.id
                    ? 'bg-white text-text-main shadow-xs'
                    : 'text-text-secondary hover:text-text-main'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 lg:pb-0">
            {PANTRY_ZONES.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setZoneFilter(zone.id)}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  zoneFilter === zone.id
                    ? 'bg-text-main text-white border-text-main'
                    : 'bg-white text-text-secondary border-border hover:text-text-main'
                }`}
              >
                {zone.label}
              </button>
            ))}
          </div>
        </div>

        {/* Acceso directo para crear producto si el usuario escribió algo nuevo */}
        {searchQuery.trim().length > 1 && !hasExactSearchMatch && (
          <div className="bg-accent-light/50 border border-accent/25 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <p className="text-sm text-text-main">
              ¿No ves <span className="font-semibold">«{searchQuery.trim()}»</span>? Agrégalo directo
              a tu lista.
            </p>
            <button
              type="button"
              disabled={busyKey === 'custom-add'}
              onClick={handleQuickCustomAdd}
              className="min-h-[40px] px-4 py-2 bg-accent hover:bg-accent-dark text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar a la lista</span>
            </button>
          </div>
        )}

        {/* Grid uniforme de productos */}
        {filteredItems.length === 0 ? (
          <div className="bg-white border border-border rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-text-main">
              No hay productos que coincidan con este filtro
            </p>
            <p className="text-xs text-text-secondary">
              Prueba cambiando la zona o limpiando la búsqueda para ver todo tu catálogo.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setZoneFilter('all');
              }}
              className="min-h-[40px] px-4 py-2 bg-gray-100 hover:bg-gray-200 text-text-main text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Mostrar todos los productos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredItems.map((item) => {
              const isBusy = busyKey === item.key;
              const isInList = Boolean(item.inListItem);
              const stockInfo = getStockLabel(item);
              const addQty = item.habitualQuantity > 1 ? item.habitualQuantity : 1;
              const hasMultipleVariants = item.variants.length > 1;
              const chosenVariant =
                selectedVariants[item.key] || item.preferredVariant || item.name;
              const stepTargetName = item.inListItem ? item.inListItem.name : chosenVariant;

              return (
                <div
                  key={item.key}
                  className={`rounded-2xl p-4 border flex flex-col justify-between gap-2.5 transition-colors ${
                    isInList
                      ? 'bg-accent-light/40 border-accent/40'
                      : 'bg-white border-border hover:border-gray-300'
                  }`}
                >
                  {/* Fila superior: Icono + Nombre + Acción */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <ZoneIcon zone={item.zone} inList={isInList} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-text-main truncate">
                            {item.name}
                          </span>
                          {isInList && (
                            <Check className="w-3.5 h-3.5 text-accent shrink-0" strokeWidth={2.5} />
                          )}
                        </div>
                        {isInList && item.inListItem && item.inListItem.name !== item.name ? (
                          <p className="text-xs text-accent-dark truncate">
                            En lista: {item.inListItem.name}
                          </p>
                        ) : !hasMultipleVariants && item.variants.length === 1 && item.variants[0] !== item.name ? (
                          <p className="text-xs text-text-secondary truncate">
                            {item.variants[0]}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {item.inListItem ? (
                      <div className="inline-flex items-center bg-white border border-accent/30 rounded-xl overflow-hidden shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleStep(item.key, stepTargetName, -1)}
                          aria-label={`Restar ${stepTargetName}`}
                          className="w-10 h-10 flex items-center justify-center text-text-main hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="min-w-[24px] text-center text-xs font-bold text-accent-dark tabular-nums">
                          {item.inListItem.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleStep(item.key, stepTargetName, 1)}
                          aria-label={`Sumar ${stepTargetName}`}
                          className="w-10 h-10 flex items-center justify-center text-accent-dark hover:bg-accent-light transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleStep(item.key, stepTargetName, 1, addQty)}
                        className="min-h-[40px] px-3.5 py-2 bg-gray-100 hover:bg-accent hover:text-white text-text-main text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 tabular-nums"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Agregar{addQty > 1 ? ` x${addQty}` : ''}</span>
                      </button>
                    )}
                  </div>

                  {/* Línea completa de última compra y duración sin recorte por botón */}
                  <p className="text-xs text-text-secondary leading-snug tabular-nums">
                    {formatConsumptionSummary(item)}
                  </p>

                  {/* Selector de sabor/presentación cuando la familia agrupa varias variantes */}
                  {hasMultipleVariants && !isInList && (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-text-secondary shrink-0">Sabor / tipo:</span>
                      <select
                        value={chosenVariant}
                        onChange={(e) =>
                          setSelectedVariants((prev) => ({
                            ...prev,
                            [item.key]: e.target.value,
                          }))
                        }
                        className="flex-1 min-w-0 bg-gray-50 border border-border rounded-lg px-2 py-1 text-xs font-medium text-text-main outline-none focus:border-accent cursor-pointer truncate"
                      >
                        {item.variants.map((variant) => (
                          <option key={variant} value={variant}>
                            {variant}
                          </option>
                        ))}
                        {!item.variants.includes(item.name) && (
                          <option value={item.name}>{item.name} (general)</option>
                        )}
                      </select>
                    </div>
                  )}

                  {stockInfo && (
                    <div className="flex items-center gap-2.5 pt-0.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${stockInfo.barClass}`}
                          style={{ width: `${stockInfo.percent}%` }}
                        />
                      </div>
                      <span
                        className={`text-[11px] font-semibold whitespace-nowrap tabular-nums ${stockInfo.colorClass}`}
                      >
                        {isInList ? 'Pedido en lista' : stockInfo.text}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
