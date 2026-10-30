import React, { useState } from 'react';
import { FoodCategory, FridgeItem, Language, StorageZone } from '../types';
import { translations } from '../i18n/translations';
import { EVERYDAY_STAPLES_CATALOG } from '../data/initialData';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  PackagePlus,
  Plus,
  Search,
  ShoppingCart,
  Snowflake,
  Trash2,
  X,
} from 'lucide-react';

interface FridgeViewProps {
  items: FridgeItem[];
  lang: Language;
  onAddItemClick: () => void;
  onOpenPhotoScan?: () => void;
  onConsumeItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onAddToShopping: (item: FridgeItem) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onNavigateToRecipes: () => void;
  onQuickAddEverydayItem?: (itemData: {
    name: string;
    category: FoodCategory;
    zone: StorageZone;
    quantity: number;
    unit: string;
    expirationDays: number;
    autoRestock: boolean;
  }) => void;
  onThawItemToFridge?: (id: string) => void;
  hasYoungChildren?: boolean;
}

export const FridgeView: React.FC<FridgeViewProps> = ({
  items,
  lang,
  onAddItemClick,
  onOpenPhotoScan,
  onConsumeItem,
  onDeleteItem,
  onAddToShopping,
  onUpdateQuantity,
  onNavigateToRecipes,
  onQuickAddEverydayItem,
  onThawItemToFridge,
  hasYoungChildren = false,
}) => {
  const t = translations[lang] || translations.fr;
  const [selectedZone, setSelectedZone] = useState<'all' | StorageZone>('all');
  const [onlyExpiring, setOnlyExpiring] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showQuickCatalog, setShowQuickCatalog] = useState(false);
  const [catalogGroupFilter, setCatalogGroupFilter] = useState<
    | 'all'
    | 'alimentaire'
    | 'bebe'
    | 'menage_linge'
    | 'vaisselle_cuisine'
    | 'entretien_wc'
    | 'hygiene_sdb'
  >('all');
  const [justAddedName, setJustAddedName] = useState<string | null>(null);
  const [addedToCartId, setAddedToCartId] = useState<string | null>(null);

  // Batch Cooking Baby Purées state
  const [showBatchBabyModal, setShowBatchBabyModal] = useState(false);
  const [batchName, setBatchName] = useState('Purée Carotte & Patate douce');
  const [batchGrams, setBatchGrams] = useState<number>(130);
  const [batchCount, setBatchCount] = useState<number>(4);
  const [batchZone, setBatchZone] = useState<'fridge' | 'freezer'>('freezer');

  // Configurable Diapers per day for Baby Autonomy calculation
  const [diapersPerDay, setDiapersPerDay] = useState<number>(() => {
    const saved = localStorage.getItem('doudous_v3_diapers_per_day');
    return saved ? Number(saved) : 6;
  });

  const handleUpdateDiapersPerDay = (val: number) => {
    const clamped = Math.max(1, Math.min(15, val));
    setDiapersPerDay(clamped);
    localStorage.setItem('doudous_v3_diapers_per_day', String(clamped));
  };

  const handleCreateBatchBabyPots = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchName.trim() || !onQuickAddEverydayItem) return;
    onQuickAddEverydayItem({
      name: `🍲 Petit pot maison : ${batchName.trim()}`,
      category: 'baby_care',
      zone: batchZone,
      quantity: batchCount,
      unit: `pots de ${batchGrams}g`,
      expirationDays: batchZone === 'fridge' ? 2 : 60,
      autoRestock: false,
    });
    setShowBatchBabyModal(false);
  };

  const activeItems = items.filter((item) => !item.consumed && item.quantity > 0);

  // Calculate days remaining until expiration
  const getDaysUntilExpiration = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(dateStr);
    exp.setHours(0, 0, 0, 0);
    const diffTime = exp.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const expiringSoonCount = activeItems.filter(
    (i) => getDaysUntilExpiration(i.expirationDate) <= 3
  ).length;

  // Filter & sort items by expiration date ascending (FEFO)
  const filteredItems = activeItems
    .filter((item) => {
      const matchesZone = selectedZone === 'all' || item.zone === selectedZone;
      const matchesExpiring = !onlyExpiring || getDaysUntilExpiration(item.expirationDate) <= 3;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesZone && matchesExpiring && matchesSearch;
    })
    .sort(
      (a, b) => getDaysUntilExpiration(a.expirationDate) - getDaysUntilExpiration(b.expirationDate)
    );

  // Baby Care Autonomy Calculations
  const diaperItems = activeItems.filter((i) => i.name.toLowerCase().includes('couche'));
  const totalDiaperUnits = diaperItems.reduce((acc, item) => {
    const matchCount = item.unit.match(/(\d+)/);
    const perPack = matchCount ? parseInt(matchCount[1], 10) : 32;
    const isPack =
      item.unit.toLowerCase().includes('paquet') || item.unit.toLowerCase().includes('pack');
    return acc + (isPack ? item.quantity * perPack : item.quantity);
  }, 0);
  const estimatedDiaperDays =
    totalDiaperUnits > 0 ? Math.floor(totalDiaperUnits / diapersPerDay) : 0;

  const getCategoryEmoji = (cat: FoodCategory) => {
    switch (cat) {
      case 'dairy':
        return '🥛';
      case 'vegetables':
        return '🥦';
      case 'fruits':
        return '🍎';
      case 'meat_fish':
        return '🥩';
      case 'pantry':
        return '🍝';
      case 'bakery':
        return '🥖';
      case 'frozen':
        return '🧊';
      case 'beverages':
        return '🧃';
      case 'baby_care':
        return '🍼';
      case 'breast_milk':
        return '🤱';
      case 'household':
        return '🧺';
      case 'hygiene':
        return '🧼';
      default:
        return '📦';
    }
  };

  const getZoneLabel = (zone: StorageZone) => {
    switch (zone) {
      case 'fridge':
        return 'Frigo';
      case 'freezer':
        return 'Congélateur';
      case 'pantry':
        return 'Placard';
      case 'baby_care':
        return 'Bébé';
      case 'household':
        return 'Ménage';
    }
  };

  const zones: Array<{ id: 'all' | StorageZone; label: string; count: number }> = [
    { id: 'all', label: 'Tout', count: activeItems.length },
    {
      id: 'fridge',
      label: '❄️ Frigo',
      count: activeItems.filter((i) => i.zone === 'fridge').length,
    },
    {
      id: 'freezer',
      label: '🧊 Congél',
      count: activeItems.filter((i) => i.zone === 'freezer').length,
    },
    {
      id: 'pantry',
      label: '🥫 Placard',
      count: activeItems.filter((i) => i.zone === 'pantry').length,
    },
    ...(hasYoungChildren || activeItems.some((i) => i.zone === 'baby_care')
      ? [
          {
            id: 'baby_care' as const,
            label: '🍼 Bébé',
            count: activeItems.filter((i) => i.zone === 'baby_care').length,
          },
        ]
      : []),
    {
      id: 'household',
      label: '🧺 Ménage',
      count: activeItems.filter((i) => i.zone === 'household').length,
    },
  ];

  const handleQuickStapleAdd = (staple: (typeof EVERYDAY_STAPLES_CATALOG)[number]) => {
    if (!onQuickAddEverydayItem) return;
    onQuickAddEverydayItem({
      name: staple.name,
      category: staple.category,
      zone: staple.zone,
      quantity: 1,
      unit: staple.unit,
      expirationDays: staple.expirationDays,
      autoRestock: true,
    });
    setJustAddedName(staple.name);
    setTimeout(() => setJustAddedName(null), 1500);
  };

  return (
    <div className="space-y-4">
      {/* 1. MOBILE-FIRST COMMAND CARD: Zero Truncated Buttons, Full-Width Ergonomics */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 space-y-3 shadow-2xs">
        {/* Top Row: Search + Primary Scan/Add Actions */}
        <div className="flex flex-col md:flex-row md:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher dans vos stocks (lait, poulet, couches...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[42px] pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Primary 2-Button Action Row on Mobile (No 3-col truncation!) */}
          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full md:w-auto shrink-0">
            {onOpenPhotoScan && (
              <button
                type="button"
                onClick={onOpenPhotoScan}
                className="min-h-[42px] px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                title="Prendre en photo votre frigo ou votre ticket de caisse"
              >
                <Camera className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Photo / Ticket IA</span>
              </button>
            )}

            <button
              type="button"
              onClick={onAddItemClick}
              className="min-h-[42px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Scanner / Ajouter</span>
            </button>
          </div>
        </div>

        {/* Full-Width 1-Click Quick Catalog Bar (Never truncated!) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowQuickCatalog(!showQuickCatalog)}
            className={`w-full sm:w-auto min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-between sm:justify-start gap-2 border transition-colors cursor-pointer ${
              showQuickCatalog
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <span className="flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Catalogue rapide 1-clic (Lait, œufs, couches, ménage...)</span>
            </span>
            {showQuickCatalog ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>

          {expiringSoonCount > 0 && (
            <div className="flex items-center gap-2 justify-between sm:justify-end">
              <button
                type="button"
                onClick={() => setOnlyExpiring(!onlyExpiring)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  onlyExpiring
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>À consommer vite ({expiringSoonCount})</span>
              </button>

              <button
                type="button"
                onClick={onNavigateToRecipes}
                className="text-xs font-bold text-emerald-700 hover:underline shrink-0 cursor-pointer"
              >
                Idées recettes →
              </button>
            </div>
          )}
        </div>

        {/* Collapsible Quick Catalog Drawer */}
        {showQuickCatalog && (
          <div className="pt-3 border-t border-slate-100 space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
                {[
                  { id: 'all', label: 'Tous' },
                  { id: 'alimentaire', label: '🥛 Alimentaire' },
                  ...(hasYoungChildren ? [{ id: 'bebe', label: '🍼 Bébé & Couches' }] : []),
                  { id: 'menage_linge', label: '🧺 Lessive' },
                  { id: 'vaisselle_cuisine', label: '🍽️ Cuisine' },
                  { id: 'entretien_wc', label: '🧹 Sols & WC' },
                  { id: 'hygiene_sdb', label: '🧼 Hygiène' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCatalogGroupFilter(tab.id as any)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                      catalogGroupFilter === tab.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {justAddedName && (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 shrink-0">
                  <Check className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[140px]">{justAddedName} ajouté</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto p-0.5">
              {EVERYDAY_STAPLES_CATALOG.filter((s) => {
                if (!hasYoungChildren && s.group === 'bebe') return false;
                return catalogGroupFilter === 'all' || s.group === catalogGroupFilter;
              }).map((staple, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleQuickStapleAdd(staple)}
                  className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{staple.icon}</span>
                  <span>{staple.name}</span>
                  <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Storage Zone Pills Scroller */}
        <div className="pt-2 border-t border-slate-100 -mx-1 px-1">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {zones.map((z) => {
              const isActive = selectedZone === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setSelectedZone(z.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{z.label}</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded-md tabular-nums ${
                      isActive ? 'bg-slate-700 text-slate-100' : 'bg-white text-slate-500'
                    }`}
                  >
                    {z.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. COMPACT CONTEXTUAL BABY BAR (Only if household has a young child & viewing Baby/Freezer) */}
      {hasYoungChildren && (selectedZone === 'baby_care' || selectedZone === 'freezer') && (
        <div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-800">
              🩲 Autonomie couches :{' '}
              <strong className={estimatedDiaperDays <= 3 ? 'text-rose-600' : 'text-emerald-700'}>
                {totalDiaperUnits > 0
                  ? `~${estimatedDiaperDays} jours (${totalDiaperUnits} couches)`
                  : 'Aucune couche en stock'}
              </strong>
            </span>
            <div className="flex items-center gap-1 text-slate-500">
              <span>({diapersPerDay}/j</span>
              <button
                type="button"
                onClick={() => handleUpdateDiapersPerDay(diapersPerDay - 1)}
                className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 font-bold cursor-pointer"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => handleUpdateDiapersPerDay(diapersPerDay + 1)}
                className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 font-bold cursor-pointer"
              >
                +
              </button>
              <span>)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowBatchBabyModal(!showBatchBabyModal)}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <span>🍲 {showBatchBabyModal ? 'Fermer' : '+ Petits Pots Maison'}</span>
          </button>
        </div>
      )}

      {/* Batch Cooking Baby Modal / Drawer */}
      {showBatchBabyModal && (
        <form
          onSubmit={handleCreateBatchBabyPots}
          className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-950">
              🍲 Ajouter une fournée de petits pots / purées maison
            </h4>
            <button
              type="button"
              onClick={() => setShowBatchBabyModal(false)}
              className="text-xs text-amber-800 hover:underline cursor-pointer"
            >
              Fermer
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <input
              type="text"
              required
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Recette (ex: Carotte Patate douce)"
              className="sm:col-span-2 px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs"
            />
            <div className="flex items-center gap-1.5">
              <select
                value={batchGrams}
                onChange={(e) => setBatchGrams(Number(e.target.value))}
                className="flex-1 px-2.5 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold"
              >
                <option value={120}>120g</option>
                <option value={130}>130g</option>
                <option value={180}>180g</option>
                <option value={200}>200g</option>
              </select>
              <input
                type="number"
                min={1}
                max={20}
                value={batchCount}
                onChange={(e) => setBatchCount(Number(e.target.value))}
                className="w-16 px-2.5 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold text-center"
                title="Nombre de pots"
              />
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setBatchZone(batchZone === 'freezer' ? 'fridge' : 'freezer')}
                className="px-2.5 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-700 cursor-pointer shrink-0"
              >
                {batchZone === 'freezer' ? '🧊 Congél' : '❄️ Frigo'}
              </button>
              <button
                type="submit"
                className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Stocker
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 3. SCANNABLE STOCKS LIST */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl">
            ❄️
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {activeItems.length === 0
                ? 'Vos stocks sont vides pour le moment'
                : 'Aucun produit ne correspond à ce filtre'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {activeItems.length === 0
                ? 'Ajoutez vos produits en 1 clic avec le Catalogue rapide, la Photo IA ou le Scanner.'
                : 'Changez de zone ou réinitialisez la recherche.'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {activeItems.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowQuickCatalog(true)}
                  className="min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
                >
                  ⚡ Ouvrir le catalogue rapide
                </button>
                <button
                  type="button"
                  onClick={onAddItemClick}
                  className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  + Ajouter un produit
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelectedZone('all');
                  setOnlyExpiring(false);
                  setSearchQuery('');
                }}
                className="min-h-[40px] px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Afficher tout le stock
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-2xs">
          {filteredItems.map((item) => {
            const daysLeft = getDaysUntilExpiration(item.expirationDate);
            const isNonPerishable =
              item.zone === 'household' || item.name.toLowerCase().includes('couche');
            const isUrgent = !isNonPerishable && daysLeft <= 2;
            const isSoon = !isNonPerishable && daysLeft > 2 && daysLeft <= 5;
            const isAddedToCart = addedToCartId === item.id;

            return (
              <div
                key={item.id}
                className={`p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  isUrgent ? 'bg-rose-50/30' : 'hover:bg-slate-50/70'
                }`}
              >
                {/* Left: Emoji + Title + Clean Subtitle */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg shrink-0">
                    {getCategoryEmoji(item.category)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{item.name}</h3>
                      {!isNonPerishable && (
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums ${
                            daysLeft < 0
                              ? 'bg-rose-600 text-white'
                              : isUrgent
                              ? 'bg-rose-100 text-rose-800'
                              : isSoon
                              ? 'bg-amber-100 text-amber-900'
                              : 'text-slate-400 font-medium px-0'
                          }`}
                        >
                          {daysLeft < 0
                            ? 'Périmé'
                            : daysLeft === 0
                            ? "Aujourd'hui"
                            : daysLeft <= 5
                            ? `J-${daysLeft}`
                            : `DLC ${new Date(item.expirationDate).toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                              })}`}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {getZoneLabel(item.zone)} ·{' '}
                      <strong className="text-slate-700 tabular-nums">
                        {item.quantity} {item.unit}
                      </strong>
                      {item.notes ? ` · ${item.notes}` : ''}
                    </p>
                  </div>
                </div>

                {/* Right: Touch-Friendly Stepper & Contextual Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {/* Quantity Stepper */}
                  <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200/70">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.id, -1)}
                      className="w-8 h-8 rounded-lg bg-white text-slate-700 font-bold text-sm hover:bg-slate-200 cursor-pointer flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="px-3 text-xs font-extrabold text-slate-900 tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.id, 1)}
                      className="w-8 h-8 rounded-lg bg-white text-slate-700 font-bold text-sm hover:bg-slate-200 cursor-pointer flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Contextual Freezer -> Fridge Thaw Button */}
                    {item.zone === 'freezer' && onThawItemToFridge && (
                      <button
                        type="button"
                        onClick={() => onThawItemToFridge(item.id)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        title="Décongeler 1 portion au frigo (DLC 48h automatique)"
                      >
                        <Snowflake className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>Décongeler</span>
                      </button>
                    )}

                    {/* Add to Shopping List */}
                    <button
                      type="button"
                      onClick={() => {
                        onAddToShopping(item);
                        setAddedToCartId(item.id);
                        setTimeout(() => setAddedToCartId(null), 1500);
                      }}
                      className={`min-h-[36px] min-w-[36px] p-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center ${
                        isAddedToCart
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                      title="Ajouter à la liste de courses"
                    >
                      {isAddedToCart ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <ShoppingCart className="w-4 h-4" />
                      )}
                    </button>

                    {/* Consume 1 unit */}
                    <button
                      type="button"
                      onClick={() => onConsumeItem(item.id)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      title="Marquer 1 unité comme consommée / terminée"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Utilisé</span>
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id)}
                      className="min-h-[36px] min-w-[36px] p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer flex items-center justify-center"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
