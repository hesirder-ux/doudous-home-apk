import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DriveBrandCode,
  FamilyPreferences,
  FoodCategory,
  ShoppingItem,
  Language,
} from '../types';
import { EVERYDAY_STAPLES_CATALOG } from '../data/initialData';
import { LeclercDriveSenderModal } from './LeclercDriveSenderModal';
import {
  buildAndroidDriveAppIntentUrl,
  buildDirectDriveItemUrl,
  buildLeclercCartOrderUrl,
  buildLeclercInPageAssistantScript,
  buildOptimizedDriveQuery,
  DRIVE_BRANDS_CATALOG,
  estimateIngredientPrice,
  formatShoppingListAsCsv,
  formatShoppingListForLeclercExport,
  getHouseholdPortionSummary,
  getSmartDriveFormatSuggestions,
  inferIngredientCategory,
  LECLERC_DRIVE_STORE_PRESETS,
  normalizeLeclercStoreUrl,
} from '../utils/portionScaler';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  ExternalLink,
  Link2,
  PackageCheck,
  PackagePlus,
  Plus,
  RotateCcw,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';

interface ShoppingViewProps {
  items: ShoppingItem[];
  lang: Language;
  familyProfile?: FamilyPreferences;
  onUpdateHouseholdSize?: (newSize: number) => void;
  weeklyBudget?: number;
  onUpdateWeeklyBudget?: (newBudget: number) => void;
  onUpdateItemPriceOrQty?: (
    id: string,
    updates: { quantity?: number; estimatedPrice?: number }
  ) => void;
  onToggleItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onAddItem: (item: Omit<ShoppingItem, 'id'>) => void;
  onClearChecked: () => void;
  onClearAll?: () => void;
  onRestoreItems?: (items: ShoppingItem[]) => void;
  onFinishShoppingAndStore: () => void;
  onOpenLoyaltyCards?: () => void;
  loyaltyCardsCount?: number;
  onUpdateDriveSpec?: (canonicalKey: string, spec: string) => void;
  onUpdateDriveProductUrl?: (canonicalKey: string, url: string) => void;
  onUpdateLeclercStoreUrl?: (storeUrl: string) => void;
  onUpdatePreferredDriveBrand?: (brand: DriveBrandCode) => void;
}

const AISLE_ORDER: Array<{
  id: string;
  label: string;
  categories: FoodCategory[];
}> = [
  {
    id: 'produce',
    label: '🥦 Fruits & Légumes',
    categories: ['vegetables', 'fruits'],
  },
  {
    id: 'meat_fish',
    label: '🥩 Boucherie, Volaille & Poissonnerie',
    categories: ['meat_fish'],
  },
  {
    id: 'bakery',
    label: '🥖 Boulangerie & Pains',
    categories: ['bakery'],
  },
  {
    id: 'dairy',
    label: '🥛 Frais, Crèmerie, Beurre & Œufs',
    categories: ['dairy'],
  },
  {
    id: 'pantry',
    label: '🥫 Épicerie & Boissons',
    categories: ['pantry', 'beverages', 'other'],
  },
  {
    id: 'baby',
    label: '🍼 Bébé, Lait & Couches',
    categories: ['baby_care', 'breast_milk'],
  },
  {
    id: 'household',
    label: '🧺 Ménage & Hygiène',
    categories: ['household', 'hygiene'],
  },
  {
    id: 'frozen',
    label: '🧊 Surgelés',
    categories: ['frozen'],
  },
];

