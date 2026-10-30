import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FamilyPreferences, FridgeItem, Language, Recipe, RecipeIngredient } from '../types';
import { translations } from '../i18n/translations';
import { getDetectedChildren } from './DailyHomeView';
import {
  doesRecipeContainExcludedFood,
  estimateIngredientPrice,
  getHouseholdPortionSummary,
  getRecipeCostBreakdown,
  scaleIngredientAmount,
} from '../utils/portionScaler';
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock,
  Filter,
  Flame,
  Home,
  Plus,
  Refrigerator,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Users,
  Utensils,
  X,
} from 'lucide-react';

export interface AiRecipeGenerateOptions {
  mode?: 'from_scratch' | 'fridge' | 'habits';
  theme?: string;
  customPrompt?: string;
}

interface RecipesViewProps {
  recipes: Recipe[];
  fridgeItems: FridgeItem[];
  familyProfile: FamilyPreferences;
  lang: Language;
  onAddMissingToShopping: (recipe: Recipe, targetServings?: number) => void;
  onAddToPlanner: (recipe: Recipe) => void;
  onGenerateAiRecipe: (options?: AiRecipeGenerateOptions) => Promise<void>;
  onImportRecipesFromText?: (rawText: string) => Promise<void>;
  isGeneratingAi: boolean;
  onUpdateFamilyProfile?: (updated: FamilyPreferences) => void;
  onNavigateToFamilyHabits?: () => void;
}

const AI_RECIPE_THEMES = [
  { id: 'Quotidien réalisable & rapide', label: '⚡ Express Semaine (< 25 min)' },
  { id: 'Classiques Familiaux & Réconfortants', label: '👨‍👩‍👧‍👦 Classiques Famille' },
  { id: 'Petit Budget & Courses Simples', label: '💶 Petit Budget (< 2,50€/pers)' },
  { id: 'Poulet & Volaille', label: '🍗 Poulet & Volaille' },
  { id: 'Pâtes, Riz & Gratins au Four', label: '🍝 Pâtes, Riz & Gratins' },
  { id: 'Poisson & Mer facile', label: '🐟 Poisson Facile' },
  { id: 'Végétarien Gourmand & Protéiné', label: '🥕 Végétarien Gourmand' },
  { id: 'Batch Cooking & Plats Mijotés', label: '🍲 Plats Mijotés / Four' },
];

