import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FamilyPreferences,
  FridgeItem,
  MealPlanDay,
  Recipe,
  RecipeIngredient,
  Language,
} from '../types';
import { getDetectedChildren } from './DailyHomeView';
import {
  doesRecipeContainExcludedFood,
  estimateIngredientPrice,
  getHouseholdPortionSummary,
  getRecipeCostBreakdown,
  scaleIngredientAmount,
} from '../utils/portionScaler';
import {
  BookOpen,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Home,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  X,
} from 'lucide-react';

interface PlannerViewProps {
  mealPlan: MealPlanDay[];
  availableRecipes: Recipe[];
  familyProfile: FamilyPreferences;
  fridgeItems?: FridgeItem[];
  lang: Language;
  onUpdateMeal: (
    dayIndex: number,
    mealType: 'breakfast' | 'lunch' | 'dinner',
    recipe: Recipe | null
  ) => void;
  onAutoGeneratePlan: () => void;
  onExportPlanToShopping: () => void;
  onAddMissingToShopping?: (recipe: Recipe, targetServings?: number) => void;
  onGenerateMenuFromHabits?: () => void | Promise<void>;
  isGeneratingAi?: boolean;
  onNavigateToFamilyHabits?: () => void;
}

export const PlannerView: React.FC<PlannerViewProps> = ({
  mealPlan,
  availableRecipes,
  familyProfile,
  fridgeItems = [],
  onUpdateMeal,
  onAutoGeneratePlan,
  onExportPlanToShopping,
  onAddMissingToShopping,
  onGenerateMenuFromHabits,
  isGeneratingAi = false,
  onNavigateToFamilyHabits,
}) => {
  const [swappingMeal, setSwappingMeal] = useState<{
    dayIndex: number;
    mealType: 'breakfast' | 'lunch' | 'dinner';
  } | null>(null);
  const [viewingMeal, setViewingMeal] = useState<{
    dayIndex: number;
    dayName: string;
    mealType: 'breakfast' | 'lunch' | 'dinner';
    mealLabel: string;
    recipe: Recipe;
  } | null>(null);
  const [exportedSuccess, setExportedSuccess] = useState(false);
  const [addedToCartFromModal, setAddedToCartFromModal] = useState(false);

  // Mobile-First Day Selector: 'all' (7 days overview) or 0..6 (focused single day)
  const [selectedDayView, setSelectedDayView] = useState<'all' | number>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      const jsDay = new Date().getDay(); // 0=Sun, 1=Mon...
      return jsDay === 0 ? 6 : jsDay - 1;
    }
    return 'all';
  });

  const portionSummary = getHouseholdPortionSummary(familyProfile);
  const householdPeople = portionSummary.adultsCount;
  const totalChildrenAndBabies = portionSummary.childrenCount + portionSummary.babiesCount;
  const [modalServings, setModalServings] = useState<number>(householdPeople);

  useEffect(() => {
    setModalServings(householdPeople);
  }, [householdPeople]);

  const habitualProducts = familyProfile.habitualProducts || [];
  const excludedFoods = familyProfile.excludedFoods || [];
  const activeFridgeItems = fridgeItems.filter((item) => !item.consumed && item.quantity > 0);
  const detectedChildren = getDetectedChildren(familyProfile.members || []);
  const youngChildren = detectedChildren.filter((c) => c.totalMonths < 36);
  const hasYoungChild = youngChildren.length > 0;

  const normalize = (text: string) =>
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .trim();

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

  const countRecipeHabitualMatches = (recipe: Recipe | null | undefined): number => {
    if (!recipe || habitualProducts.length === 0) return 0;
    return recipe.ingredients.filter((ing) => {
      const nIng = normalize(ing.name);
      return habitualProducts.some((hp) => {
        const nHp = normalize(hp);
        if (nIng.includes(nHp) || nHp.includes(nIng)) return true;
        return nHp
          .split(' ')
          .filter((w) => w.length >= 3)
          .some((w) => nIng.includes(w));
      });
    }).length;
  };

  let totalEstimatedCost = 0;
  let totalMealsCount = 0;
  const maxBudgetPerPortion = familyProfile.maxPerMeal || 3.2;

  mealPlan.forEach((day) => {
    [day.breakfast, day.lunch, day.dinner].forEach((meal) => {
      if (meal) {
        const breakdown = getRecipeCostBreakdown(meal, householdPeople);
        totalEstimatedCost += breakdown.totalForHousehold;
        totalMealsCount += 1;
      }
    });
  });

  const averageCostPerServing =
    totalMealsCount > 0 ? totalEstimatedCost / (totalMealsCount * householdPeople) : 0;
  const isUnderBudget = totalEstimatedCost <= (familyProfile.weeklyBudget || 90);

  const handleExportClick = () => {
    onExportPlanToShopping();
    setExportedSuccess(true);
    setTimeout(() => setExportedSuccess(false), 2500);
  };

  const renderMealSlot = (
    dayIndex: number,
    dayName: string,
    mealType: 'breakfast' | 'lunch' | 'dinner',
    label: string,
    badgeBg: string,
    badgeText: string,
    meal: Recipe | null | undefined
  ) => {
    const breakdown = getRecipeCostBreakdown(meal, householdPeople);
    const isOver = meal && breakdown.costPerPerson > maxBudgetPerPortion;
    const habitMatchCount = countRecipeHabitualMatches(meal);

    return (
      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
        <div
          onClick={() => {
            if (meal) {
              setModalServings(householdPeople);
              setViewingMeal({
                dayIndex,
                dayName,
                mealType,
                mealLabel: label,
                recipe: meal,
              });
            } else {
              setSwappingMeal({ dayIndex, mealType });
            }
          }}
          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
        >
          <div
            className={`w-14 py-1.5 rounded-xl ${badgeBg} ${badgeText} text-center font-bold text-xs shrink-0`}
          >
            {label}
          </div>
          <div className="min-w-0 flex-1">
            {meal ? (
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                    {meal.title}
                  </h4>
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600 shrink-0 opacity-80 group-hover:opacity-100" />
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5 tabular-nums">
                  <strong className={isOver ? 'text-rose-600' : 'text-emerald-700'}>
                    {breakdown.costPerPerson.toFixed(2)} €/ad.
                  </strong>
                  {' · '}
                  <span>
                    {breakdown.totalForHousehold.toFixed(2)} € ({householdPeople} ad.)
                  </span>
                  {' · '}
                  <span>{meal.prepTime + meal.cookTime} min</span>
                  {habitMatchCount > 0 && ` · 🏠`}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic group-hover:text-slate-600">
                Aucun repas choisi · Cliquer pour choisir
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSwappingMeal({ dayIndex, mealType })}
          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold shrink-0 cursor-pointer"
        >
          {meal ? 'Changer' : '+ Choisir'}
        </button>
      </div>
    );
  };

  const daysToDisplay =
    selectedDayView === 'all'
      ? mealPlan
      : mealPlan.filter((d) => d.dayIndex === selectedDayView);

  // Clean Text-Only Recipe Detail Modal opened directly when clicking a meal in the weekly menu
  const recipeDetailPortal =
    viewingMeal && typeof document !== 'undefined'
      ? createPortal(
          <div
            onClick={() => setViewingMeal(null)}
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-2xl max-h-[88dvh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col animate-slide-up"
            >
              {/* Header */}
              <div className="px-4 py-3.5 sm:p-5 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">
                    {viewingMeal.dayName} · {viewingMeal.mealLabel} ({modalServings} adulte{modalServings > 1 ? 's' : ''})
                  </span>
                  <h3 className="text-sm sm:text-lg font-bold font-display truncate">
                    {viewingMeal.recipe.title}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const target = {
                        dayIndex: viewingMeal.dayIndex,
                        mealType: viewingMeal.mealType,
                      };
                      setViewingMeal(null);
                      setSwappingMeal(target);
                    }}
                    className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold cursor-pointer"
                  >
                    Changer
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingMeal(null)}
                    className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Fermer</span>
                  </button>
                </div>
              </div>

              {/* Body (Zero image preview — 100% focused on recipe content) */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
                {viewingMeal.recipe.description && (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {viewingMeal.recipe.description}
                  </p>
                )}

                {/* Meta Row */}
                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl text-center border border-slate-100">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Prépa</p>
                    <p className="text-sm font-bold text-slate-900 tabular-nums">
                      {viewingMeal.recipe.prepTime} min
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Cuisson</p>
                    <p className="text-sm font-bold text-slate-900 tabular-nums">
                      {viewingMeal.recipe.cookTime} min
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">Portions</p>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <button
                        type="button"
                        onClick={() => setModalServings((prev) => Math.max(1, prev - 1))}
                        className="w-5 h-5 rounded bg-white border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        -
                      </button>
                      <p className="text-sm font-bold text-emerald-700 tabular-nums">
                        {modalServings}p
                      </p>
                      <button
                        type="button"
                        onClick={() => setModalServings((prev) => prev + 1)}
                        className="w-5 h-5 rounded bg-white border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-semibold">
                      Coût ({modalServings}p)
                    </p>
                    <p className="text-sm font-bold text-emerald-600 tabular-nums">
                      {getRecipeCostBreakdown(
                        viewingMeal.recipe,
                        modalServings
                      ).totalForHousehold.toFixed(2)}{' '}
                      €
                    </p>
                  </div>
                </div>

                {/* Baby / Family Tip */}
                {hasYoungChild ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-1.5 text-xs text-amber-950">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-amber-900">
                        🍲 Adaptation Bébé ({youngChildren.map((c) => c.member.name).join(' & ')})
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold shrink-0">
                        Sans sel ajouté
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-900">
                      Prélevez la portion bébé avant de saler ou poivrer le plat familial, adaptez
                      la texture à son âge et ajoutez 1 c.à.c d'huile végétale crue.
                    </p>
                    {viewingMeal.recipe.babyAdaptation && (
                      <p className="text-[11px] text-slate-800 bg-white p-2.5 rounded-xl border border-amber-200">
                        <strong className="text-amber-900">Astuce :</strong> {viewingMeal.recipe.babyAdaptation}
                      </p>
                    )}
                  </div>
                ) : (
                  viewingMeal.recipe.familyApprovedTips && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 leading-relaxed">
                      <strong className="text-amber-900">👨‍👩‍👧‍👦 Astuce cuisine :</strong>{' '}
                      {viewingMeal.recipe.familyApprovedTips}
                    </div>
                  )
                )}

                {/* Ingredients */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">
                    Ingrédients ({modalServings} personne{modalServings > 1 ? 's' : ''})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {viewingMeal.recipe.ingredients.map((ing, i) => {
                      const inStock = isIngredientInFridge(ing);
                      const scaledAmt = scaleIngredientAmount(
                        ing.amount,
                        viewingMeal.recipe.servings,
                        modalServings
                      );
                      const ingPrice = estimateIngredientPrice(ing.name, scaledAmt);
                      return (
                        <div
                          key={i}
                          className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-slate-800">{ing.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-slate-700 font-bold font-mono">{scaledAmt}</span>
                            <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
                              (~{ingPrice.toFixed(2)}€)
                            </span>
                            {inStock ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.5 rounded">
                                Stock ✓
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

                {/* Instructions */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">Étapes de préparation</h4>
                  <div className="space-y-2.5">
                    {viewingMeal.recipe.instructions.map((step, idx) => (
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

              {/* Footer */}
              <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:justify-end gap-2 shrink-0">
                {onAddMissingToShopping && (
                  <button
                    type="button"
                    onClick={() => {
                      onAddMissingToShopping(viewingMeal.recipe, modalServings);
                      setAddedToCartFromModal(true);
                      setTimeout(() => setAddedToCartFromModal(false), 2000);
                    }}
                    className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {addedToCartFromModal ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700">Ajouté aux courses !</span>
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4" />
                        <span>+ Ajouter manquants aux courses ({modalServings}p)</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingMeal(null)}
                  className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Fermer la recette
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const swapModalPortal =
    swappingMeal && typeof document !== 'undefined'
      ? createPortal(
          <div
            onClick={() => setSwappingMeal(null)}
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-lg shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[85dvh] animate-slide-up"
            >
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-emerald-400 uppercase font-bold truncate">
                    {mealPlan[swappingMeal.dayIndex].dayName} ·{' '}
                    {swappingMeal.mealType === 'breakfast'
                      ? 'Matin'
                      : swappingMeal.mealType === 'lunch'
                      ? 'Midi'
                      : 'Soir'}
                  </p>
                  <h3 className="text-sm font-bold truncate">Choisir un repas</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSwappingMeal(null)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  ✕ Fermer
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-2 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateMeal(swappingMeal.dayIndex, swappingMeal.mealType, null);
                    setSwappingMeal(null);
                  }}
                  className="w-full p-3 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:text-rose-600 hover:border-rose-300 cursor-pointer text-left"
                >
                  ✕ Laisser ce créneau vide (Repas extérieur / Restes)
                </button>

                {availableRecipes
                  .filter((r) => !doesRecipeContainExcludedFood(r, familyProfile).excluded)
                  .map((r) => {
                    const rBreakdown = getRecipeCostBreakdown(r, householdPeople);
                    const isOver = rBreakdown.costPerPerson > maxBudgetPerPortion;

                    return (
                      <div
                        key={r.id}
                        onClick={() => {
                          onUpdateMeal(swappingMeal.dayIndex, swappingMeal.mealType, r);
                          setSwappingMeal(null);
                        }}
                        className="p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 cursor-pointer transition-all flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{r.title}</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                            <strong className={isOver ? 'text-rose-600' : 'text-emerald-700'}>
                              {rBreakdown.costPerPerson.toFixed(2)} €/ad.
                            </strong>
                            {' · '}
                            <span>
                              {rBreakdown.totalForHousehold.toFixed(2)} € ({householdPeople} ad.)
                            </span>
                            {' · '}
                            <span>{r.prepTime + r.cookTime} min</span>
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="space-y-4">
      {/* 1. COMPACT CONTROL & KPI BAR */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 space-y-3 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Inline Metrics */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <div className="tabular-nums">
              <span className="text-slate-500">
                Semaine ({householdPeople} adulte{householdPeople > 1 ? 's' : ''}
                {totalChildrenAndBabies > 0 ? ` · hors ${totalChildrenAndBabies} enf.` : ''}) :{' '}
              </span>
              <strong
                className={`text-sm font-extrabold ${
                  isUnderBudget ? 'text-slate-900' : 'text-rose-600'
                }`}
              >
                {totalEstimatedCost.toFixed(2)} €
              </strong>
              <span className="text-slate-400"> / {familyProfile.weeklyBudget} €</span>
            </div>

            <span className="text-slate-300">·</span>

            <div className="tabular-nums">
              <span className="text-slate-500">Moyenne : </span>
              <strong className="text-emerald-700 font-bold">
                {averageCostPerServing.toFixed(2)} € / adulte
              </strong>
            </div>

            {onNavigateToFamilyHabits && (
              <>
                <span className="text-slate-300 hidden sm:inline">·</span>
                <button
                  type="button"
                  onClick={onNavigateToFamilyHabits}
                  className="text-emerald-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5 shrink-0" />
                  <span>Habitudes ({habitualProducts.length})</span>
                  {excludedFoods.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold">
                      🚫 {excludedFoods.length} proscrit{excludedFoods.length > 1 ? 's' : ''}
                    </span>
                  )}
                  <span>✎</span>
                </button>
              </>
            )}
          </div>

          {/* Primary Actions */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
            {onGenerateMenuFromHabits && (
              <button
                type="button"
                onClick={onGenerateMenuFromHabits}
                disabled={isGeneratingAi}
                className="col-span-2 sm:col-span-1 min-h-[40px] px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isGeneratingAi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
                    <span>Création du menu...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Menu selon nos habitudes</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onAutoGeneratePlan}
              className="min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>Remplir 7j</span>
            </button>

            <button
              type="button"
              onClick={handleExportClick}
              disabled={totalMealsCount === 0}
              className="min-h-[40px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
            >
              {exportedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Ajouté !</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                  <span>+ Courses ({totalMealsCount})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* MOBILE-FIRST DAY SCROLLER: Switch between 1-Day Focus and 7-Day Full View */}
        <div className="pt-2.5 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => setSelectedDayView('all')}
            className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-all ${
              selectedDayView === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>Toute la semaine (7j)</span>
          </button>

          {mealPlan.map((day) => {
            const isSelected = selectedDayView === day.dayIndex;
            const filledCount = [day.breakfast, day.lunch, day.dinner].filter(Boolean).length;
            const shortName = day.dayName.slice(0, 3);
            return (
              <button
                key={day.dayIndex}
                type="button"
                onClick={() => setSelectedDayView(day.dayIndex)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{shortName}.</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md tabular-nums ${
                    isSelected
                      ? 'bg-emerald-800 text-emerald-100'
                      : filledCount > 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-white text-slate-400'
                  }`}
                >
                  {filledCount}/3
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. MEAL PLANNER CARDS */}
      <div className="space-y-3">
        {daysToDisplay.map((day) => {
          const bCost = getRecipeCostBreakdown(day.breakfast, householdPeople).totalForHousehold;
          const lCost = getRecipeCostBreakdown(day.lunch, householdPeople).totalForHousehold;
          const dCost = getRecipeCostBreakdown(day.dinner, householdPeople).totalForHousehold;
          const dayTotalForHousehold = bCost + lCost + dCost;
          const dayTotalPerPerson =
            householdPeople > 0 ? dayTotalForHousehold / householdPeople : 0;

          return (
            <div
              key={day.dayIndex}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs"
            >
              {/* Day Header */}
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  {selectedDayView !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedDayView((day.dayIndex + 6) % 7)}
                      className="p-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer"
                      title="Jour précédent"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span className="font-extrabold text-slate-900 text-sm">{day.dayName}</span>
                  {selectedDayView !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedDayView((day.dayIndex + 1) % 7)}
                      className="p-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer"
                      title="Jour suivant"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {dayTotalForHousehold > 0 ? (
                  <span className="text-slate-500 tabular-nums">
                    Total jour :{' '}
                    <strong className="text-slate-800">{dayTotalForHousehold.toFixed(2)} €</strong>{' '}
                    <span className="text-slate-400">({dayTotalPerPerson.toFixed(2)} €/pers.)</span>
                  </span>
                ) : (
                  <span className="text-slate-400 tabular-nums">0,00 €</span>
                )}
              </div>

              {/* Meals row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                {renderMealSlot(
                  day.dayIndex,
                  day.dayName,
                  'breakfast',
                  'Matin',
                  'bg-orange-50',
                  'text-orange-700',
                  day.breakfast
                )}
                {renderMealSlot(
                  day.dayIndex,
                  day.dayName,
                  'lunch',
                  'Midi',
                  'bg-amber-50',
                  'text-amber-700',
                  day.lunch
                )}
                {renderMealSlot(
                  day.dayIndex,
                  day.dayName,
                  'dinner',
                  'Soir',
                  'bg-indigo-50',
                  'text-indigo-700',
                  day.dinner
                )}
              </div>
            </div>
          );
        })}
      </div>

      {recipeDetailPortal}
      {swapModalPortal}
    </div>
  );
};