export const ShoppingView: React.FC<ShoppingViewProps> = ({
  items,
  familyProfile,
  onUpdateHouseholdSize,
  weeklyBudget = 130,
  onUpdateWeeklyBudget,
  onUpdateItemPriceOrQty,
  onToggleItem,
  onDeleteItem,
  onAddItem,
  onClearChecked,
  onClearAll,
  onRestoreItems,
  onFinishShoppingAndStore,
  onOpenLoyaltyCards,
  loyaltyCardsCount = 0,
  onUpdateDriveSpec,
  onUpdateDriveProductUrl,
  onUpdateLeclercStoreUrl,
  onUpdatePreferredDriveBrand,
}) => {
  const portionSummary = getHouseholdPortionSummary(familyProfile);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<FoodCategory>('vegetables');
  const [manualCategoryTouched, setManualCategoryTouched] = useState(false);
  const [customPrice, setCustomPrice] = useState<string>('1.50');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceVal, setEditingPriceVal] = useState<string>('');
  const [editingSpecItemId, setEditingSpecItemId] = useState<string | null>(null);
  const [editingSpecVal, setEditingSpecVal] = useState<string>('');
  const [editingProductUrlVal, setEditingProductUrlVal] = useState<string>('');
  const [showCatalog, setShowCatalog] = useState(false);
  const [inStoreMode, setInStoreMode] = useState(false);
  const [isDriveAssistantOpen, setIsDriveAssistantOpen] = useState(false);
  const [driveModalTab, setDriveModalTab] = useState<'step' | 'inject' | 'list'>('step');
  const [driveStepCursor, setDriveStepCursor] = useState(0);
  const [driveFeedbackToast, setDriveFeedbackToast] = useState<string | null>(null);
  const [driveCustomSpecInput, setDriveCustomSpecInput] = useState('');
  const [driveCustomUrlInput, setDriveCustomUrlInput] = useState('');
  const [leclercStoreInput, setLeclercStoreInput] = useState(
    familyProfile?.leclercStoreUrl || ''
  );
  const [isEditingStoreUrl, setIsEditingStoreUrl] = useState(false);
  const [preferNativeDriveApp, setPreferNativeDriveApp] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('doudous_v5_prefer_native_drive_app');
      if (saved !== null) return saved === 'true';
      return true;
    } catch {
      return true;
    }
  });
  const [lastAutoCheckedItemId, setLastAutoCheckedItemId] = useState<string | null>(null);
  const [copiedClipItems, setCopiedClipItems] = useState<Record<string, boolean>>({});
  const [lastClearedBackup, setLastClearedBackup] = useState<ShoppingItem[] | null>(null);
  const [catalogFilter, setCatalogFilter] = useState<
    | 'all'
    | 'alimentaire'
    | 'bebe'
    | 'menage_linge'
    | 'vaisselle_cuisine'
    | 'entretien_wc'
    | 'hygiene_sdb'
  >('all');
  const [finishSuccess, setFinishSuccess] = useState(false);
  const [localBudget, setLocalBudget] = useState<number>(() => {
    const saved = localStorage.getItem('doudous_v3_weekly_budget');
    return saved ? Number(saved) : weeklyBudget;
  });
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [isLeclercSenderOpen, setIsLeclercSenderOpen] = useState(false);
  const [collapsedAisles, setCollapsedAisles] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('doudous_v3_collapsed_aisles');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const isAndroid =
    typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');
  const activeDriveBrandCode: DriveBrandCode = familyProfile?.preferredDriveBrand || 'leclerc';
  const activeDriveBrand =
    DRIVE_BRANDS_CATALOG[activeDriveBrandCode] || DRIVE_BRANDS_CATALOG.leclerc;
  const driveSpecs = familyProfile?.driveProductSpecs || {};
  const driveProductUrls = familyProfile?.driveProductUrls || {};
  const savedLeclercStoreUrl =
    familyProfile?.leclercStoreUrl ||
    'https://www.leclercdrive.fr/region-bretagne/vitre/drive-vitre.aspx';
  const normalizedStoreBase = normalizeLeclercStoreUrl(savedLeclercStoreUrl);

  const handleToggleNativeDriveApp = (val: boolean) => {
    setPreferNativeDriveApp(val);
    try {
      localStorage.setItem('doudous_v5_prefer_native_drive_app', String(val));
    } catch {
      // ignore
    }
  };

  const toggleAisleCollapsed = (aisleId: string) => {
    setCollapsedAisles((prev) => {
      const next = { ...prev, [aisleId]: !prev[aisleId] };
      localStorage.setItem('doudous_v3_collapsed_aisles', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (weeklyBudget && weeklyBudget !== localBudget) {
      setLocalBudget(weeklyBudget);
    }
  }, [weeklyBudget]);

  useEffect(() => {
    setLeclercStoreInput(familyProfile?.leclercStoreUrl || '');
  }, [familyProfile?.leclercStoreUrl]);

  const checkedCount = items.filter((i) => i.checked).length;
  const uncheckedCount = items.length - checkedCount;

  // Ordered unchecked items by supermarket aisle order for the Step-by-Step Drive Assistant
  const orderedUncheckedItems = AISLE_ORDER.flatMap((aisle) =>
    items
      .filter((item) => !item.checked && aisle.categories.includes(item.category))
      .map((item) => ({ item, aisleLabel: aisle.label }))
  );

  const safeDriveCursor =
    orderedUncheckedItems.length > 0
      ? Math.min(driveStepCursor, orderedUncheckedItems.length - 1)
      : 0;
  const currentDriveEntry = orderedUncheckedItems[safeDriveCursor] || null;

  // Sync custom spec & product URL input whenever the active step item changes
  useEffect(() => {
    if (currentDriveEntry) {
      const qInfo = buildOptimizedDriveQuery(currentDriveEntry.item.name, driveSpecs);
      setDriveCustomSpecInput(qInfo.savedSpec);
      setDriveCustomUrlInput(driveProductUrls[qInfo.canonicalKey] || '');
    } else {
      setDriveCustomSpecInput('');
      setDriveCustomUrlInput('');
    }
  }, [
    currentDriveEntry?.item.id,
    familyProfile?.driveProductSpecs,
    familyProfile?.driveProductUrls,
  ]);

  const triggerDriveToast = (msg: string) => {
    setDriveFeedbackToast(msg);
    setTimeout(() => {
      setDriveFeedbackToast((prev) => (prev === msg ? null : prev));
    }, 2600);
  };

  const handleSaveDriveSpecForProduct = (rawProductName: string, specValue: string) => {
    if (!onUpdateDriveSpec) return;
    const qInfo = buildOptimizedDriveQuery(rawProductName, driveSpecs);
    onUpdateDriveSpec(qInfo.canonicalKey, specValue.trim());
  };

  const handleSaveDriveUrlForProduct = (rawProductName: string, urlValue: string) => {
    if (!onUpdateDriveProductUrl) return;
    const qInfo = buildOptimizedDriveQuery(rawProductName, driveSpecs);
    onUpdateDriveProductUrl(qInfo.canonicalKey, urlValue.trim());
  };

  const handleSaveLeclercStoreUrl = () => {
    if (!onUpdateLeclercStoreUrl) return;
    const clean = normalizeLeclercStoreUrl(leclercStoreInput);
    onUpdateLeclercStoreUrl(clean || leclercStoreInput.trim());
    setIsEditingStoreUrl(false);
    triggerDriveToast(
      clean
        ? `✓ Magasin E.Leclerc Drive enregistré (${clean.replace(/^https?:\/\//, '')})`
        : '✓ Préférence magasin mise à jour'
    );
  };

  const handleDriveCopyAndCheckNext = async (targetItem: ShoppingItem) => {
    const qInfo = buildOptimizedDriveQuery(targetItem.name, driveSpecs);
    try {
      await navigator.clipboard.writeText(qInfo.fullQuery);
    } catch {
      // ignore clipboard fallback
    }
    if (!targetItem.checked) {
      setLastAutoCheckedItemId(targetItem.id);
      onToggleItem(targetItem.id);
    }
    triggerDriveToast(`✓ « ${qInfo.fullQuery} » copié & coché !`);
  };

  const handleDriveOpenSearchAndCheck = async (targetItem: ShoppingItem) => {
    const qInfo = buildOptimizedDriveQuery(targetItem.name, driveSpecs);
    try {
      await navigator.clipboard.writeText(qInfo.fullQuery);
    } catch {
      // ignore
    }
    if (!targetItem.checked) {
      setLastAutoCheckedItemId(targetItem.id);
      onToggleItem(targetItem.id);
    }
    triggerDriveToast(`✓ « ${qInfo.fullQuery} » copié & bascule vers ${activeDriveBrand.shortName}...`);
  };

  // Copies unchecked items one by one into Android's Gboard / Samsung Keyboard clipboard history
  const handlePreloadAndroidKeyboardClipboard = async () => {
    const targetList = orderedUncheckedItems.length > 0
      ? orderedUncheckedItems.map((e) => e.item)
      : items;
    const slice = targetList.slice(0, 12).reverse();
    if (slice.length === 0) return;

    try {
      for (let i = 0; i < slice.length; i++) {
        const qInfo = buildOptimizedDriveQuery(slice[i].name, driveSpecs);
        await navigator.clipboard.writeText(qInfo.fullQuery);
        await new Promise((r) => setTimeout(r, 140));
      }
      triggerDriveToast(
        `⌨️ ${slice.length} articles chargés dans le presse-papier de votre clavier Android (icône 📋) !`
      );
    } catch {
      triggerDriveToast('📋 Articles copiés dans le presse-papier !');
    }
  };

  const handleShareOrCopyFullDriveList = async (useNativeShare: boolean) => {
    const text = formatShoppingListForLeclercExport(
      items,
      driveSpecs,
      activeDriveBrand.name
    );
    if (useNativeShare && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Liste ${activeDriveBrand.name}`,
          text,
        });
        triggerDriveToast('✓ Liste envoyée vers votre téléphone !');
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      triggerDriveToast('📋 Liste complète copiée dans le presse-papier !');
    } catch {
      // ignore
    }
  };

  const handleDownloadCsvDriveList = () => {
    const csvContent = formatShoppingListAsCsv(items, driveSpecs);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `liste-leclerc-drive-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerDriveToast('📄 Fichier CSV Leclerc Drive téléchargé !');
  };

  const leclercCartOrder = buildLeclercCartOrderUrl(
    items,
    driveSpecs,
    savedLeclercStoreUrl
  );
  const inPageScriptInfo = buildLeclercInPageAssistantScript(items, driveSpecs);

  const handleCopySingleCleanItemToClipboard = async (item: ShoppingItem) => {
    const qInfo = buildOptimizedDriveQuery(item.name, driveSpecs);
    try {
      await navigator.clipboard.writeText(qInfo.fullQuery);
    } catch {
      // ignore
    }
    setCopiedClipItems((prev) => ({ ...prev, [item.id]: true }));
    triggerDriveToast(`📋 « ${qInfo.fullQuery} » ajouté en case séparée dans votre Presse-papiers !`);
  };

  const handlePasserCommandeDrive = async () => {
    try {
      if (leclercCartOrder.firstCleanQuery) {
        await navigator.clipboard.writeText(leclercCartOrder.firstCleanQuery);
      }
    } catch {
      // ignore clipboard errors
    }
    triggerDriveToast(
      `🛒 « ${leclercCartOrder.firstCleanQuery || 'Liste'} » copié & ouverture de Leclerc Drive !`
    );
  };

  const handleUndoLastDriveCheck = () => {
    if (!lastAutoCheckedItemId) return;
    const found = items.find((i) => i.id === lastAutoCheckedItemId);
    if (found && found.checked) {
      onToggleItem(found.id);
      triggerDriveToast(`↩ « ${found.name} » remis dans la liste à préparer`);
    }
    setLastAutoCheckedItemId(null);
  };

  const totalEstimatedBasket = items.reduce(
    (sum, item) => sum + (item.estimatedPrice || 2.2) * (item.quantity || 1),
    0
  );
  const totalCheckedCaddie = items
    .filter((i) => i.checked)
    .reduce((sum, item) => sum + (item.estimatedPrice || 2.2) * (item.quantity || 1), 0);

  const budgetPercent =
    localBudget > 0 ? Math.min(100, Math.round((totalEstimatedBasket / localBudget) * 100)) : 0;
  const isOverBudget = localBudget > 0 && totalEstimatedBasket > localBudget;

  const handleSaveBudget = (val: number) => {
    const clean = Math.max(20, val || 130);
    setLocalBudget(clean);
    localStorage.setItem('doudous_v3_weekly_budget', String(clean));
    if (onUpdateWeeklyBudget) {
      onUpdateWeeklyBudget(clean);
    }
    setIsEditingBudget(false);
  };

  const handleCustomNameChange = (val: string) => {
    setCustomName(val);
    if (val.trim().length >= 2) {
      const estimated = estimateIngredientPrice(val.trim(), '1 pièce');
      setCustomPrice(estimated.toFixed(2));
      if (!manualCategoryTouched) {
        setCustomCategory(inferIngredientCategory(val.trim()));
      }
    } else if (!val.trim()) {
      setManualCategoryTouched(false);
    }
  };

  const handleCustomAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;

    const parsedPrice = parseFloat(customPrice.replace(',', '.'));
    const fallbackPrice = estimateIngredientPrice(customName.trim(), '1 pièce');
    const resolvedCategory = manualCategoryTouched
      ? customCategory
      : inferIngredientCategory(customName.trim());

    onAddItem({
      name: customName.trim(),
      category: resolvedCategory,
      quantity: 1,
      unit: 'pièce(s)',
      estimatedPrice: !isNaN(parsedPrice) && parsedPrice > 0 ? parsedPrice : fallbackPrice,
      checked: false,
      source: 'manual',
    });

    setCustomName('');
    setManualCategoryTouched(false);
  };

  const handleClearAllOneGesture = () => {
    if (items.length === 0 || !onClearAll) return;
    setLastClearedBackup([...items]);
    onClearAll();
  };

  const handleUndoClearAll = () => {
    if (lastClearedBackup && onRestoreItems) {
      onRestoreItems(lastClearedBackup);
      setLastClearedBackup(null);
    }
  };

  const handleFinishClick = () => {
    onFinishShoppingAndStore();
    setFinishSuccess(true);
    setInStoreMode(false);
    setIsDriveAssistantOpen(false);
    setTimeout(() => setFinishSuccess(false), 2000);
  };

  const groupedAisles = AISLE_ORDER.map((aisle) => {
    const aisleItems = items.filter((item) => aisle.categories.includes(item.category));
    return {
      ...aisle,
      items: aisleItems,
    };
  }).filter((aisle) => aisle.items.length > 0);

  const areAllAislesCollapsed =
    groupedAisles.length > 0 && groupedAisles.every((a) => Boolean(collapsedAisles[a.id]));

  const handleToggleAllAisles = () => {
    const nextState: Record<string, boolean> = {};
    if (!areAllAislesCollapsed) {
      groupedAisles.forEach((a) => {
        nextState[a.id] = true;
      });
    }
    setCollapsedAisles(nextState);
    localStorage.setItem('doudous_v3_collapsed_aisles', JSON.stringify(nextState));
  };

  return (
    <div className="space-y-4">
      {/* 1. UNIFIED TOP TOOLBAR: Budget Summary + Quick Add Input + Drive Assistant + Store Mode */}
      {!inStoreMode ? (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 shadow-2xs">
          {/* Top Metrics Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                Total liste ({items.length}) :{' '}
                <strong
                  className={`text-sm font-extrabold tabular-nums ${
                    isOverBudget ? 'text-rose-600' : 'text-slate-900'
                  }`}
                >
                  {totalEstimatedBasket.toFixed(2)} €
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                Caddie coché :{' '}
                <strong className="text-emerald-700 font-bold tabular-nums">
                  {totalCheckedCaddie.toFixed(2)} €
                </strong>
              </span>
              <span className="text-slate-300 hidden sm:inline">·</span>
              {isEditingBudget ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min={20}
                    step={5}
                    value={localBudget}
                    onChange={(e) => setLocalBudget(Number(e.target.value))}
                    className="w-16 px-2 py-0.5 bg-slate-50 border border-slate-300 rounded text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveBudget(localBudget)}
                    className="px-2 py-0.5 bg-slate-900 text-white rounded text-[11px] font-bold cursor-pointer"
                  >
                    OK
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingBudget(true)}
                  className="text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Budget : <strong className="tabular-nums">{localBudget} €</strong> ✎
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Adults Size Stepper (children are never counted as adults) */}
              <div
                className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200"
                title="Nombre d'adultes pour calibrer les quantités des recettes (hors enfants)"
              >
                <Users className="w-3.5 h-3.5 text-emerald-700" />
                <span className="text-slate-600 font-semibold">Adultes :</span>
                {onUpdateHouseholdSize && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateHouseholdSize(Math.max(1, portionSummary.adultsCount - 1))
                    }
                    className="w-5 h-5 rounded bg-white border border-slate-300 text-slate-700 font-bold cursor-pointer flex items-center justify-center"
                  >
                    -
                  </button>
                )}
                <strong className="px-0.5 text-slate-900 font-extrabold tabular-nums">
                  {portionSummary.adultsCount} ad.
                </strong>
                {onUpdateHouseholdSize && (
                  <button
                    type="button"
                    onClick={() => onUpdateHouseholdSize(portionSummary.adultsCount + 1)}
                    className="w-5 h-5 rounded bg-white border border-slate-300 text-slate-700 font-bold cursor-pointer flex items-center justify-center"
                  >
                    +
                  </button>
                )}
              </div>

              {/* 'Envoyer vers Leclerc Drive' Button (Capacitor InAppBrowser + DOM executeScript + multi-choice memory + recap) */}
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsLeclercSenderOpen(true)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  title="Envoyer la liste vers E.Leclerc Drive (Capacitor InAppBrowser / DOM executeScript)"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>Envoyer vers Leclerc Drive ({uncheckedCount || items.length})</span>
                </button>
              )}

              {/* Direct 'Passer commande Drive' Button */}
              {items.length > 0 && (
                <a
                  href={
                    preferNativeDriveApp
                      ? leclercCartOrder.launcherBridgeUrl
                      : leclercCartOrder.cartUrl
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handlePasserCommandeDrive}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  title={`Passer commande Drive (${leclercCartOrder.concatenatedSpecsAndQuantities})`}
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>Passer commande Drive</span>
                </a>
              )}

              {/* Step-by-Step E.Leclerc Drive Assistant Trigger */}
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDriveStepCursor(0);
                    setIsDriveAssistantOpen(true);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  title="Préparer votre Drive pas-à-pas avec vos formats habituels mémorisés"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>
                    Préparer {activeDriveBrand.shortName} ({uncheckedCount})
                  </span>
                </button>
              )}

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setInStoreMode(true)}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mode Magasin ({uncheckedCount})</span>
                </button>
              )}

              {checkedCount > 0 && (
                <button
                  type="button"
                  onClick={handleFinishClick}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {finishSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Rangé !</span>
                    </>
                  ) : (
                    <>
                      <PackageCheck className="w-3.5 h-3.5" />
                      <span>Ranger ({checkedCount})</span>
                    </>
                  )}
                </button>
              )}

              {items.length > 0 && onClearAll && (
                <button
                  type="button"
                  onClick={handleClearAllOneGesture}
                  title="Supprimer complètement toute la liste de courses d'un seul geste"
                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Tout vider</span>
                </button>
              )}
            </div>
          </div>

          {/* Slim Progress Bar */}
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isOverBudget ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>

          {/* Quick Add Input Form (Mobile-First Grid) */}
          <form onSubmit={handleCustomAdd} className="flex flex-col lg:flex-row gap-2 pt-1">
            <input
              type="text"
              placeholder="Ajouter un article aux courses (ex: Œufs, Beurre, Lait, Pain, Lessive...)"
              value={customName}
              onChange={(e) => handleCustomNameChange(e.target.value)}
              className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="grid grid-cols-2 sm:flex sm:flex-nowrap items-center gap-2">
              <select
                value={customCategory}
                onChange={(e) => {
                  setCustomCategory(e.target.value as FoodCategory);
                  setManualCategoryTouched(true);
                }}
                className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 truncate"
              >
                <option value="vegetables">🥦 Légumes</option>
                <option value="fruits">🍎 Fruits</option>
                <option value="dairy">🥛 Frais, Beurre & Œufs</option>
                <option value="meat_fish">🥩 Viande & Poisson</option>
                <option value="bakery">🥖 Boulangerie & Pain</option>
                <option value="pantry">🥫 Épicerie</option>
                <option value="beverages">🧃 Boissons</option>
                <option value="baby_care">🍼 Bébé & Couches</option>
                <option value="household">🧺 Ménage & Lessive</option>
                <option value="hygiene">🧼 Hygiène</option>
                <option value="frozen">🧊 Surgelés</option>
              </select>
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                <span className="text-[11px] text-slate-400 sm:hidden">Prix :</span>
                <div className="flex items-center ml-auto">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="w-12 text-xs font-bold text-slate-700 bg-transparent focus:outline-none text-right tabular-nums"
                    title="Prix estimé (€)"
                  />
                  <span className="text-xs text-slate-400 ml-1">€</span>
                </div>
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Ajouter</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCatalog(!showCatalog)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border shrink-0 cursor-pointer ${
                  showCatalog
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <PackagePlus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Catalogue</span>
                {showCatalog ? (
                  <ChevronUp className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                )}
              </button>
            </div>
          </form>

          {/* Collapsible Quick Staples Catalog */}
          {showCatalog && (
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                {[
                  { id: 'all', label: 'Tous' },
                  { id: 'alimentaire', label: '🥛 Alimentaire' },
                  { id: 'bebe', label: '🍼 Bébé' },
                  { id: 'menage_linge', label: '🧺 Lessive' },
                  { id: 'vaisselle_cuisine', label: '🍽️ Cuisine' },
                  { id: 'entretien_wc', label: '🧹 Sols & WC' },
                  { id: 'hygiene_sdb', label: '🧼 Hygiène' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCatalogFilter(tab.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                      catalogFilter === tab.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                {EVERYDAY_STAPLES_CATALOG.filter(
                  (s) => catalogFilter === 'all' || s.group === catalogFilter
                ).map((staple, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      onAddItem({
                        name: staple.name,
                        category: staple.category as FoodCategory,
                        quantity: 1,
                        unit: staple.unit,
                        estimatedPrice: staple.price,
                        checked: false,
                        source: 'fridge_staple',
                      })
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>{staple.icon}</span>
                    <span>{staple.name}</span>
                    <span className="text-[10px] text-slate-400">
                      ({staple.price.toFixed(2)}€)
                    </span>
                    <Plus className="w-3 h-3 text-emerald-600" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Focus In-Store Top Bar */
        <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              🛒 Mode En Magasin · Caddie : {totalCheckedCaddie.toFixed(2)} €
            </span>
            <h3 className="text-sm font-bold">
              Reste {uncheckedCount} article(s) à prendre ({checkedCount} dans le caddie)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onOpenLoyaltyCards && (
              <button
                type="button"
                onClick={onOpenLoyaltyCards}
                className="min-h-[38px] px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span>💳 Cartes ({loyaltyCardsCount})</span>
              </button>
            )}
            {checkedCount > 0 && (
              <button
                type="button"
                onClick={handleFinishClick}
                className="min-h-[38px] px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <PackageCheck className="w-4 h-4" />
                <span>Terminer & Ranger ({checkedCount})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setInStoreMode(false)}
              className="min-h-[38px] px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
            >
              Quitter
            </button>
          </div>
        </div>
      )}

      {/* Undo Banner if the user just cleared the entire list */}
      {lastClearedBackup && lastClearedBackup.length > 0 && items.length === 0 && (
        <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs shadow-md">
          <span>
            🗑️ Liste de courses vidée ({lastClearedBackup.length} article
            {lastClearedBackup.length > 1 ? 's' : ''} supprimé
            {lastClearedBackup.length > 1 ? 's' : ''}).
          </span>
          <div className="flex items-center gap-2">
            {onRestoreItems && (
              <button
                type="button"
                onClick={handleUndoClearAll}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Annuler et restaurer</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setLastClearedBackup(null)}
              className="px-2 py-1 text-slate-400 hover:text-white cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* 2. SUPERMARKET AISLES LIST */}
      {items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Votre liste de courses est vide</h3>
          <p className="text-xs text-slate-500 mt-1">
            Ajoutez vos besoins ci-dessus ou depuis vos recettes et votre menu de la semaine.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-semibold text-slate-500">
              Touchez un rayon pour le réduire ou l'ouvrir ({groupedAisles.length} rayon
              {groupedAisles.length > 1 ? 's' : ''})
            </span>
            <div className="flex items-center gap-3">
              {groupedAisles.length > 1 && (
                <button
                  type="button"
                  onClick={handleToggleAllAisles}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  {areAllAislesCollapsed ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Tout déplier</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Tout réduire</span>
                    </>
                  )}
                </button>
              )}
              {onClearAll && (
                <button
                  type="button"
                  onClick={handleClearAllOneGesture}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer toute la liste</span>
                </button>
              )}
            </div>
          </div>

          {groupedAisles.map((aisle) => {
            const totalAisleCount = aisle.items.length;
            const takenAisleCount = aisle.items.filter((i) => i.checked).length;
            const remainingAisleCount = totalAisleCount - takenAisleCount;
            const isAllTaken = totalAisleCount > 0 && remainingAisleCount === 0;
            const isCollapsed = Boolean(collapsedAisles[aisle.id]);

            return (
              <div
                key={aisle.id}
                className={`bg-white rounded-2xl border overflow-hidden shadow-2xs transition-colors ${
                  isAllTaken ? 'border-emerald-200 bg-slate-50/60' : 'border-slate-200'
                }`}
              >
                {/* Clickable Aisle Header to Collapse / Expand */}
                <button
                  type="button"
                  onClick={() => toggleAisleCollapsed(aisle.id)}
                  className={`w-full px-4 py-3 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                    isCollapsed ? '' : 'border-b border-slate-100'
                  } ${
                    isAllTaken
                      ? 'bg-emerald-50/50 hover:bg-emerald-50'
                      : 'bg-slate-50 hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isAllTaken && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <span
                      className={`text-xs sm:text-sm font-bold truncate ${
                        isAllTaken ? 'line-through text-slate-400' : 'text-slate-800'
                      }`}
                    >
                      {aisle.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isAllTaken ? (
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-bold tabular-nums">
                        {takenAisleCount} pris / 0 restant ✓
                      </span>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-bold tabular-nums ${
                          takenAisleCount > 0
                            ? 'bg-amber-50 border border-amber-200 text-amber-900'
                            : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                      >
                        {takenAisleCount} pris / {remainingAisleCount} restant
                        {remainingAisleCount > 1 ? 's' : ''}
                      </span>
                    )}

                    {isCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-slate-100">
                    {aisle.items.map((item) => {
                      const lineTotal = (
                        (item.estimatedPrice || 2.2) * (item.quantity || 1)
                      ).toFixed(2);
                      const directInfo = buildDirectDriveItemUrl(
                        item.name,
                        activeDriveBrandCode,
                        driveSpecs,
                        driveProductUrls,
                        savedLeclercStoreUrl
                      );
                      const qInfo = directInfo.queryInfo;
                      const isEditingSpec = editingSpecItemId === item.id;
                      const suggestions = getSmartDriveFormatSuggestions(
                        item.name,
                        item.category
                      );

                      return (
                        <div key={item.id} className="transition-colors">
                          <div
                            onClick={() => onToggleItem(item.id)}
                            className={`${
                              inStoreMode ? 'p-4' : 'p-3.5'
                            } flex items-center justify-between gap-3 cursor-pointer ${
                              item.checked ? 'bg-slate-50/70 text-slate-400' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {item.checked ? (
                                <CheckCircle2
                                  className={`${
                                    inStoreMode ? 'w-6 h-6' : 'w-5 h-5'
                                  } text-emerald-600 shrink-0`}
                                />
                              ) : (
                                <Circle
                                  className={`${
                                    inStoreMode ? 'w-6 h-6' : 'w-5 h-5'
                                  } text-slate-300 shrink-0`}
                                />
                              )}
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p
                                    className={`${
                                      inStoreMode ? 'text-base' : 'text-sm'
                                    } font-bold truncate ${
                                      item.checked ? 'line-through text-slate-400' : 'text-slate-900'
                                    }`}
                                  >
                                    {item.name}
                                  </p>
                                  {qInfo.savedSpec && (
                                    <span className="text-[11px] font-semibold text-blue-700">
                                      · {qInfo.savedSpec}
                                    </span>
                                  )}
                                  {directInfo.isDirectProductUrl && (
                                    <span className="text-[10px] font-bold text-emerald-700">
                                      · Lien fiche directe
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 truncate">
                                  <strong className="text-slate-700">
                                    {/^\d/.test((item.unit || '').trim())
                                      ? item.quantity > 1
                                        ? `${item.quantity} × (${item.unit})`
                                        : item.unit
                                      : `${item.quantity} ${item.unit}`}
                                  </strong>
                                  {item.notes ? ` · ${item.notes}` : ''}
                                </p>
                              </div>
                            </div>

                            {!inStoreMode && (
                              <div
                                className="flex items-center gap-1.5 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* 1-Tap Direct Open in E.Leclerc Drive App / Web & Check */}
                                <a
                                  href={
                                    preferNativeDriveApp
                                      ? directInfo.androidAppIntentUrl
                                      : directInfo.url
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => handleDriveOpenSearchAndCheck(item)}
                                  title={`Ouvrir ${activeDriveBrand.name} pour « ${qInfo.fullQuery} » (mot-clé copié automatiquement)`}
                                  className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  {preferNativeDriveApp ? (
                                    <Smartphone className="w-3 h-3 shrink-0" />
                                  ) : (
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  )}
                                  <span className="hidden md:inline">
                                    {preferNativeDriveApp
                                      ? 'Appli Leclerc Drive'
                                      : 'Magasin Leclerc Drive'}
                                  </span>
                                </a>

                                {onUpdateDriveSpec && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isEditingSpec) {
                                        setEditingSpecItemId(null);
                                      } else {
                                        setEditingSpecItemId(item.id);
                                        setEditingSpecVal(qInfo.savedSpec);
                                        setEditingProductUrlVal(
                                          driveProductUrls[qInfo.canonicalKey] || ''
                                        );
                                      }
                                    }}
                                    title="Mémoriser votre format habituel ou le lien direct du produit pour le Drive"
                                    className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                                      qInfo.savedSpec || directInfo.isDirectProductUrl
                                        ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    <Tag className="w-3 h-3 shrink-0" />
                                    <span className="hidden sm:inline">
                                      {qInfo.savedSpec ? 'Format' : '+ Format'}
                                    </span>
                                  </button>
                                )}

                                {onUpdateItemPriceOrQty && (
                                  <div className="hidden sm:flex items-center bg-slate-100 rounded-lg p-0.5 text-xs">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onUpdateItemPriceOrQty(item.id, {
                                          quantity: Math.max(1, (item.quantity || 1) - 1),
                                        })
                                      }
                                      className="w-6 h-6 rounded-md bg-white text-slate-700 font-bold cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <span className="px-2 font-bold text-slate-800 tabular-nums">
                                      {item.quantity}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onUpdateItemPriceOrQty(item.id, {
                                          quantity: (item.quantity || 1) + 1,
                                        })
                                      }
                                      className="w-6 h-6 rounded-md bg-white text-slate-700 font-bold cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                )}

                                {editingPriceId === item.id && onUpdateItemPriceOrQty ? (
                                  <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-300 rounded-lg px-1.5 py-0.5">
                                    <input
                                      type="number"
                                      step="0.05"
                                      min="0.05"
                                      autoFocus
                                      value={editingPriceVal}
                                      onChange={(e) => setEditingPriceVal(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const parsed = parseFloat(
                                            editingPriceVal.replace(',', '.')
                                          );
                                          if (!isNaN(parsed) && parsed > 0) {
                                            onUpdateItemPriceOrQty(item.id, {
                                              estimatedPrice: parsed,
                                            });
                                          }
                                          setEditingPriceId(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingPriceId(null);
                                        }
                                      }}
                                      className="w-14 text-xs font-bold text-emerald-950 bg-white border border-emerald-200 rounded px-1 py-0.5 text-right focus:outline-none tabular-nums"
                                    />
                                    <span className="text-[11px] font-bold text-emerald-800">€</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const parsed = parseFloat(
                                          editingPriceVal.replace(',', '.')
                                        );
                                        if (!isNaN(parsed) && parsed > 0) {
                                          onUpdateItemPriceOrQty(item.id, {
                                            estimatedPrice: parsed,
                                          });
                                        }
                                        setEditingPriceId(null);
                                      }}
                                      className="px-1.5 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold cursor-pointer"
                                    >
                                      OK
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onUpdateItemPriceOrQty) {
                                        setEditingPriceId(item.id);
                                        setEditingPriceVal(
                                          (item.estimatedPrice || 1.5).toFixed(2)
                                        );
                                      }
                                    }}
                                    title="Cliquez pour modifier le prix unitaire"
                                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 text-xs font-bold tabular-nums cursor-pointer"
                                  >
                                    {lineTotal} € <span className="text-[10px] opacity-60">✎</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => onDeleteItem(item.id)}
                                  className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg cursor-pointer"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Inline Drive Format + Direct Product Link Editor for this item */}
                          {isEditingSpec && onUpdateDriveSpec && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="px-4 pb-3.5 pt-2 bg-slate-50 border-t border-slate-100 space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-slate-700">
                                  Format & lien direct mémorisés pour « {qInfo.cleanName} » sur{' '}
                                  {activeDriveBrand.shortName} :
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setEditingSpecItemId(null)}
                                  className="text-[11px] text-slate-400 hover:text-slate-700 cursor-pointer"
                                >
                                  Fermer
                                </button>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {suggestions.map((sug) => {
                                  const active = qInfo.savedSpec.toLowerCase() === sug.toLowerCase();
                                  return (
                                    <button
                                      key={sug}
                                      type="button"
                                      onClick={() => {
                                        const nextVal = active ? '' : sug;
                                        setEditingSpecVal(nextVal);
                                        handleSaveDriveSpecForProduct(item.name, nextVal);
                                      }}
                                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                                        active
                                          ? 'bg-blue-600 text-white border-blue-600'
                                          : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                                      }`}
                                    >
                                      {active ? `✓ ${sug}` : `+ ${sug}`}
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={editingSpecVal}
                                  onChange={(e) => setEditingSpecVal(e.target.value)}
                                  placeholder="Format (ex: Pack 6x1L Bio, Marque Repère...)"
                                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
                                />
                                {onUpdateDriveProductUrl && (
                                  <input
                                    type="url"
                                    value={editingProductUrlVal}
                                    onChange={(e) => setEditingProductUrlVal(e.target.value)}
                                    placeholder="Optionnel : lien direct de la fiche produit Leclerc"
                                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs"
                                  />
                                )}
                              </div>

                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSaveDriveSpecForProduct(item.name, editingSpecVal);
                                    if (onUpdateDriveProductUrl) {
                                      handleSaveDriveUrlForProduct(item.name, editingProductUrlVal);
                                    }
                                    setEditingSpecItemId(null);
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                                >
                                  Mémoriser pour mes prochains Drives
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {checkedCount > 0 && !inStoreMode && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClearChecked}
                className="text-xs text-slate-400 hover:text-rose-600 font-medium cursor-pointer"
              >
                Vider les {checkedCount} article(s) coché(s) sans les stocker
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. DIRECT E.LECLERC DRIVE ASSISTANT MODAL / FULL-SCREEN DRAWER */}
      {isDriveAssistantOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={() => setIsDriveAssistantOpen(false)}
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-xs"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200"
            >
              {/* Modal Header */}
              <div className="p-4 bg-slate-900 text-white space-y-3 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-blue-400">
                      Connexion Directe & Auto-Panier · {activeDriveBrand.name}
                    </span>
                    <h3 className="text-base font-bold truncate">
                      Envoyer ma liste vers {activeDriveBrand.name}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDriveAssistantOpen(false)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Fermer</span>
                  </button>
                </div>

                {/* 3 Direct Modes Switcher */}
                <div className="grid grid-cols-3 gap-1 bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setDriveModalTab('step')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      driveModalTab === 'step'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    1. Appli Leclerc Drive
                  </button>
                  <button
                    type="button"
                    onClick={() => setDriveModalTab('inject')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      driveModalTab === 'inject'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    2. Site Web + Script Robot
                  </button>
                  <button
                    type="button"
                    onClick={() => setDriveModalTab('list')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      driveModalTab === 'list'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    3. Liste & Export CSV
                  </button>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-300 tabular-nums">
                    <span>
                      {orderedUncheckedItems.length > 0
                        ? `Reste ${orderedUncheckedItems.length} article(s) à ajouter au Drive`
                        : 'Tous les articles sont cochés !'}
                    </span>
                    <span className="font-bold text-emerald-400">
                      {checkedCount} / {items.length} pris
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-200"
                      style={{
                        width: `${
                          items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Feedback Toast inside Assistant */}
              {driveFeedbackToast && (
                <div className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold flex items-center justify-between gap-2 shrink-0">
                  <span className="truncate">{driveFeedbackToast}</span>
                  {lastAutoCheckedItemId && (
                    <button
                      type="button"
                      onClick={handleUndoLastDriveCheck}
                      className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[11px] font-extrabold shrink-0 cursor-pointer"
                    >
                      Annuler
                    </button>
                  )}
                </div>
              )}

              {/* Scrollable Modal Body */}
              <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
                {/* Native Mobile App Connection Banner */}
                <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Smartphone className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-xs font-extrabold text-slate-900">
                        Presse-papiers & Application « Leclerc DRIVE »
                      </span>
                    </div>
                    <a
                      href={leclercCartOrder.launcherBridgeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handlePasserCommandeDrive}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>📱 Ouvrir l’appli Leclerc DRIVE →</span>
                    </a>
                  </div>

                  {/* 1-Tap Individual Pills for Xiaomi / Android Clipboard (1 tap = 1 separate card in Presse-papiers) */}
                  {orderedUncheckedItems.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-white border border-blue-200 space-y-1.5">
                      <span className="text-[11px] font-extrabold text-slate-800 block">
                        📋 Touchez chaque article ci-dessous (1 touche = 1 case propre dans votre Presse-papiers) :
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {orderedUncheckedItems.map(({ item: uItem }) => {
                          const q = buildOptimizedDriveQuery(uItem.name, driveSpecs).fullQuery;
                          const isCopied = Boolean(copiedClipItems[uItem.id]);
                          return (
                            <button
                              key={uItem.id}
                              type="button"
                              onClick={() => handleCopySingleCleanItemToClipboard(uItem)}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer flex items-center gap-1 ${
                                isCopied
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-slate-100 hover:bg-blue-50 text-slate-900 border-slate-300'
                              }`}
                            >
                              <span>{isCopied ? `✓ ${q}` : `+ ${q}`}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-700 leading-relaxed">
                    <strong>Pourquoi :</strong> l’application mobile <em>Leclerc DRIVE</em> est
                    verrouillée par E.Leclerc (aucune application externe ne peut écrire toute seule
                    dans <em>« De quoi avez-vous besoin ? »</em>). Et sur téléphone Android/Xiaomi,
                    le clavier ne crée <strong>une case séparée dans Presse-papiers</strong> que
                    lorsque vous touchez un bouton. Touchez les pastilles ci-dessus puis ouvrez{' '}
                    <strong>Leclerc DRIVE</strong> !
                  </p>

                  {/* Mode Switcher: Native App Leclerc DRIVE (Default) vs Store Web leclercdrive.fr */}
                  <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-blue-200">
                    <button
                      type="button"
                      onClick={() => handleToggleNativeDriveApp(true)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                        preferNativeDriveApp
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5 shrink-0" />
                      <span>📱 Ouvrir l’appli Leclerc DRIVE</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleNativeDriveApp(false)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                        !preferNativeDriveApp
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Store className="w-3.5 h-3.5 shrink-0" />
                      <span>🛒 Magasin leclercdrive.fr</span>
                    </button>
                  </div>

                  {/* Store Selector when using Web or customizing store */}
                  {activeDriveBrandCode === 'leclerc' && onUpdateLeclercStoreUrl && (
                    <div className="pt-1 border-t border-blue-200/70 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-600 truncate">
                        Magasin actif :{' '}
                        <strong className="text-slate-900">
                          {LECLERC_DRIVE_STORE_PRESETS.find((p) => p.url === normalizedStoreBase)
                            ?.label ||
                            (normalizedStoreBase
                              ? normalizedStoreBase.replace(/^https?:\/\//, '')
                              : 'E.Leclerc Drive Vitré (35500)')}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingStoreUrl((v) => !v)}
                        className="text-[11px] font-bold text-blue-700 hover:text-blue-900 shrink-0 cursor-pointer"
                      >
                        {isEditingStoreUrl ? 'Fermer' : 'Changer de Drive'}
                      </button>
                    </div>
                  )}

                  {isEditingStoreUrl && onUpdateLeclercStoreUrl && (
                    <div className="space-y-2 pt-1.5">
                      <span className="text-[11px] font-bold text-slate-700 block">
                        Choisissez votre magasin E.Leclerc Drive en 1 clic :
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {LECLERC_DRIVE_STORE_PRESETS.map((preset) => {
                          const isCurrent = normalizedStoreBase === preset.url;
                          return (
                            <button
                              key={preset.url}
                              type="button"
                              onClick={() => {
                                setLeclercStoreInput(preset.url);
                                onUpdateLeclercStoreUrl(preset.url);
                                setIsEditingStoreUrl(false);
                                triggerDriveToast(`✓ ${preset.label} sélectionné !`);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                                isCurrent
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                              }`}
                            >
                              {isCurrent ? `✓ ${preset.label}` : preset.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={leclercStoreInput}
                          onChange={(e) => setLeclercStoreInput(e.target.value)}
                          placeholder="Ville (ex: Vitré, 35500) ou URL leclercdrive.fr..."
                          className="flex-1 px-3 py-1.5 bg-white border border-blue-300 rounded-xl text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleSaveLeclercStoreUrl}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* TAB 1: STEP-BY-STEP DIRECT TO COURSES E.LECLERC APP */}
                {driveModalTab === 'step' && (
                  <>
                    {currentDriveEntry ? (
                      (() => {
                        const activeItem = currentDriveEntry.item;
                        const directInfo = buildDirectDriveItemUrl(
                          activeItem.name,
                          activeDriveBrandCode,
                          driveSpecs,
                          driveProductUrls,
                          savedLeclercStoreUrl
                        );
                        const qInfo = directInfo.queryInfo;
                        const suggestions = getSmartDriveFormatSuggestions(
                          activeItem.name,
                          activeItem.category
                        );

                        return (
                          <>
                            {/* Step Navigation Bar */}
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                              <button
                                type="button"
                                disabled={safeDriveCursor <= 0}
                                onClick={() => setDriveStepCursor((c) => Math.max(0, c - 1))}
                                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                <span>Précédent</span>
                              </button>

                              <span className="font-semibold text-slate-600 truncate text-center">
                                {currentDriveEntry.aisleLabel} ·{' '}
                                <strong className="tabular-nums text-slate-900">
                                  {safeDriveCursor + 1}/{orderedUncheckedItems.length}
                                </strong>
                              </span>

                              <button
                                type="button"
                                disabled={safeDriveCursor >= orderedUncheckedItems.length - 1}
                                onClick={() =>
                                  setDriveStepCursor((c) =>
                                    Math.min(orderedUncheckedItems.length - 1, c + 1)
                                  )
                                }
                                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <span>Passer</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Main Product Focus Card */}
                            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <span className="text-xs font-semibold text-slate-500">
                                    Produit à ajouter dans {activeDriveBrand.shortName} :
                                  </span>
                                  <h4 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-0.5">
                                    {activeItem.name}
                                  </h4>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[11px] text-slate-500 block">
                                    Quantité requise
                                  </span>
                                  <strong className="text-sm font-extrabold text-emerald-700 tabular-nums">
                                    {/^\d/.test((activeItem.unit || '').trim())
                                      ? activeItem.quantity > 1
                                        ? `${activeItem.quantity} × (${activeItem.unit})`
                                        : activeItem.unit
                                      : `${activeItem.quantity} ${activeItem.unit}`}
                                  </strong>
                                </div>
                              </div>

                              {activeItem.notes && (
                                <p className="text-xs text-slate-500">{activeItem.notes}</p>
                              )}

                              {/* Optimised Search Query Preview */}
                              <div className="p-3 rounded-xl bg-white border border-blue-200 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="text-[10px] font-bold text-blue-600 block">
                                    {directInfo.isDirectProductUrl
                                      ? 'Fiche produit E.Leclerc directe mémorisée :'
                                      : `Mot-clé calibré pour ${activeDriveBrand.shortName} :`}
                                  </span>
                                  <p className="text-sm font-extrabold text-slate-900 truncate">
                                    « {qInfo.fullQuery} »
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(qInfo.fullQuery);
                                      triggerDriveToast(`📋 « ${qInfo.fullQuery} » copié !`);
                                    } catch {
                                      // ignore
                                    }
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                                  title="Copier uniquement le texte sans cocher"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copier</span>
                                </button>
                              </div>
                            </div>

                            {/* Remembered Format / Brand / Pack Selector */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-800">
                                  Format habituel mémorisé (pack, bio, marque) :
                                </label>
                                {qInfo.savedSpec && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDriveCustomSpecInput('');
                                      handleSaveDriveSpecForProduct(activeItem.name, '');
                                    }}
                                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                                  >
                                    Effacer le format
                                  </button>
                                )}
                              </div>

                              {/* 1-Tap Quick Suggestions */}
                              <div className="flex flex-wrap gap-1.5">
                                {suggestions.map((sug) => {
                                  const isSelected =
                                    qInfo.savedSpec.toLowerCase() === sug.toLowerCase();
                                  return (
                                    <button
                                      key={sug}
                                      type="button"
                                      onClick={() => {
                                        const nextSpec = isSelected ? '' : sug;
                                        setDriveCustomSpecInput(nextSpec);
                                        handleSaveDriveSpecForProduct(activeItem.name, nextSpec);
                                      }}
                                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                                        isSelected
                                          ? 'bg-blue-600 text-white border-blue-600'
                                          : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                                      }`}
                                    >
                                      {isSelected ? `✓ ${sug}` : `+ ${sug}`}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Custom Format & Direct URL Inputs */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                <input
                                  type="text"
                                  value={driveCustomSpecInput}
                                  onChange={(e) => {
                                    setDriveCustomSpecInput(e.target.value);
                                    handleSaveDriveSpecForProduct(activeItem.name, e.target.value);
                                  }}
                                  placeholder="Format (ex: Pack 6x1L Bio, Boîte x12...)"
                                  className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {onUpdateDriveProductUrl && (
                                  <input
                                    type="url"
                                    value={driveCustomUrlInput}
                                    onChange={(e) => {
                                      setDriveCustomUrlInput(e.target.value);
                                      handleSaveDriveUrlForProduct(activeItem.name, e.target.value);
                                    }}
                                    placeholder="Optionnel : lien direct produit Leclerc"
                                    className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                )}
                              </div>
                            </div>

                            {/* Thumb-Zone Primary Action Buttons (>= 48px touch targets) */}
                            <div className="pt-2 space-y-2.5">
                              <a
                                href={
                                  preferNativeDriveApp
                                    ? directInfo.androidAppIntentUrl
                                    : directInfo.url
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => handleDriveOpenSearchAndCheck(activeItem)}
                                className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
                              >
                                {preferNativeDriveApp ? (
                                  <Smartphone className="w-4 h-4 shrink-0" />
                                ) : (
                                  <ExternalLink className="w-4 h-4 shrink-0" />
                                )}
                                <span>
                                  {preferNativeDriveApp
                                    ? `Ouvrir l’appli Leclerc DRIVE (« ${qInfo.fullQuery} » copié) & Cocher →`
                                    : directInfo.isDirectProductUrl
                                    ? `Ouvrir la fiche produit Leclerc Drive & Cocher →`
                                    : `🔍 Chercher « ${qInfo.fullQuery} » dans mon magasin leclercdrive.fr →`}
                                </span>
                              </a>

                              <button
                                type="button"
                                onClick={() => handleDriveCopyAndCheckNext(activeItem)}
                                className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                              >
                                <Copy className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span>
                                  Copier uniquement « {qInfo.fullQuery} » & Passer au suivant →
                                </span>
                              </button>
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      /* All items checked completion state */
                      <div className="py-6 text-center space-y-4">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-base font-extrabold text-slate-900">
                            Votre panier {activeDriveBrand.shortName} est terminé !
                          </h4>
                          <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            Tous les articles ({items.length}) ont été cochés. Vos formats préférés
                            sont mémorisés pour la semaine prochaine.
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                          {checkedCount > 0 && (
                            <button
                              type="button"
                              onClick={handleFinishClick}
                              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <PackageCheck className="w-4 h-4" />
                              <span>Terminer & Ranger dans mes stocks ({checkedCount})</span>
                            </button>
                          )}
                          {lastAutoCheckedItemId && (
                            <button
                              type="button"
                              onClick={handleUndoLastDriveCheck}
                              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                            >
                              ↩ Annuler le dernier article coché
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* TAB 2: SITE WEB LECLERCDRIVE.FR + SCRIPT ROBOT AUTO-PANIER (100% SUR TÉLÉPHONE) */}
                {driveModalTab === 'inject' && (
                  <div className="space-y-4">
                    {/* Block 0: ZERO-SCRIPT DIRECT SEARCH ON LECLERCDRIVE.FR (/magasin-XXXX) */}
                    <div className="p-4 rounded-2xl bg-emerald-950 text-white border border-emerald-500/50 space-y-3 shadow-md">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Store className="w-4 h-4 text-emerald-400 shrink-0" />
                          <h4 className="text-sm font-extrabold text-white">
                            ✨ Solution Sans Aucun Script : Recherche directe dans votre rayon Leclerc
                          </h4>
                        </div>
                        {normalizedStoreBase.includes('/magasin-') && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-extrabold shrink-0">
                            ✓ Rayon actif
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-emerald-100 leading-relaxed">
                        <strong>Pourquoi la recherche ne se lançait pas toute seule sur le site ?</strong> Parce que{' '}
                        <code className="bg-black/40 px-1 py-0.5 rounded text-emerald-300">drive-vitre.aspx</code> est la page d’accueil de présentation. Dès que vous appuyez sur{' '}
                        <strong>« Choisir ce drive »</strong> sur <em>leclercdrive.fr</em>, l’adresse en haut de votre téléphone devient celle des rayons de votre magasin (elle contient{' '}
                        <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300 font-bold">/magasin-...</code>).
                      </p>

                      <div className="p-3 rounded-xl bg-black/30 border border-emerald-500/30 space-y-2">
                        <label className="text-[11px] font-extrabold text-emerald-300 block">
                          👉 Copiez une seule fois l’adresse de votre magasin (après avoir cliqué sur « Choisir ce drive ») et collez-la ici :
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={leclercStoreInput}
                            onChange={(e) => setLeclercStoreInput(e.target.value)}
                            placeholder="Collez ici l'adresse avec /magasin-... (ex: https://fd12-courses.leclercdrive.fr/magasin-...)"
                            className="flex-1 px-3 py-2.5 bg-white text-slate-900 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                          <button
                            type="button"
                            onClick={handleSaveLeclercStoreUrl}
                            className="min-h-[42px] px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-extrabold cursor-pointer shrink-0"
                          >
                            Enregistrer mon rayon
                          </button>
                        </div>
                        <p className="text-[11px] text-emerald-200/90">
                          Une fois cette adresse <code className="text-white font-bold">/magasin-...</code> enregistrée, <strong>vous n’avez plus besoin d’aucun script</strong> : dans l’onglet 1, chaque clic sur <em>« Chercher dans mon magasin »</em> ouvrira directement la page de résultats du produit avec le bouton <strong>+</strong> !
                        </p>
                      </div>
                    </div>

                    {/* Block A: Site Web leclercdrive.fr + Script Robot Auto-Panier sur téléphone */}
                    <div className="p-4 rounded-2xl bg-slate-900 text-white border border-blue-500/40 space-y-3.5 shadow-md">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                          <h4 className="text-sm font-extrabold text-white">
                            🤖 Option Robot Auto-Panier sur leclercdrive.fr (corrigé sans espace)
                          </h4>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-blue-600 text-[10px] font-extrabold text-white shrink-0">
                          {inPageScriptInfo.itemsCount} article(s)
                        </span>
                      </div>

                      {/* Exact explanation of the user's PageDerreur.aspx & Google Search screenshots */}
                      <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-400/40 text-[11px] text-rose-100 space-y-1.5 leading-relaxed">
                        <strong className="text-amber-300 block">
                          🛠️ Correctif « Désolé, ce service est momentanément indisponible » (PageDerreur.aspx) :
                        </strong>
                        <p>
                          1. <strong>Pourquoi Leclerc affichait l’ardoise noire « service indisponible » :</strong> le serveur E.Leclerc bloque les cadres (<em>X-Frame-Options: DENY</em>) et renvoie vers <code className="bg-black/40 px-1 py-0.5 rounded text-white">PageDerreur.aspx</code> si on tente d’ouvrir <code className="bg-black/40 px-1 py-0.5 rounded text-white">/recherche.aspx</code> <em>avant</em> d’avoir cliqué sur <strong>« Choisir ce drive »</strong> ou avec un paramètre <code className="bg-black/40 px-1 py-0.5 rounded text-white">?panier=</code> sur <code className="bg-black/40 px-1 py-0.5 rounded text-white">drive-vitre.aspx</code>.
                        </p>
                        <p>
                          2. <strong>Ce qui est corrigé :</strong> le nouveau script ci-dessous <strong>n’utilise plus aucun cadre ni fausse URL</strong> : une fois que vous avez appuyé sur <strong>« Choisir ce drive »</strong>, il écrit directement chaque produit dans la vraie barre de recherche en haut de la page Leclerc !
                        </p>
                      </div>

                      {/* Step-by-step buttons for Mobile Web + Script */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(inPageScriptInfo.rawScript);
                              triggerDriveToast(
                                '🤖 Script SANS ESPACE copié ! Sur leclercdrive.fr, tapez javascript: puis collez.'
                              );
                            } catch {
                              // ignore
                            }
                          }}
                          className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                        >
                          <Copy className="w-4 h-4 shrink-0" />
                          <span>1A. Copier le Script SANS ESPACE (après « javascript: »)</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(inPageScriptInfo.bookmarkletHref);
                              triggerDriveToast(
                                '⭐ Script complet (avec "javascript:" et sans espace) copié pour Favori ⭐ !'
                              );
                            } catch {
                              // ignore
                            }
                          }}
                          className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Copy className="w-4 h-4 text-blue-400 shrink-0" />
                          <span>1B. Copier avec « javascript: » (pour Favori ⭐)</span>
                        </button>
                      </div>

                      <a
                        href={normalizedStoreBase || 'https://www.leclercdrive.fr'}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(inPageScriptInfo.rawScript);
                          } catch {
                            // ignore
                          }
                          triggerDriveToast(
                            '🛒 Ouverture de leclercdrive.fr + Script sans espace copié !'
                          );
                        }}
                        className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <ExternalLink className="w-4 h-4 shrink-0" />
                        <span>2. Ouvrir mon magasin sur leclercdrive.fr →</span>
                      </a>

                      {/* 2 ways on Chrome Android */}
                      <div className="p-3 rounded-xl bg-slate-800/90 border border-slate-700 text-[11px] text-slate-200 space-y-2 leading-relaxed">
                        <div className="font-extrabold text-blue-300">
                          📱 Comment l’exécuter sur l’onglet leclercdrive.fr sans tomber sur Google :
                        </div>
                        <div>
                          <strong>Méthode directe (Barre d’adresse) :</strong> Restez bien sur l’onglet <em>leclercdrive.fr</em> (après avoir cliqué sur « Choisir ce drive »). Touchez la barre d’adresse en haut, tapez <code className="bg-slate-950 px-1.5 py-0.5 rounded text-emerald-400 font-bold">javascript:</code> puis collez le script sans espace (bouton 1A). Regardez juste sous la barre d’adresse : <strong>touchez la suggestion avec l’icône Globe 🌐</strong> (ne touchez pas la loupe 🔍).
                        </div>
                        <div>
                          <strong>Méthode Favori ⭐ (100 % inratable sur Chrome Android) :</strong> Sur l’onglet <em>leclercdrive.fr</em>, ouvrez le menu Chrome <strong>⋮</strong> en haut à droite → touchez l’étoile <strong>⭐</strong> pour ajouter en favori → appuyez sur <em>« Modifier »</em> en bas → remplacez le nom par <strong className="text-amber-300">Robot</strong> et remplacez l’URL par le script complet (bouton 1B). Ensuite, sur <em>leclercdrive.fr</em>, tapez simplement <strong className="text-amber-300">Robot</strong> dans la barre d’adresse et <strong>touchez la ligne avec l’étoile ⭐ Robot</strong> qui apparaît juste en dessous !
                        </div>
                      </div>
                    </div>

                    {/* Block B: Alternative Clavier Android pour l'application native */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-blue-600 shrink-0" />
                        <h4 className="text-sm font-extrabold text-slate-900">
                          Alternative Appli : Remplir votre Presse-papiers (1 case par article)
                        </h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Si vous préférez rester dans l’application mobile <strong>Leclerc DRIVE</strong>, touchez chaque produit ci-dessous pour créer une case séparée dans <strong>Presse-papiers → Récents</strong> :
                      </p>

                      <div className="flex flex-wrap gap-2 py-1">
                        {(orderedUncheckedItems.length > 0
                          ? orderedUncheckedItems.map((e) => e.item)
                          : items
                        ).map((uItem) => {
                          const q = buildOptimizedDriveQuery(uItem.name, driveSpecs).fullQuery;
                          const isCopied = Boolean(copiedClipItems[uItem.id]);
                          return (
                            <button
                              key={uItem.id}
                              type="button"
                              onClick={() => handleCopySingleCleanItemToClipboard(uItem)}
                              className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                                isCopied
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white hover:bg-blue-50 text-slate-900 border-slate-300 shadow-2xs'
                              }`}
                            >
                              <Copy className="w-3.5 h-3.5 shrink-0" />
                              <span>{isCopied ? `✓ ${q} (copié)` : q}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: FULL 1-CLICK LIST, CSV EXPORT & NATIVE PHONE SHARE */}
                {driveModalTab === 'list' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleShareOrCopyFullDriveList(true)}
                        className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Partager la liste</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadCsvDriveList}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>📄 Télécharger CSV (.csv)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareOrCopyFullDriveList(false)}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                        <span>Tout copier</span>
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                      {items.map((it) => {
                        const dInfo = buildDirectDriveItemUrl(
                          it.name,
                          activeDriveBrandCode,
                          driveSpecs,
                          driveProductUrls,
                          savedLeclercStoreUrl
                        );
                        const qtyLabel = /^\d/.test((it.unit || '').trim())
                          ? it.quantity > 1
                            ? `${it.quantity} × (${it.unit})`
                            : it.unit
                          : `${it.quantity} ${it.unit}`;
                        return (
                          <div
                            key={it.id}
                            className={`p-3 flex items-center justify-between gap-2 ${
                              it.checked ? 'bg-slate-50 text-slate-400' : 'bg-white'
                            }`}
                          >
                            <div className="min-w-0">
                              <p
                                className={`text-xs font-extrabold truncate ${
                                  it.checked ? 'line-through text-slate-400' : 'text-slate-900'
                                }`}
                              >
                                {dInfo.queryInfo.fullQuery}
                              </p>
                              <span className="text-[11px] text-slate-500">{qtyLabel}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <a
                                href={
                                  preferNativeDriveApp
                                    ? dInfo.androidAppIntentUrl
                                    : dInfo.url
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => handleDriveOpenSearchAndCheck(it)}
                                className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                {preferNativeDriveApp ? (
                                  <Smartphone className="w-3 h-3 shrink-0" />
                                ) : (
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                )}
                                <span>
                                  {preferNativeDriveApp
                                    ? 'Appli Leclerc Drive'
                                    : 'Magasin Leclerc Drive'}
                                </span>
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Capacitor InAppBrowser & DOM Automation Modal ('Envoyer vers Leclerc Drive') */}
      <LeclercDriveSenderModal
        isOpen={isLeclercSenderOpen}
        onClose={() => setIsLeclercSenderOpen(false)}
        items={items}
        driveSpecs={driveSpecs}
        storeUrl={normalizedStoreBase || savedLeclercStoreUrl}
      />
    </div>
  );
};