export const RecipesView: React.FC<RecipesViewProps> = ({
  recipes,
  fridgeItems,
  familyProfile,
  lang,
  onAddMissingToShopping,
  onAddToPlanner,
  onGenerateAiRecipe,
  onImportRecipesFromText,
  isGeneratingAi,
  onUpdateFamilyProfile,
  onNavigateToFamilyHabits,
}) => {
  const t = translations[lang] || translations.fr;
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyFridgeStock, setOnlyFridgeStock] = useState<boolean>(false);
  const [onlyHabitualProducts, setOnlyHabitualProducts] = useState<boolean>(false);
  const [selectedFridgeIngredient, setSelectedFridgeIngredient] = useState<string | null>(null);
  const [onlyExpiringSoon, setOnlyExpiringSoon] = useState<boolean>(false);
  const [activeRecipeModal, setActiveRecipeModal] = useState<Recipe | null>(null);
  const [addedRecipeId, setAddedRecipeId] = useState<string | null>(null);
  const [showBabyPortionsGuide, setShowBabyPortionsGuide] = useState<boolean>(false);
  const [selectedBabyAgeBracket, setSelectedBabyAgeBracket] = useState<
    '4_5m' | '6_8m' | '9_11m' | '12_18m' | '19_36m'
  >('12_18m');

  // Active items in fridge/pantry & habitual products of the household
  const activeFridgeItems = fridgeItems.filter((item) => !item.consumed && item.quantity > 0);
  const habitualProducts = familyProfile.habitualProducts || [];
  const [quickHabitInput, setQuickHabitInput] = useState<string>('');

  // Household portion calibration (adults only, children are not counted as adults)
  const portionSummary = getHouseholdPortionSummary(familyProfile);
  const [targetServings, setTargetServings] = useState<number>(() => portionSummary.adultsCount);

  useEffect(() => {
    setTargetServings(portionSummary.adultsCount);
  }, [portionSummary.adultsCount]);

  // AI Studio controls (collapsed by default so recipes are immediately visible)
  const [showAiStudio, setShowAiStudio] = useState<boolean>(false);
  const [aiMode, setAiMode] = useState<'from_scratch' | 'fridge' | 'habits'>(() =>
    (familyProfile.habitualProducts || []).length > 0 ? 'habits' : 'from_scratch'
  );
  const [selectedAiTheme, setSelectedAiTheme] = useState<string>(
    'Quotidien réalisable & rapide'
  );
  const [customAiPrompt, setCustomAiPrompt] = useState<string>('');
  const [justGeneratedBanner, setJustGeneratedBanner] = useState<boolean>(false);
  const [showGooglePasteBox, setShowGooglePasteBox] = useState<boolean>(false);
  const [pastedGoogleText, setPastedGoogleText] = useState<string>('');

  const handleQuickAddHabitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickHabitInput.trim();
    if (!trimmed || !onUpdateFamilyProfile) return;
    if (!habitualProducts.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      onUpdateFamilyProfile({
        ...familyProfile,
        habitualProducts: [...habitualProducts, trimmed],
      });
    }
    setQuickHabitInput('');
    setAiMode('habits');
  };

  const handleQuickPresetHabits = () => {
    if (!onUpdateFamilyProfile) return;
    const preset = [
      'Filets de poulet',
      'Œufs frais',
      'Bœuf haché',
      'Jambon blanc',
      'Pavé de saumon',
      'Pâtes (Coquillettes / Spaghettis)',
      'Riz basmati',
      'Pommes de terre',
      'Carottes',
      'Courgettes',
      'Tomates / Coulis de tomate',
      'Pommes',
      'Lait demi-écrémé',
      'Beurre doux',
      'Crème fraîche',
      'Emmental râpé',
    ];
    onUpdateFamilyProfile({
      ...familyProfile,
      habitualProducts: Array.from(new Set([...habitualProducts, ...preset])),
    });
    setAiMode('habits');
  };

  const handleTriggerAiGeneration = async (
    overrideMode?: 'from_scratch' | 'fridge' | 'habits'
  ) => {
    const modeToUse = overrideMode || aiMode;
    await onGenerateAiRecipe({
      mode: modeToUse,
      theme: selectedAiTheme,
      customPrompt: customAiPrompt.trim(),
    });
    setCustomAiPrompt('');
    setSelectedTag('all');
    setOnlyFridgeStock(false);
    setJustGeneratedBanner(true);
    setTimeout(() => setJustGeneratedBanner(false), 5000);
  };

  const BABY_PORTION_GUIDE: Record<
    '4_5m' | '6_8m' | '9_11m' | '12_18m' | '19_36m',
    {
      label: string;
      veggiesAndCarbs: string;
      proteins: string;
      fats: string;
      dairyAndFruit: string;
      textureAndSafety: string;
    }
  > = {
    '4_5m': {
      label: '👶 4 – 5 mois (Début)',
      veggiesAndCarbs: 'Quelques cuillères → 120g de purée lisse de légumes le midi (sans sel).',
      proteins: 'Pas encore de viande/poisson (ou début découverte 5g dès 5m révolus selon pédiatre).',
      fats: '1 c.à.c d’huile végétale crue (colza, noix, olive) dans la purée tiède.',
      dairyAndFruit: 'Lait maternel à la demande ou ~750-850 ml de lait 1er âge/j + quelques cuillères de compote.',
      textureAndSafety: 'Texture 100% lisse et fluide. Zéro sel, zéro miel (< 1 an), zéro sucre ajouté.',
    },
    '6_8m': {
      label: '👶 6 – 8 mois',
      veggiesAndCarbs: 'Midi : 130g à 180g (2/3 légumes + 1/3 pomme de terre ou féculent mixé).',
      proteins: '10 g / jour le midi (= 2 c.à.c de viande/poisson mixé ou ¼ d’œuf dur).',
      fats: '1 à 1,5 c.à.c d’huile crue (colza/olive) ou noisette de beurre pasteurisé.',
      dairyAndFruit: 'Lait maternel ou ~500-700 ml lait 2e âge/j + 1 compote sans sucre (100-130g).',
      textureAndSafety: 'Purée lisse puis moulinée / épaisse. Introduction progressive des allergènes (arachide lisse, œuf bien cuit).',
    },
    '9_11m': {
      label: '👶 9 – 11 mois',
      veggiesAndCarbs: 'Midi : 180g à 200g · Soir : 120g à 150g (légumes + petites pâtes/semoule/riz fondant).',
      proteins: '15 à 20 g / jour le midi uniquement (= 3 à 4 c.à.c ou ⅓ d’œuf dur).',
      fats: '1,5 à 2 c.à.c d’huile crue par repas salé.',
      dairyAndFruit: 'Lait maternel ou ≥ 500 ml lait 2e âge/laitage bébé + 130g de fruits écrasés ou bien mûrs.',
      textureAndSafety: 'Écrasé à la fourchette, petits morceaux très fondants (qui s’écrasent entre deux doigts).',
    },
    '12_18m': {
      label: '🧒 12 – 18 mois',
      veggiesAndCarbs: 'Midi : ~200g à 220g (légumes + féculents) · Soir : ~150g à 180g (soupe/purée/pâtes + légumes).',
      proteins: '25 à 30 g / jour le midi (= ½ steak haché d’enfant ou ½ œuf bien cuit). Pas de protéine le soir.',
      fats: '2 c.à.c d’huile végétale crue (colza/olive) + un peu de beurre.',
      dairyAndFruit: '500 ml de lait de croissance / maternel ou équivalent laitage entier (yaourt, fromage pasteurisé) + fruits coupés.',
      textureAndSafety: 'Morceaux tendres coupés petit. ⚠️ Couper les aliments ronds (tomates cerises, raisins, saucisses) en 4 dans la longueur.',
    },
    '19_36m': {
      label: '🧒 19 – 36 mois (2-3 ans)',
      veggiesAndCarbs: 'Midi : 220g à 250g · Soir : 180g à 200g (moitié légumes, moitié féculents).',
      proteins: '30 g / jour le midi (= 6 c.à.c de viande/poisson ou ½ à 1 petit œuf).',
      fats: '2 c.à.c d’huile végétale crue / jour.',
      dairyAndFruit: '3 à 4 produits laitiers au lait entier par jour + 2 portions de fruits frais/compote.',
      textureAndSafety: 'Repas comme les parents (prélevé avant de trop saler/épicer). Attention aux fruits à coque entiers (< 5 ans).',
    },
  };

  const detectedChildren = getDetectedChildren(familyProfile.members || []);
  const youngChildren = detectedChildren.filter((c) => c.totalMonths < 36);
  const hasYoungChild = youngChildren.length > 0;

  // Available tags
  const allTags = [
    'all',
    'Selon nos habitudes 🏠',
    'Généré par IA ✨',
    ...(hasYoungChild ? ['Spécial Bébé (16 mois)'] : []),
    'Petit-déjeuner',
    '< 25 min',
    'Végétarien',
    'Enfant friendly',
    'Budget Malin',
  ];

  const normalize = (text: string) =>
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .trim();

  const isExpiringSoon = (expiryDateStr: string): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDateStr);
    expiry.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 3;
  };

  const isIngredientInFridge = (ing: RecipeIngredient): boolean => {
    if (activeFridgeItems.length === 0) return false;
    const normIng = normalize(ing.name);
    return activeFridgeItems.some((f) => {
      const normF = normalize(f.name);
      if (normF.includes(normIng) || normIng.includes(normF)) return true;
      const ingWords = normIng.split(' ').filter((w) => w.length >= 3);
      return ingWords.some((w) => normF.includes(w));
    });
  };

  const isIngredientHabitual = (ing: RecipeIngredient): boolean => {
    if (habitualProducts.length === 0) return false;
    const normIng = normalize(ing.name);
    return habitualProducts.some((hp) => {
      const normHp = normalize(hp);
      if (normHp.includes(normIng) || normIng.includes(normHp)) return true;
      const hpWords = normHp.split(' ').filter((w) => w.length >= 3);
      return hpWords.some((w) => normIng.includes(w));
    });
  };

  const getMatchedHabitualProducts = (recipe: Recipe): string[] => {
    if (habitualProducts.length === 0) return [];
    const matched: string[] = [];
    recipe.ingredients.forEach((ing) => {
      if (isIngredientHabitual(ing)) {
        matched.push(ing.name);
      }
    });
    return matched;
  };

  const getMatchedFridgeItem = (ing: RecipeIngredient): FridgeItem | undefined => {
    const normIng = normalize(ing.name);
    return activeFridgeItems.find((f) => {
      const normF = normalize(f.name);
      if (normF.includes(normIng) || normIng.includes(normF)) return true;
      const ingWords = normIng.split(' ').filter((w) => w.length >= 3);
      return ingWords.some((w) => normF.includes(w));
    });
  };

  const isRecipe100PercentInStock = (recipe: Recipe): boolean => {
    return recipe.ingredients.length > 0 && recipe.ingredients.every((ing) => isIngredientInFridge(ing));
  };

  const recipeUsesExpiringSoon = (recipe: Recipe): boolean => {
    return recipe.ingredients.some((ing) => {
      const matched = getMatchedFridgeItem(ing);
      return Boolean(matched && isExpiringSoon(matched.expirationDate));
    });
  };

  const total100PercentInStock = recipes.filter(isRecipe100PercentInStock).length;
  const totalHabitualRecipes = recipes.filter(
    (r) => getMatchedHabitualProducts(r).length > 0 || r.tags.includes('Selon nos habitudes 🏠')
  ).length;

  // Filtered recipes computation (strictly excludes proscribed foods & incompatible allergies)
  const filteredRecipes = recipes.filter((recipe) => {
    if (doesRecipeContainExcludedFood(recipe, familyProfile).excluded) {
      return false;
    }

    if (selectedTag !== 'all') {
      if (selectedTag === 'Selon nos habitudes 🏠') {
        if (
          getMatchedHabitualProducts(recipe).length === 0 &&
          !recipe.tags.includes('Selon nos habitudes 🏠')
        ) {
          return false;
        }
      } else if (!recipe.tags.includes(selectedTag)) {
        return false;
      }
    }

    if (onlyFridgeStock && !isRecipe100PercentInStock(recipe)) {
      return false;
    }

    if (
      onlyHabitualProducts &&
      getMatchedHabitualProducts(recipe).length === 0 &&
      !recipe.tags.includes('Selon nos habitudes 🏠')
    ) {
      return false;
    }

    if (onlyExpiringSoon && !recipeUsesExpiringSoon(recipe)) {
      return false;
    }

    if (selectedFridgeIngredient) {
      const normSelected = normalize(selectedFridgeIngredient);
      const matchesIngredient = recipe.ingredients.some((ing) => {
        const normIng = normalize(ing.name);
        return (
          normIng.includes(normSelected) ||
          normSelected.includes(normIng) ||
          normSelected
            .split(' ')
            .filter((w) => w.length >= 3)
            .some((w) => normIng.includes(w))
        );
      });
      if (!matchesIngredient) return false;
    }

    if (searchQuery.trim()) {
      const query = normalize(searchQuery);
      const matchesTitle = normalize(recipe.title).includes(query);
      const matchesDesc = normalize(recipe.description).includes(query);
      const matchesIngredients = recipe.ingredients.some((ing) =>
        normalize(ing.name).includes(query)
      );
      if (!matchesTitle && !matchesDesc && !matchesIngredients) {
        return false;
      }
    }

    return true;
  });

  const handleResetFilters = () => {
    setSearchQuery('');
    setOnlyFridgeStock(false);
    setOnlyHabitualProducts(false);
    setSelectedFridgeIngredient(null);
    setOnlyExpiringSoon(false);
    setSelectedTag('all');
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    onlyFridgeStock ||
    onlyHabitualProducts ||
    selectedFridgeIngredient !== null ||
    onlyExpiringSoon ||
    selectedTag !== 'all';

  const handleAddShoppingClick = (recipe: Recipe) => {
    onAddMissingToShopping(recipe, targetServings);
    setAddedRecipeId(recipe.id);
    setTimeout(() => setAddedRecipeId(null), 2200);
  };

  return (
    <div className="space-y-4">
      {/* 1. UNIFIED TOP TOOLBAR: Search + Portions Stepper + AI Studio Trigger */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une recette ou un ingrédient (ex: poulet, saumon, pâtes...)"
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right Controls: Portions Stepper + Baby Guide + AI Chef */}
          <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto shrink-0">
            <div
              className="flex items-center gap-1 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs"
              title="Calibre automatiquement les quantités pour les adultes (hors enfants)"
            >
              <Users className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="text-slate-600 font-semibold">Adultes :</span>
              <button
                type="button"
                onClick={() => setTargetServings((prev) => Math.max(1, prev - 1))}
                className="w-5 h-5 rounded bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer flex items-center justify-center"
              >
                -
              </button>
              <strong className="px-1 text-slate-900 font-extrabold">{targetServings} ad.</strong>
              <button
                type="button"
                onClick={() => setTargetServings((prev) => prev + 1)}
                className="w-5 h-5 rounded bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer flex items-center justify-center"
              >
                +
              </button>
            </div>

            {hasYoungChild && (
              <button
                type="button"
                onClick={() => setShowBabyPortionsGuide(!showBabyPortionsGuide)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  showBabyPortionsGuide
                    ? 'bg-amber-500 text-slate-950 border-amber-500'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                }`}
              >
                🥄 Guide Bébé
              </button>
            )}

            {onImportRecipesFromText && (
              <button
                type="button"
                onClick={() => {
                  setShowGooglePasteBox(!showGooglePasteBox);
                  setShowAiStudio(false);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  showGooglePasteBox
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                📋 Coller Google IA
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setShowAiStudio(!showAiStudio);
                setShowGooglePasteBox(false);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ml-auto sm:ml-0 ${
                showAiStudio
                  ? 'bg-slate-900 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{showAiStudio ? 'Fermer Chef IA' : 'Créer 3 recettes IA'}</span>
            </button>
          </div>
        </div>

        {/* Single-Row Filters + Category Tags */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto pb-0.5">
            <button
              type="button"
              onClick={() => setOnlyHabitualProducts(!onlyHabitualProducts)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                onlyHabitualProducts
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Home className="w-3.5 h-3.5 text-emerald-600" />
              <span>Selon nos habitudes ({totalHabitualRecipes})</span>
            </button>

            <button
              type="button"
              onClick={() => setOnlyFridgeStock(!onlyFridgeStock)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                onlyFridgeStock
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <Refrigerator className="w-3.5 h-3.5" />
              <span>100% en stock ({total100PercentInStock})</span>
            </button>

            <button
              type="button"
              onClick={() => setOnlyExpiringSoon(!onlyExpiringSoon)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                onlyExpiringSoon
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Anti-gaspi</span>
            </button>

            <span className="text-slate-300 px-1">|</span>

            {allTags
              .filter((tg) => tg !== 'Selon nos habitudes 🏠')
              .map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedTag === tag
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tag === 'all' ? 'Toutes' : tag}
                </button>
              ))}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Réinitialiser</span>
            </button>
          )}
        </div>
      </div>

      {/* Just Generated Banner */}
      {justGeneratedBanner && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
          <span>
            ✨ Nouvelles recettes ajoutées en tête de liste ! Cliquez sur « + Courses » pour ajouter les ingrédients manquants.
          </span>
          <button
            type="button"
            onClick={() => setJustGeneratedBanner(false)}
            className="text-emerald-700 hover:text-emerald-950 ml-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Optional Paste Box from Google AI Mode */}
      {showGooglePasteBox && onImportRecipesFromText && (
        <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400">
              📋 Collez une recette ou un menu depuis le Mode IA de Google :
            </span>
            <button
              type="button"
              onClick={() => setShowGooglePasteBox(false)}
              className="text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              Fermer
            </button>
          </div>
          <textarea
            rows={3}
            value={pastedGoogleText}
            onChange={(e) => setPastedGoogleText(e.target.value)}
            placeholder="Collez ici le texte généré dans Google IA... L'application extrait automatiquement les ingrédients, adapte les quantités à votre foyer et crée la fiche recette !"
            className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-400"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={isGeneratingAi || !pastedGoogleText.trim()}
              onClick={async () => {
                if (!pastedGoogleText.trim()) return;
                await onImportRecipesFromText(pastedGoogleText.trim());
                setPastedGoogleText('');
                setShowGooglePasteBox(false);
                setJustGeneratedBanner(true);
                setTimeout(() => setJustGeneratedBanner(false), 5000);
              }}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-slate-950 disabled:text-slate-400 rounded-xl text-xs font-extrabold cursor-pointer"
            >
              {isGeneratingAi
                ? 'Importation en cours...'
                : '✨ Transformer en fiche recette'}
            </button>
          </div>
        </div>
      )}

      {/* Collapsible AI Recipe Studio Drawer */}
      {showAiStudio && (
        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                ✨ Chef IA · Google Gemini 3 Flash
              </span>
              <h3 className="text-sm sm:text-base font-bold mt-0.5">
                Générer 3 nouvelles recettes sur-mesure pour {targetServings} personnes
              </h3>
            </div>

            {/* Mode Switcher */}
            <div className="flex flex-wrap bg-slate-800 p-1 rounded-xl border border-slate-700 gap-1">
              <button
                type="button"
                onClick={() => setAiMode('habits')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${
                  aiMode === 'habits'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span>Selon nos habitudes ({habitualProducts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setAiMode('from_scratch')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${
                  aiMode === 'from_scratch'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Je pars de 0</span>
              </button>
              <button
                type="button"
                onClick={() => setAiMode('fridge')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${
                  aiMode === 'fridge'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Refrigerator className="w-3.5 h-3.5" />
                <span>Avec mon frigo ({activeFridgeItems.length})</span>
              </button>
            </div>
          </div>

          {aiMode === 'habits' && (
            <div className="p-3 rounded-xl bg-slate-800/90 border border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-emerald-300">Produits habituels :</span>
                {habitualProducts.length > 0 ? (
                  habitualProducts.slice(0, 8).map((p) => (
                    <span
                      key={p}
                      className="px-2 py-0.5 rounded-md bg-slate-900 text-slate-200 text-[11px]"
                    >
                      {p}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">Aucun produit habituel configuré</span>
                )}
                {habitualProducts.length > 8 && (
                  <span className="text-[11px] text-slate-400">
                    +{habitualProducts.length - 8} autres
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {habitualProducts.length === 0 && onUpdateFamilyProfile && (
                  <button
                    type="button"
                    onClick={handleQuickPresetHabits}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[11px] font-bold cursor-pointer"
                  >
                    + Pré-remplir classiques
                  </button>
                )}
                {onNavigateToFamilyHabits && (
                  <button
                    type="button"
                    onClick={onNavigateToFamilyHabits}
                    className="text-[11px] font-bold text-emerald-400 hover:underline cursor-pointer"
                  >
                    Gérer dans Foyer →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Theme Selector */}
          <div className="flex flex-wrap gap-1.5">
            {AI_RECIPE_THEMES.map((themeItem) => {
              const active = selectedAiTheme === themeItem.id;
              return (
                <button
                  key={themeItem.id}
                  type="button"
                  onClick={() => setSelectedAiTheme(themeItem.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                    active
                      ? 'bg-white text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {themeItem.label}
                </button>
              );
            })}
          </div>

          {/* Custom Prompt + Submit */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={customAiPrompt}
              onChange={(e) => setCustomAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isGeneratingAi) {
                  e.preventDefault();
                  handleTriggerAiGeneration();
                }
              }}
              placeholder="Précision optionnelle (ex: plat rapide sans four, gratin de pâtes, idée avec du poulet...)"
              className="flex-1 px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={() => handleTriggerAiGeneration()}
              disabled={isGeneratingAi}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-slate-950 disabled:text-slate-400 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              {isGeneratingAi ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Génération en cours...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Générer 3 recettes</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Baby Portion Guide */}
      {showBabyPortionsGuide && (
        <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-amber-950">
              🥄 Repères Quantités & Textures Bébé par Âge
            </h3>
            <button
              type="button"
              onClick={() => setShowBabyPortionsGuide(false)}
              className="text-xs font-bold text-amber-900 hover:underline cursor-pointer"
            >
              Fermer
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              Object.keys(BABY_PORTION_GUIDE) as Array<keyof typeof BABY_PORTION_GUIDE>
            ).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedBabyAgeBracket(key)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer ${
                  selectedBabyAgeBracket === key
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 border border-amber-200'
                }`}
              >
                {BABY_PORTION_GUIDE[key].label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-white border border-amber-200/80">
              <strong className="text-emerald-800 block mb-0.5">🥕 Légumes & Féculents</strong>
              <p className="text-slate-700">{BABY_PORTION_GUIDE[selectedBabyAgeBracket].veggiesAndCarbs}</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-amber-200/80">
              <strong className="text-rose-800 block mb-0.5">🍗 Protéines (Midi)</strong>
              <p className="text-slate-700">{BABY_PORTION_GUIDE[selectedBabyAgeBracket].proteins}</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-amber-200/80">
              <strong className="text-amber-800 block mb-0.5">🫒 Matières Grasses</strong>
              <p className="text-slate-700">{BABY_PORTION_GUIDE[selectedBabyAgeBracket].fats}</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-amber-200/80">
              <strong className="text-blue-800 block mb-0.5">🍼 Lait & Texture</strong>
              <p className="text-slate-700">{BABY_PORTION_GUIDE[selectedBabyAgeBracket].dairyAndFruit}</p>
            </div>
          </div>
        </div>
      )}

      {/* 2. CLEAN RECIPES GRID */}
      {filteredRecipes.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3 max-w-lg mx-auto">
          <Utensils className="w-8 h-8 text-emerald-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">
            Aucune recette ne correspond à vos filtres
          </h3>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
            >
              Réinitialiser les filtres
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAiStudio(true);
                handleTriggerAiGeneration();
              }}
              disabled={isGeneratingAi}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              ✨ Générer 3 recettes IA
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRecipes.map((recipe) => {
            const inStockIngredients = recipe.ingredients.filter(isIngredientInFridge);
            const missingIngredients = recipe.ingredients.filter((i) => !isIngredientInFridge(i));
            const inStockCount = inStockIngredients.length;
            const missingCount = missingIngredients.length;
            const isFullStock = isRecipe100PercentInStock(recipe);
            const matchedHabits = getMatchedHabitualProducts(recipe);
            const costBreakdown = getRecipeCostBreakdown(recipe, targetServings);

            return (
              <div
                key={recipe.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden shadow-2xs"
              >
                <div>
                  {/* Clean Text-Only Header: Status + Cost per person */}
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">
                      {isFullStock
                        ? '✓ 100% en stock'
                        : matchedHabits.length > 0
                        ? '🏠 Selon vos habitudes'
                        : recipe.tags[0] || 'Recette maison'}
                    </span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {costBreakdown.costPerPerson.toFixed(2)} € / pers.
                    </span>
                  </div>

                  {/* Card Body: Clean Typography, Zero Pill Soup */}
                  <div className="p-4 space-y-2.5">
                    <div>
                      <h3
                        onClick={() => setActiveRecipeModal(recipe)}
                        className="text-base font-bold text-slate-900 hover:text-emerald-700 cursor-pointer leading-snug"
                      >
                        {recipe.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {recipe.description}
                      </p>
                    </div>

                    {/* Single clean metadata line */}
                    <p className="text-xs text-slate-500 font-medium pt-1 border-t border-slate-100">
                      <strong className="text-slate-800">{recipe.prepTime + recipe.cookTime} min</strong>
                      {' · '}
                      <span>{recipe.calories} kcal</span>
                      {' · '}
                      <span className="text-emerald-700 font-bold">
                        Total {targetServings} pers. : {costBreakdown.totalForHousehold.toFixed(2)} €
                      </span>
                    </p>

                    {/* Concise Ingredient Summary instead of noisy crossed-out pills */}
                    <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      {isFullStock ? (
                        <span className="text-emerald-700 font-semibold">
                          ✓ Tous les ingrédients ({recipe.ingredients.length}) sont disponibles dans vos stocks.
                        </span>
                      ) : (
                        <p className="truncate">
                          <strong className="text-slate-800">
                            {inStockCount}/{recipe.ingredients.length} en stock
                          </strong>
                          {' · '}
                          <span className="text-slate-500">
                            À acheter : {missingIngredients.map((i) => i.name).join(', ')}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveRecipeModal(recipe)}
                    className="text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Voir la recette</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    {missingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleAddShoppingClick(recipe)}
                        className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-emerald-500 text-slate-700 hover:text-emerald-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        {addedRecipeId === recipe.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700 font-bold">Ajouté !</span>
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>+ {missingCount} en courses</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onAddToPlanner(recipe)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>Planifier</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recipe Detail Modal — Mobile Bottom Sheet & Desktop Dialog via Portal */}
      {activeRecipeModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={() => setActiveRecipeModal(null)}
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-2xl max-h-[88dvh] overflow-hidden shadow-2xl flex flex-col animate-slide-up"
            >
            <div className="px-4 py-3.5 sm:p-5 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider block">
                  Fiche Recette ({targetServings} pers.)
                </span>
                <h3 className="text-sm sm:text-lg font-bold font-display truncate">
                  {activeRecipeModal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveRecipeModal(null)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Fermer</span>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {activeRecipeModal.description && (
                <p className="text-xs text-slate-600 leading-relaxed">
                  {activeRecipeModal.description}
                </p>
              )}

              {/* Recipe Meta Info */}
              <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl text-center">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Prépa</p>
                  <p className="text-sm font-bold text-slate-900">{activeRecipeModal.prepTime} min</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Cuisson</p>
                  <p className="text-sm font-bold text-slate-900">{activeRecipeModal.cookTime} min</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Portions foyer</p>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <button
                      type="button"
                      onClick={() => setTargetServings((prev) => Math.max(1, prev - 1))}
                      className="w-5 h-5 rounded bg-white border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      -
                    </button>
                    <p className="text-sm font-bold text-emerald-700">{targetServings} pers.</p>
                    <button
                      type="button"
                      onClick={() => setTargetServings((prev) => prev + 1)}
                      className="w-5 h-5 rounded bg-white border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Coût foyer ({targetServings}p)</p>
                  <p className="text-sm font-bold text-emerald-600">
                    {getRecipeCostBreakdown(activeRecipeModal, targetServings).totalForHousehold.toFixed(2)} €
                  </p>
                </div>
              </div>

              {/* 1 Préparation = 2 Repas (only shown if household has a baby/toddler) */}
              {hasYoungChild ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-xs text-amber-950">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-amber-900 flex items-center gap-1.5">
                      <span>
                        🍲 Mode « 1 Préparation = 2 Repas » (Parents +{' '}
                        {youngChildren.map((c) => c.member.name).join(' & ')})
                      </span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold shrink-0">
                      Sans sel ajouté
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-900">
                    <strong>
                      Pour {youngChildren[0].member.name} ({youngChildren[0].ageLabel}) :
                    </strong>{' '}
                    Avant de saler ou poivrer le plat familial, prélevez sa portion de légumes/féculents et protéines bien cuites, adaptez la texture à son âge et ajoutez 1 c.à.c d'huile végétale crue (colza/olive).
                  </p>
                  {activeRecipeModal.babyAdaptation && (
                    <p className="text-[11px] text-slate-800 bg-white p-2.5 rounded-xl border border-amber-200">
                      <strong className="text-amber-900">Astuce recette :</strong> {activeRecipeModal.babyAdaptation}
                    </p>
                  )}
                  {activeRecipeModal.familyApprovedTips && (
                    <p className="text-[11px] text-amber-900">
                      <strong>👨‍👩‍👧‍👦 Conseil table familiale :</strong>{' '}
                      {activeRecipeModal.familyApprovedTips}
                    </p>
                  )}
                </div>
              ) : (
                activeRecipeModal.familyApprovedTips && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 leading-relaxed">
                    <strong className="text-amber-900">👨‍👩‍👧‍👦 Astuce cuisine :</strong>{' '}
                    {activeRecipeModal.familyApprovedTips}
                  </div>
                )
              )}

              {/* Ingredients List */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-2">
                  Ingrédients nécessaires (calibrés pour {targetServings} personne{targetServings > 1 ? 's' : ''})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeRecipeModal.ingredients.map((ing, i) => {
                    const inStock = isIngredientInFridge(ing);
                    const scaledAmt = scaleIngredientAmount(
                      ing.amount,
                      activeRecipeModal.servings,
                      targetServings
                    );
                    const ingPrice = estimateIngredientPrice(ing.name, scaledAmt);
                    return (
                      <div
                        key={i}
                        className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <span className="font-medium text-slate-800">{ing.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-700 font-bold font-mono">{scaledAmt}</span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            (~{ingPrice.toFixed(2)}€)
                          </span>
                          {inStock ? (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.5 rounded">
                              Frigo ✓
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              À acheter
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step by step Instructions */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-2">Étapes de préparation</h4>
                <div className="space-y-2.5">
                  {activeRecipeModal.instructions.map((step, idx) => (
                    <div key={idx} className="flex gap-3 text-xs leading-relaxed text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <p>{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onAddMissingToShopping(activeRecipeModal, targetServings);
                  setActiveRecipeModal(null);
                }}
                className="w-full sm:w-auto px-4 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                + Ajouter manquants aux courses ({targetServings}p)
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddToPlanner(activeRecipeModal);
                  setActiveRecipeModal(null);
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 cursor-pointer"
              >
                Planifier cette semaine
              </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
