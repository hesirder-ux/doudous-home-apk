import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ApplianceTask,
  BreastMilkBatch,
  FamilyNotification,
  FamilyPreferences,
  FoodCategory,
  FridgeItem,
  HouseholdChore,
  Language,
  LoyaltyCard,
  MealPlanDay,
  Recipe,
  ShoppingItem,
  StorageZone,
  StoreLocation,
  VaccineReminder,
} from './types';
import {
  getBrowserNotificationPermission,
  getPushSettings,
  InAppPushToast,
  PushSettings,
  requestBrowserNotificationPermission,
  savePushSettings,
  sendPushNotification,
} from './utils/pushNotifications';
import {
  combineIngredientAmounts,
  doesRecipeContainExcludedFood,
  estimateIngredientPrice,
  getCanonicalShoppingIngredient,
  getHouseholdPortionSummary,
  inferIngredientCategory,
  normalizeIngredientText,
  recalculateRecipesListWithRealPrices,
  sanitizeShoppingItemsPrices,
  scaleIngredientAmount,
} from './utils/portionScaler';
import { translations } from './i18n/translations';
import {
  INITIAL_APPLIANCES,
  INITIAL_BREAST_MILK_BATCHES,
  INITIAL_CHORES,
  INITIAL_FAMILY_PREFERENCES,
  INITIAL_FRIDGE_ITEMS,
  INITIAL_LOYALTY_CARDS,
  INITIAL_NOTIFICATIONS,
  INITIAL_RECIPES,
  INITIAL_SHOPPING_ITEMS,
  INITIAL_STORES,
  INITIAL_STORE_DEALS,
} from './data/initialData';
import { FridgeView } from './components/FridgeView';
import { DailyHomeView, getDetectedChildren } from './components/DailyHomeView';
import { AiRecipeGenerateOptions, RecipesView } from './components/RecipesView';
import { PlannerView } from './components/PlannerView';
import { ShoppingView } from './components/ShoppingView';
import { LoyaltyView } from './components/LoyaltyView';
import { FamilyView } from './components/FamilyView';
import { KotlinExportView } from './components/KotlinExportView';
import { ScanModal } from './components/ScanModal';
import { PhotoScanModal } from './components/PhotoScanModal';
import { ShareHouseholdModal } from './components/ShareHouseholdModal';
import { WeatherBanner } from './components/WeatherBanner';
import {
  BellRing,
  BookOpen,
  Calendar,
  Camera,
  Check,
  CreditCard,
  Home,
  Plus,
  QrCode,
  Refrigerator,
  Share2,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

export default function App() {
  const [lang, setLang] = useState<Language>('fr');
  const t = translations[lang] || translations.fr;

  const [activeTab, setActiveTab] = useState<
    'fridge' | 'daily' | 'recipes' | 'planner' | 'shopping' | 'loyalty' | 'family'
  >('fridge');

  // Shared Household Synchronization Code (synced between user and partner)
  const [householdCode, setHouseholdCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('foyer');
      if (fromUrl) {
        localStorage.setItem('doudous_v3_household_code', fromUrl.toUpperCase());
        return fromUrl.toUpperCase();
      }
    }
    return localStorage.getItem('doudous_v3_household_code') || 'DOUDOU-HOME';
  });

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncModalTab, setSyncModalTab] = useState<'invite' | 'install' | 'join'>('invite');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date | null>(new Date());
  const isRemoteUpdate = useRef(false);
  const hasHydratedFromServer = useRef(false);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const clearAllShoppingFlagRef = useRef(false);

  // Top-of-page progress bar state for chunked receipt item parsing
  const [receiptParsingProgress, setReceiptParsingProgress] = useState<{
    active: boolean;
    processedCount: number;
    totalCount: number;
    currentChunk: number;
    totalChunks: number;
    currentLabel: string;
  } | null>(null);

  // Core App State (v3 clean slate: 100% blank on install)
  const [fridgeItems, setFridgeItems] = useState<FridgeItem[]>(() => {
    const saved = localStorage.getItem('doudous_v3_fridge_items');
    return saved ? JSON.parse(saved) : INITIAL_FRIDGE_ITEMS;
  });

  const mergeWithInitialRecipes = useCallback((savedList: Recipe[]): Recipe[] => {
    if (!Array.isArray(savedList) || savedList.length === 0) {
      return recalculateRecipesListWithRealPrices(INITIAL_RECIPES);
    }
    const existingIds = new Set(savedList.map((r) => r.id));
    const missingBase = INITIAL_RECIPES.filter((r) => !existingIds.has(r.id));
    return recalculateRecipesListWithRealPrices([...savedList, ...missingBase]);
  }, []);

  const [recipes, setRecipes] = useState<Recipe[]>(() => {
    const saved = localStorage.getItem('doudous_v3_recipes');
    if (!saved) return recalculateRecipesListWithRealPrices(INITIAL_RECIPES);
    try {
      const parsed = JSON.parse(saved);
      const existingIds = new Set(parsed.map((r: Recipe) => r.id));
      const missingBase = INITIAL_RECIPES.filter((r) => !existingIds.has(r.id));
      return recalculateRecipesListWithRealPrices([...parsed, ...missingBase]);
    } catch {
      return recalculateRecipesListWithRealPrices(INITIAL_RECIPES);
    }
  });

  const [loyaltyCards, setLoyaltyCards] = useState<LoyaltyCard[]>(() => {
    const saved = localStorage.getItem('doudous_v3_cards');
    return saved ? JSON.parse(saved) : INITIAL_LOYALTY_CARDS;
  });

  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>(() => {
    const saved = localStorage.getItem('doudous_v3_shopping');
    return saved ? sanitizeShoppingItemsPrices(JSON.parse(saved)) : INITIAL_SHOPPING_ITEMS;
  });

  const [familyPreferences, setFamilyPreferences] = useState<FamilyPreferences>(() => {
    const saved = localStorage.getItem('doudous_v3_family');
    return saved ? JSON.parse(saved) : INITIAL_FAMILY_PREFERENCES;
  });

  const [appliances, setAppliances] = useState<ApplianceTask[]>(() => {
    const saved = localStorage.getItem('doudous_v3_appliances');
    return saved ? JSON.parse(saved) : INITIAL_APPLIANCES;
  });

  const [breastMilkBatches, setBreastMilkBatches] = useState<BreastMilkBatch[]>(() => {
    const saved = localStorage.getItem('doudous_v3_breast_milk');
    return saved ? JSON.parse(saved) : INITIAL_BREAST_MILK_BATCHES;
  });

  const [chores, setChores] = useState<HouseholdChore[]>(() => {
    const saved = localStorage.getItem('doudous_v3_chores');
    return saved ? JSON.parse(saved) : INITIAL_CHORES;
  });

  const [notifications, setNotifications] = useState<FamilyNotification[]>(() => {
    const saved = localStorage.getItem('doudous_v3_notifications');
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });

  const [stores, setStores] = useState<StoreLocation[]>(INITIAL_STORES);
  const [storeDeals] = useState(INITIAL_STORE_DEALS);

  // Meal Plan State (7 days - completely blank by default)
  const createBlankMealPlan = useCallback(() => {
    const days = [
      t.monday,
      t.tuesday,
      t.wednesday,
      t.thursday,
      t.friday,
      t.saturday,
      t.sunday,
    ];
    return days.map((dayName, idx) => ({
      dayIndex: idx,
      dayName,
      breakfast: null,
      lunch: null,
      dinner: null,
    }));
  }, [t]);

  const [mealPlan, setMealPlan] = useState<MealPlanDay[]>(() => {
    const saved = localStorage.getItem('doudous_v3_meal_plan');
    if (saved) return JSON.parse(saved);
    const days = [
      t.monday,
      t.tuesday,
      t.wednesday,
      t.thursday,
      t.friday,
      t.saturday,
      t.sunday,
    ];
    return days.map((dayName, idx) => ({
      dayIndex: idx,
      dayName,
      breakfast: null,
      lunch: null,
      dinner: null,
    }));
  });

  // Modals & UI controls
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [isPhotoScanModalOpen, setIsPhotoScanModalOpen] = useState(false);
  const [isGeneratingAiRecipe, setIsGeneratingAiRecipe] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const saved = localStorage.getItem('doudous_v3_coords');
    return saved ? JSON.parse(saved) : null;
  });
  const [cityName, setCityName] = useState<string>(() => {
    return localStorage.getItem('doudous_v3_city') || 'Ma position';
  });

  // Push Notifications State & In-App Push Toast Queue
  const [pushSettings, setPushSettings] = useState<PushSettings>(() => getPushSettings());
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [browserPushPerm, setBrowserPushPerm] = useState<NotificationPermission | 'unsupported'>(
    () => getBrowserNotificationPermission()
  );
  const [pushToasts, setPushToasts] = useState<InAppPushToast[]>([]);

  useEffect(() => {
    const onPushToast = (e: Event) => {
      const custom = e as CustomEvent<InAppPushToast>;
      if (custom.detail) {
        setPushToasts((prev) => [custom.detail, ...prev].slice(0, 4));
        setTimeout(() => {
          setPushToasts((prev) => prev.filter((t) => t.id !== custom.detail.id));
        }, 7500);
      }
    };
    window.addEventListener('doudous-push-toast', onPushToast);
    return () => window.removeEventListener('doudous-push-toast', onPushToast);
  }, []);

  const handleUpdatePushSettings = (updated: PushSettings) => {
    setPushSettings(updated);
    savePushSettings(updated);
  };

  const handleEnableBrowserPush = async () => {
    const perm = await requestBrowserNotificationPermission();
    setBrowserPushPerm(perm);
    if (perm === 'granted') {
      const updated = { ...pushSettings, enabled: true };
      handleUpdatePushSettings(updated);
      sendPushNotification(
        '🔔 Notifications Push activées',
        'Vous recevrez les alertes péremptions, tâches du quotidien et rappels vaccinaux.',
        'chore'
      );
    }
  };

  // Helper: union merge two lists by ID while respecting deletedIds tombstones
  const mergeClientAndServerLists = useCallback(
    <T extends { id: string }>(localList: T[], serverList: T[], deletedSet: Set<string>): T[] => {
      const safeLocal = Array.isArray(localList) ? localList : [];
      const safeServer = Array.isArray(serverList) ? serverList : [];
      const merged: T[] = [];
      const seen = new Set<string>();

      // Keep server items first (updated with local changes if modified locally)
      const localMap = new Map<string, T>();
      for (const item of safeLocal) {
        if (item?.id && !deletedSet.has(item.id)) {
          localMap.set(item.id, item);
        }
      }

      for (const sItem of safeServer) {
        if (!sItem?.id || deletedSet.has(sItem.id) || seen.has(sItem.id)) continue;
        seen.add(sItem.id);
        merged.push(sItem);
      }

      for (const lItem of safeLocal) {
        if (!lItem?.id || deletedSet.has(lItem.id) || seen.has(lItem.id)) continue;
        seen.add(lItem.id);
        merged.push(lItem);
      }

      return merged;
    },
    []
  );

  // Synchronize to server helper (never pushes before initial server hydration is complete)
  const syncToServer = useCallback(
    async (overrideState?: any) => {
      if (isRemoteUpdate.current || (!hasHydratedFromServer.current && !overrideState)) return;
      try {
        setIsSyncing(true);
        const clearAllShopping = clearAllShoppingFlagRef.current;
        clearAllShoppingFlagRef.current = false;

        const payload = overrideState || {
          fridgeItems,
          recipes,
          mealPlan,
          shoppingItems,
          loyaltyCards,
          familyPreferences,
          appliances,
          breastMilkBatches,
          chores,
          notifications,
          deletedIds: Array.from(deletedIdsRef.current),
          clearAllShopping,
        };
        const res = await fetch(`/api/household/${householdCode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const result = await res.json();
          if (result?.data?.deletedIds && Array.isArray(result.data.deletedIds)) {
            result.data.deletedIds.forEach((id: string) => deletedIdsRef.current.add(String(id)));
          }
        }
        setLastSyncedTime(new Date());
      } catch (e) {
        console.warn('Sync to server error:', e);
      } finally {
        setIsSyncing(false);
      }
    },
    [
      householdCode,
      fridgeItems,
      recipes,
      mealPlan,
      shoppingItems,
      loyaltyCards,
      familyPreferences,
      appliances,
      breastMilkBatches,
      chores,
      notifications,
    ]
  );

  // Fetch state from server helper (merges non-destructively so two spouses opening the app never overwrite each other)
  const fetchFromServer = useCallback(async () => {
    try {
      setIsSyncing(true);
      const res = await fetch(`/api/household/${householdCode}`);
      const result = await res.json();
      if (result && result.exists && result.data) {
        isRemoteUpdate.current = true;
        const d = result.data;
        if (Array.isArray(d.deletedIds)) {
          d.deletedIds.forEach((id: string) => deletedIdsRef.current.add(String(id)));
        }
        const delSet = deletedIdsRef.current;

        if (Array.isArray(d.fridgeItems)) {
          setFridgeItems((prev) => mergeClientAndServerLists(prev, d.fridgeItems, delSet));
        }
        if (Array.isArray(d.recipes)) {
          setRecipes((prev) =>
            mergeWithInitialRecipes(mergeClientAndServerLists(prev, d.recipes, delSet))
          );
        }
        if (Array.isArray(d.mealPlan)) {
          const serverHasMeals = d.mealPlan.some(
            (day: any) => day && (day.breakfast || day.lunch || day.dinner)
          );
          if (serverHasMeals) {
            setMealPlan(d.mealPlan);
          }
        }
        if (Array.isArray(d.shoppingItems)) {
          setShoppingItems((prev) =>
            sanitizeShoppingItemsPrices(mergeClientAndServerLists(prev, d.shoppingItems, delSet))
          );
        }
        if (Array.isArray(d.loyaltyCards)) {
          setLoyaltyCards((prev) => mergeClientAndServerLists(prev, d.loyaltyCards, delSet));
        }
        if (d.familyPreferences) {
          setFamilyPreferences((prev) => ({
            ...prev,
            ...d.familyPreferences,
            driveProductSpecs: {
              ...(prev.driveProductSpecs || {}),
              ...(d.familyPreferences.driveProductSpecs || {}),
            },
            driveProductUrls: {
              ...(prev.driveProductUrls || {}),
              ...(d.familyPreferences.driveProductUrls || {}),
            },
          }));
        }
        if (Array.isArray(d.appliances)) setAppliances(d.appliances);
        if (Array.isArray(d.breastMilkBatches)) {
          setBreastMilkBatches((prev) =>
            mergeClientAndServerLists(prev, d.breastMilkBatches, delSet)
          );
        }
        if (Array.isArray(d.chores)) {
          setChores((prev) => mergeClientAndServerLists(prev, d.chores, delSet));
        }
        if (Array.isArray(d.notifications)) {
          setNotifications((prev) => mergeClientAndServerLists(prev, d.notifications, delSet));
        }

        hasHydratedFromServer.current = true;
        setLastSyncedTime(new Date(d.lastUpdated || Date.now()));
        setTimeout(() => {
          isRemoteUpdate.current = false;
        }, 350);
      } else {
        // Server has no record for this household yet: mark hydrated and push current local state
        hasHydratedFromServer.current = true;
        syncToServer();
      }
    } catch (e) {
      console.warn('Fetch from server error:', e);
      hasHydratedFromServer.current = true;
    } finally {
      setIsSyncing(false);
    }
  }, [householdCode, mergeClientAndServerLists, mergeWithInitialRecipes, syncToServer]);

  // Initial hydration on mount or householdCode change (NEVER auto-resets the server!)
  useEffect(() => {
    hasHydratedFromServer.current = false;
    localStorage.setItem('doudous_v3_initialized', 'true');
    fetchFromServer();
  }, [householdCode]);

  // Auto-sync polling every 5 seconds + immediate sync on tab focus / visibilitychange
  useEffect(() => {
    const timer = setInterval(() => {
      fetchFromServer();
    }, 5000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchFromServer();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [fetchFromServer]);

  // Persist locally & push changes to server ONLY after initial server hydration
  useEffect(() => {
    localStorage.setItem('doudous_v3_fridge_items', JSON.stringify(fridgeItems));
    if (hasHydratedFromServer.current && !isRemoteUpdate.current) syncToServer();
  }, [fridgeItems]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_recipes', JSON.stringify(recipes));
    if (hasHydratedFromServer.current && !isRemoteUpdate.current) syncToServer();
  }, [recipes]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_shopping', JSON.stringify(shoppingItems));
    if (hasHydratedFromServer.current && !isRemoteUpdate.current) syncToServer();
  }, [shoppingItems]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_cards', JSON.stringify(loyaltyCards));
    if (hasHydratedFromServer.current && !isRemoteUpdate.current) syncToServer();
  }, [loyaltyCards]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_family', JSON.stringify(familyPreferences));
    if (hasHydratedFromServer.current && !isRemoteUpdate.current) syncToServer();
  }, [familyPreferences]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_appliances', JSON.stringify(appliances));
    if (hasHydratedFromServer.current && !isRemoteUpdate.current) syncToServer();
  }, [appliances]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_breast_milk', JSON.stringify(breastMilkBatches));
    if (hasHydratedFromServer.current && !isRemoteUpdate.current) syncToServer();
  }, [breastMilkBatches]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_chores', JSON.stringify(chores));
    if (hasHydratedFromServer.current && !isRemoteUpdate.current) syncToServer();
  }, [chores]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_notifications', JSON.stringify(notifications));
    if (hasHydratedFromServer.current && !isRemoteUpdate.current) syncToServer();
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_meal_plan', JSON.stringify(mealPlan));
    if (hasHydratedFromServer.current && !isRemoteUpdate.current) syncToServer();
  }, [mealPlan]);

  // Handlers for Daily Home (Appliances, Breast Milk, Chores, Notifications)
  const handleSendNotification = (
    title: string,
    message: string,
    createdBy: string,
    type: FamilyNotification['type']
  ) => {
    const newNotif: FamilyNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      message,
      createdAt: "À l'instant",
      createdBy,
      type,
      acknowledged: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);

    const pushCategory =
      type === 'stock'
        ? 'expiry'
        : type === 'vaccine'
        ? 'vaccine'
        : type === 'appliance'
        ? 'appliance'
        : 'chore';
    sendPushNotification(title, message, pushCategory);
  };

  // Automatic Vaccine Reminders in 'Quotidien' + Push Notifications
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    familyPreferences.members
      .filter((m) => m.role !== 'parent')
      .forEach((child) => {
        (child.vaccines || []).forEach((vac) => {
          if (vac.completed) return;
          const due = new Date(vac.dueDate);
          due.setHours(0, 0, 0, 0);
          const daysUntil = Math.round((due.getTime() - today.getTime()) / (1000 * 3600 * 24));

          // Generate automatic reminder in Quotidien if due within 14 days or overdue
          if (daysUntil <= 14) {
            const autoNotifId = `notif-vac-${vac.id}-${todayStr}`;
            const formattedDate = new Date(vac.dueDate).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'short',
            });
            const title =
              daysUntil < 0
                ? `💉 Rappel Vaccin en retard (${child.name}) : ${vac.vaccineName}`
                : daysUntil === 0
                ? `💉 Vaccin prévu aujourd'hui pour ${child.name} : ${vac.vaccineName}`
                : `💉 Échéance Vaccinale J-${daysUntil} (${child.name}) : ${vac.vaccineName}`;
            const message = `Prévu le ${formattedDate}${vac.notes ? ` · ${vac.notes}` : ''}`;

            setNotifications((prev) => {
              if (prev.some((n) => n.id === autoNotifId)) return prev;
              return [
                {
                  id: autoNotifId,
                  title,
                  message,
                  createdAt: "Aujourd'hui",
                  createdBy: 'Carnet Vaccinal',
                  type: 'vaccine',
                  acknowledged: false,
                },
                ...prev,
              ];
            });

            sendPushNotification(title, message, 'vaccine', `push-vac-${vac.id}`);
          }
        });
      });
  }, [familyPreferences.members]);

  // Automatic Push Notifications for Stock Expirations (J-2, J-1, J-0, Expired)
  useEffect(() => {
    if (!pushSettings.enabled || !pushSettings.expiryAlerts) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    fridgeItems
      .filter((i) => !i.consumed && i.quantity > 0)
      .forEach((item) => {
        const exp = new Date(item.expirationDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.round((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));

        if (days <= pushSettings.expiryDaysThreshold) {
          const title =
            days < 0
              ? `🚨 Produit périmé : ${item.name}`
              : days === 0
              ? `⚠️ Expire aujourd'hui : ${item.name}`
              : `⏳ À consommer rapidement (J-${days}) : ${item.name}`;
          const body = `Quantité restante : ${item.quantity} ${item.unit} (${
            item.zone === 'fridge' ? 'Frigo' : item.zone === 'freezer' ? 'Congélateur' : 'Placard'
          })`;
          sendPushNotification(title, body, 'expiry', `push-exp-${item.id}`);
        }
      });
  }, [fridgeItems, pushSettings.enabled, pushSettings.expiryAlerts, pushSettings.expiryDaysThreshold]);

  // Automatic Push Notifications for Daily Chores (Scheduled Reminder Time)
  useEffect(() => {
    if (!pushSettings.enabled || !pushSettings.choreReminders) return;

    const checkChoresPush = () => {
      const now = new Date();
      const currentHHMM = now.toTimeString().slice(0, 5); // "HH:MM"
      chores
        .filter((c) => !c.completedToday && c.reminderTime)
        .forEach((chore) => {
          if (chore.reminderTime && currentHHMM >= chore.reminderTime) {
            sendPushNotification(
              `✅ Rappel Tâche (${chore.reminderTime}) : ${chore.title}`,
              `Assigné à ${chore.assignedTo} · Pensez à la cocher dans Quotidien`,
              'chore',
              `push-chore-time-${chore.id}`
            );
          }
        });
    };

    checkChoresPush();
    const interval = setInterval(checkChoresPush, 30000);
    return () => clearInterval(interval);
  }, [chores, pushSettings.enabled, pushSettings.choreReminders]);

  const handleToggleVaccineCompletedFromDaily = (childId: string, vaccineId: string) => {
    const todayIso = new Date().toISOString().split('T')[0];
    setFamilyPreferences((prev) => ({
      ...prev,
      members: prev.members.map((m) => {
        if (m.id !== childId) return m;
        return {
          ...m,
          vaccines: (m.vaccines || []).map((v) =>
            v.id === vaccineId
              ? {
                  ...v,
                  completed: !v.completed,
                  completedDate: !v.completed ? todayIso : undefined,
                }
              : v
          ),
        };
      }),
    }));
  };

  const handleNotifyVaccineReminder = (childName: string, vaccine: VaccineReminder) => {
    const formattedDate = new Date(vaccine.dueDate).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    handleSendNotification(
      `💉 Rappel Vaccin (${childName}) : ${vaccine.vaccineName}`,
      `Échéance prévue le ${formattedDate}${vaccine.notes ? ` · ${vaccine.notes}` : ''}`,
      'Foyer',
      'vaccine'
    );
  };

  const handleSendChorePushNow = (chore: HouseholdChore) => {
    sendPushNotification(
      `✅ Tâche du Quotidien : ${chore.title}`,
      `Rappel envoyé pour ${chore.assignedTo}${chore.reminderTime ? ` (prévu à ${chore.reminderTime})` : ''}`,
      'chore'
    );
  };

  const handleTriggerManualPushScan = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiringItems = fridgeItems.filter((i) => {
      if (i.consumed || i.quantity <= 0) return false;
      const exp = new Date(i.expirationDate);
      exp.setHours(0, 0, 0, 0);
      const days = Math.round((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
      return days <= pushSettings.expiryDaysThreshold;
    });
    const pendingChores = chores.filter((c) => !c.completedToday);

    if (expiringItems.length > 0) {
      sendPushNotification(
        `⚠️ ${expiringItems.length} produit(s) proche(s) de la péremption`,
        expiringItems.map((i) => i.name).join(', '),
        'expiry'
      );
    }
    if (pendingChores.length > 0) {
      sendPushNotification(
        `✅ ${pendingChores.length} tâche(s) du quotidien restante(s)`,
        pendingChores.map((c) => c.title).join(' · '),
        'chore'
      );
    }
    if (expiringItems.length === 0 && pendingChores.length === 0) {
      sendPushNotification(
        '🔔 Tout est à jour dans la maison !',
        'Aucun produit en péremption proche et toutes les tâches du quotidien sont faites.',
        'chore'
      );
    }
  };

  const handleDismissNotification = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, acknowledged: true } : n))
    );
  };

  const handleStartAppliance = (
    id: string,
    program: string,
    durationMinutes: number,
    startedBy: string
  ) => {
    setAppliances((prev) =>
      prev.map((app) =>
        app.id === id
          ? {
              ...app,
              program,
              durationMinutes,
              remainingMinutes: durationMinutes,
              startedBy,
              startedAt: "À l'instant",
              status: 'running',
            }
          : app
      )
    );
  };

  const handleFinishApplianceNow = (id: string) => {
    const target = appliances.find((a) => a.id === id);
    setAppliances((prev) =>
      prev.map((app) =>
        app.id === id
          ? {
              ...app,
              remainingMinutes: 0,
              status: 'completed_waiting_action',
            }
          : app
      )
    );
    if (target) {
      handleSendNotification(
        `🔔 ${target.name} terminé (${target.program})`,
        `${target.actionReminderText} (Lancé par ${target.startedBy})`,
        target.startedBy,
        'appliance'
      );
    }
  };

  const handleAcknowledgeAppliance = (id: string, doneBy: string) => {
    setAppliances((prev) =>
      prev.map((app) =>
        app.id === id
          ? {
              ...app,
              status: 'idle',
              remainingMinutes: 0,
            }
          : app
      )
    );
    handleSendNotification(
      `✅ Machine prise en charge par ${doneBy}`,
      `Le linge ou la vaisselle a bien été sorti(e) et rangé(e).`,
      doneBy,
      'appliance'
    );
  };

  const handleAddBreastMilk = (batchData: Omit<BreastMilkBatch, 'id'>) => {
    const newBatch: BreastMilkBatch = {
      ...batchData,
      id: `bm-${Date.now()}`,
    };
    setBreastMilkBatches((prev) => [newBatch, ...prev]);
  };

  const handleUseBreastMilk = (id: string) => {
    setBreastMilkBatches((prev) =>
      prev.map((b) => (b.id === id ? { ...b, used: true } : b))
    );
  };

  const handleMoveBreastMilkToFridge = (id: string) => {
    const in24h = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    setBreastMilkBatches((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              storageLocation: 'fridge',
              expiresAt: in24h,
              notes: 'Décongelé au frigo (à consommer sous 24h max, ne pas recongeler)',
            }
          : b
      )
    );
  };

  const handleToggleChore = (id: string, doneBy: string) => {
    setChores((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              completedToday: !c.completedToday,
              lastDoneBy: !c.completedToday ? doneBy : undefined,
            }
          : c
      )
    );
  };

  const handleAddChore = (choreData: Omit<HouseholdChore, 'id'>) => {
    const newChore: HouseholdChore = {
      ...choreData,
      id: `chore-${Date.now()}`,
    };
    setChores((prev) => [newChore, ...prev]);
  };

  const handleDeleteChore = (id: string) => {
    deletedIdsRef.current.add(id);
    setChores((prev) => prev.filter((c) => c.id !== id));
  };

  // Handlers for Fridge
  const handleAddItemFromScan = (itemData: {
    name: string;
    category: FoodCategory;
    zone: StorageZone;
    quantity: number;
    unit: string;
    expirationDays: number;
    autoRestock: boolean;
  }) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + itemData.expirationDays);

    const newItem: FridgeItem = {
      id: `item-${Date.now()}`,
      name: itemData.name,
      category: itemData.category,
      zone: itemData.zone,
      quantity: itemData.quantity,
      unit: itemData.unit,
      expirationDate: targetDate.toISOString().split('T')[0],
      addedDate: new Date().toISOString().split('T')[0],
      autoRestock: itemData.autoRestock,
      restockThreshold: 1,
    };

    setFridgeItems((prev) => [newItem, ...prev]);
  };

  // Parses normalized receipt text to extract standardized metric units (g, kg, cl, ml, L) and complex multipack quantities
  const parseNormalizedReceiptUnitAndQuantity = (item: {
    name: string;
    rawDesignation?: string;
    unit: string;
    quantity: number;
    driveSpec?: string;
  }): {
    cleanName: string;
    parsedQuantity: number;
    parsedUnit: string;
    parsedDriveSpec: string;
  } => {
    const combinedSource = `${item.rawDesignation || item.name || ''} ${item.unit || ''}`
      .replace(/\b(\d+)\s*grs?\b/gi, '$1g')
      .replace(/\b(\d+)\s*kilos?\b/gi, '$1kg')
      .replace(/\b(\d+)\s*millilitres?\b/gi, '$1ml')
      .replace(/\b(\d+)\s*centilitres?\b/gi, '$1cl')
      .replace(/\b(\d+)\s*litres?\b/gi, '$1L')
      .replace(/\s+/g, ' ')
      .trim();

    let parsedQuantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    let rawUnit = (item.unit || '').trim();

    // 1. Check if quantity prefix is embedded in the text or unit (e.g., "2 x 350g" or "Qté 3 - 500g")
    const leadingQtyInUnit = rawUnit.match(/^(\d+)\s*[xX×]\s*\((.+)\)$/);
    if (leadingQtyInUnit && parsedQuantity === 1) {
      parsedQuantity = Math.max(1, parseInt(leadingQtyInUnit[1], 10));
      rawUnit = leadingQtyInUnit[2].trim();
    }

    // 2. Extract complex multipack units (e.g., "16x100g", "6x1,5L", "20x25cl", "4x125ml")
    const multiPackRegex = /\b(\d+)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l)\b/i;
    const singleMetricRegex = /(?:^|[\s\-–(])(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l)\b/i;
    const lotCountRegex = /\b(?:bo[îi]te\s*[xX×]\s*(\d+)|[xX×]\s*(\d+)|(\d+)\s*p(?:i[èe]ces?)?)\b/i;

    const multiMatch = rawUnit.match(multiPackRegex) || combinedSource.match(multiPackRegex);
    const singleMatch = rawUnit.match(singleMetricRegex) || combinedSource.match(singleMetricRegex);
    const lotMatch = rawUnit.match(lotCountRegex) || combinedSource.match(lotCountRegex);

    let parsedUnit = rawUnit || 'pièce(s)';

    if (multiMatch) {
      const packCount = parseInt(multiMatch[1], 10);
      const subVal = parseFloat(multiMatch[2].replace(',', '.'));
      const rawU = multiMatch[3].toLowerCase();
      const normU = rawU === 'l' ? 'L' : rawU;
      const totalUnits = packCount * parsedQuantity;
      const totalVal = totalUnits * subVal;

      let totalFormatted = `${Math.round(totalVal * 100) / 100}${normU}`;
      if (normU === 'g' && totalVal >= 1000) {
        totalFormatted = `${String(Math.round((totalVal / 1000) * 100) / 100).replace('.', ',')}kg`;
      } else if ((normU === 'cl' && totalVal >= 100) || (normU === 'ml' && totalVal >= 1000)) {
        const liters = normU === 'cl' ? totalVal / 100 : totalVal / 1000;
        totalFormatted = `${Math.round(totalVal)}${normU} (${String(Math.round(liters * 100) / 100).replace('.', ',')}L)`;
      }

      const packStr = `${packCount}x${multiMatch[2].replace('.', ',')}${normU}`;
      parsedUnit =
        parsedQuantity > 1
          ? `${packStr} (Total : ${totalFormatted})`
          : `${packStr} (${totalFormatted})`;
    } else if (singleMatch && (!rawUnit.includes('Total :'))) {
      let val = parseFloat(singleMatch[1].replace(',', '.'));
      let u = singleMatch[2].toLowerCase();
      // Normalize fractional kg (e.g. 0.350 kg -> 350g) and fractional L (e.g. 0.75 L -> 75cl)
      if (u === 'kg' && val > 0 && val < 1) {
        val = Math.round(val * 1000);
        u = 'g';
      } else if (u === 'l' && val > 0 && val < 1) {
        val = Math.round(val * 100);
        u = 'cl';
      }
      const normU = u === 'l' ? 'L' : u;
      const baseMetric = `${String(val).replace('.', ',')}${normU}`;

      if (parsedQuantity > 1) {
        const totalVal = val * parsedQuantity;
        if (normU === 'g' && totalVal >= 1000) {
          parsedUnit = `${baseMetric} (Total : ${String(Math.round((totalVal / 1000) * 100) / 100).replace('.', ',')}kg)`;
        } else {
          parsedUnit = `${baseMetric} (Total : ${String(Math.round(totalVal * 100) / 100).replace('.', ',')}${normU})`;
        }
      } else {
        parsedUnit = baseMetric;
      }
    } else if (lotMatch && (!rawUnit || rawUnit === 'pièce(s)' || /^[xX×]?\d+p?$/i.test(rawUnit))) {
      const count = parseInt(lotMatch[1] || lotMatch[2] || lotMatch[3], 10);
      if (!isNaN(count) && count > 1) {
        parsedUnit =
          parsedQuantity > 1
            ? `lot x${count} (Total : ${count * parsedQuantity} pièces)`
            : `lot de ${count} pièces`;
      }
    }

    const cleanName = (item.name || 'Article')
      .replace(/\s+-\s+\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|l)\s*$/i, '')
      .trim();

    return {
      cleanName: cleanName || item.name,
      parsedQuantity,
      parsedUnit,
      parsedDriveSpec: (item.driveSpec || '').trim(),
    };
  };

  const handleAddDetectedItemsFromPhoto = async (
    items: Array<{
      name: string;
      rawDesignation?: string;
      category: FoodCategory;
      zone: StorageZone;
      quantity: number;
      unit: string;
      expirationDays: number;
      autoRestock: boolean;
      driveSpec?: string;
    }>,
    options?: {
      memorizeDriveSpecs?: boolean;
      storeLocation?: string;
    }
  ) => {
    if (!Array.isArray(items) || items.length === 0) return;

    const batchTimestamp = Date.now();
    const todayIso = new Date().toISOString().split('T')[0];
    const CHUNK_SIZE = 3;
    const totalCount = items.length;
    const chunks: Array<{ startIndex: number; slice: typeof items }> = [];

    for (let i = 0; i < totalCount; i += CHUNK_SIZE) {
      chunks.push({
        startIndex: i,
        slice: items.slice(i, i + CHUNK_SIZE),
      });
    }

    const totalChunks = chunks.length;
    setActiveTab('fridge');
    setReceiptParsingProgress({
      active: true,
      processedCount: 0,
      totalCount,
      currentChunk: 1,
      totalChunks,
      currentLabel: items[0]?.name || 'Analyse des articles du ticket...',
    });

    // Helper to convert a chunk of normalized items into FridgeItems + learned Drive specs
    const buildChunkFridgeItems = (
      chunkSlice: typeof items,
      chunkStartIndex: number
    ): { fridgeList: FridgeItem[]; learnedSpecs: Record<string, string> } => {
      const learnedSpecs: Record<string, string> = {};
      const fridgeList: FridgeItem[] = chunkSlice.map((item, localIdx) => {
        const globalIdx = chunkStartIndex + localIdx;
        const parsed = parseNormalizedReceiptUnitAndQuantity(item);
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + (item.expirationDays || 14));

        if (parsed.parsedDriveSpec) {
          const canonical = getCanonicalShoppingIngredient(parsed.cleanName);
          learnedSpecs[canonical.key] = parsed.parsedDriveSpec;
        }

        return {
          id: `item-photo-${batchTimestamp}-${globalIdx}`,
          name: parsed.cleanName,
          category: item.category,
          zone: item.zone,
          quantity: parsed.parsedQuantity,
          unit: parsed.parsedUnit,
          expirationDate: targetDate.toISOString().split('T')[0],
          addedDate: todayIso,
          autoRestock: item.autoRestock,
          restockThreshold: 1,
          notes: parsed.parsedDriveSpec
            ? `Format Drive : ${parsed.parsedDriveSpec}`
            : 'Ajouté par Scan Facture / Ticket IA',
        };
      });
      return { fridgeList, learnedSpecs };
    };

    // Process each chunk asynchronously with progressive UI insertion and LLM normalization
    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const { startIndex, slice } = chunks[cIdx];
      const chunkPreviewNames = slice
        .map((it) => it.name)
        .filter(Boolean)
        .join(', ');

      setReceiptParsingProgress({
        active: true,
        processedCount: startIndex,
        totalCount,
        currentChunk: cIdx + 1,
        totalChunks,
        currentLabel: chunkPreviewNames || `Lot ${cIdx + 1}/${totalChunks}`,
      });

      // Yield to browser animation frame so the top progress bar updates smoothly
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 40))
      );

      // 1. Optimistic local parse for this chunk so items appear immediately in the Fridge list
      const optimisticChunk = buildChunkFridgeItems(slice, startIndex);
      const chunkIds = new Set(optimisticChunk.fridgeList.map((it) => it.id));
      setFridgeItems((prev) => [...optimisticChunk.fridgeList, ...prev]);

      if (
        options?.memorizeDriveSpecs !== false &&
        Object.keys(optimisticChunk.learnedSpecs).length > 0
      ) {
        setFamilyPreferences((prev) => ({
          ...prev,
          driveProductSpecs: {
            ...(prev.driveProductSpecs || {}),
            ...optimisticChunk.learnedSpecs,
          },
        }));
      }

      // 2. Asynchronous LLM Textual Normalization for this chunk (units g, kg, cl, ml, L & complex multipacks)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3200);
        const response = await fetch('/api/scan/normalize-receipt-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: slice }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (
            Array.isArray(data?.normalizedItems) &&
            data.normalizedItems.length === slice.length
          ) {
            const mergedChunkInput = slice.map((orig, idx) => {
              const llmItem = data.normalizedItems[idx] || {};
              return {
                ...orig,
                name: llmItem.name || orig.name,
                rawDesignation: llmItem.rawDesignation || orig.rawDesignation || orig.name,
                quantity: llmItem.quantity ?? orig.quantity,
                unit: llmItem.unit || orig.unit,
                driveSpec: llmItem.driveSpec || orig.driveSpec,
                category: (llmItem.category as FoodCategory) || orig.category,
                zone: (llmItem.zone as StorageZone) || orig.zone,
              };
            });

            const refinedChunk = buildChunkFridgeItems(mergedChunkInput, startIndex);
            const refinedById = new Map(
              refinedChunk.fridgeList.map((it) => [it.id, it])
            );

            setFridgeItems((prev) =>
              prev.map((existing) =>
                chunkIds.has(existing.id)
                  ? refinedById.get(existing.id) || existing
                  : existing
              )
            );

            if (
              options?.memorizeDriveSpecs !== false &&
              Object.keys(refinedChunk.learnedSpecs).length > 0
            ) {
              setFamilyPreferences((prev) => ({
                ...prev,
                driveProductSpecs: {
                  ...(prev.driveProductSpecs || {}),
                  ...refinedChunk.learnedSpecs,
                },
              }));
            }
          }
        }
      } catch (chunkErr) {
        console.warn(`Chunk ${cIdx + 1}/${totalChunks} LLM normalization fallback:`, chunkErr);
      }

      const completedSoFar = Math.min(totalCount, startIndex + slice.length);
      setReceiptParsingProgress({
        active: true,
        processedCount: completedSoFar,
        totalCount,
        currentChunk: cIdx + 1,
        totalChunks,
        currentLabel:
          completedSoFar >= totalCount
            ? `✓ ${totalCount} articles normalisés et ajoutés aux stocks !`
            : chunkPreviewNames,
      });
    }

    setTimeout(() => {
      setReceiptParsingProgress(null);
    }, 1100);
  };

  const handleConsumeFridgeItem = (id: string) => {
    setFridgeItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newQty = item.quantity - 1;
          if (newQty <= 0) {
            deletedIdsRef.current.add(id);
            if (item.autoRestock) {
              handleQuickAddToShopping(item);
            }
          }
          return {
            ...item,
            quantity: Math.max(0, newQty),
            consumed: newQty <= 0,
          };
        }
        return item;
      })
    );
  };

  const handleDeleteFridgeItem = (id: string) => {
    deletedIdsRef.current.add(id);
    setFridgeItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleUpdateFridgeQuantity = (id: string, delta: number) => {
    setFridgeItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  // Safe 1-click Freezer-to-Fridge Thawing (48h expiry + 'Décongelé - Ne pas recongeler')
  const handleThawFridgeItem = (id: string) => {
    const expiry48h = new Date();
    expiry48h.setDate(expiry48h.getDate() + 2);
    const expiryStr = expiry48h.toISOString().split('T')[0];

    setFridgeItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (!target) return prev;

      // If more than 1 portion in freezer, decrement freezer by 1 and create 1 thawed portion in fridge
      if (target.quantity > 1) {
        const thawedPortion: FridgeItem = {
          ...target,
          id: `item-thawed-${Date.now()}`,
          zone: 'fridge',
          quantity: 1,
          expirationDate: expiryStr,
          notes: '❄️ Décongelé (Ne pas recongeler · 48h max)',
        };
        return [
          thawedPortion,
          ...prev.map((item) =>
            item.id === id ? { ...item, quantity: item.quantity - 1 } : item
          ),
        ];
      }

      // Otherwise move the single item directly to the fridge with 48h expiry
      return prev.map((item) =>
        item.id === id
          ? {
              ...item,
              zone: 'fridge',
              expirationDate: expiryStr,
              notes: '❄️ Décongelé (Ne pas recongeler · 48h max)',
            }
          : item
      );
    });
  };

  const handleQuickAddToShopping = (item: FridgeItem) => {
    const canonical = getCanonicalShoppingIngredient(item.name);
    const exists = shoppingItems.some(
      (s) => !s.checked && getCanonicalShoppingIngredient(s.name).key === canonical.key
    );
    if (!exists) {
      const unitLabel = `${item.quantity || 1} ${item.unit || 'pièce'}`;
      const newShop: ShoppingItem = {
        id: `shop-${Date.now()}`,
        name: canonical.displayName,
        category: item.category && item.category !== 'other' ? item.category : canonical.category,
        quantity: 1,
        unit: item.unit,
        estimatedPrice: estimateIngredientPrice(canonical.displayName, unitLabel),
        checked: false,
        source: 'fridge_staple',
        recommendedStore: 'Carrefour Market',
      };
      setShoppingItems((prev) => [newShop, ...prev]);
    }
  };

  // Helper to check if an ingredient name matches an active item in fridgeItems
  const isIngredientPresentInFridge = (ingName: string): boolean => {
    const activeStock = fridgeItems.filter((f) => !f.consumed && f.quantity > 0);
    if (activeStock.length === 0) return false;
    const ingCanonical = getCanonicalShoppingIngredient(ingName);
    const normIng = normalizeIngredientText(ingName);
    return activeStock.some((f) => {
      if (getCanonicalShoppingIngredient(f.name).key === ingCanonical.key) return true;
      const normF = normalizeIngredientText(f.name);
      if (normF.includes(normIng) || normIng.includes(normF)) return true;
      const words = normIng.split(' ').filter((w) => w.length >= 3);
      return words.some((w) => normF.includes(w));
    });
  };

  // Handlers for Recipes & AI (uses adult count only — children are never counted as adults)
  const handleAddMissingToShopping = (recipe: Recipe, targetServingsOverride?: number) => {
    const portionInfo = getHouseholdPortionSummary(familyPreferences);
    const servingsToUse = Math.max(1, targetServingsOverride || portionInfo.adultsCount);
    const missing = recipe.ingredients.filter((i) => !isIngredientPresentInFridge(i.name));

    if (missing.length === 0) return;

    setShoppingItems((prev) => {
      const updated = [...prev];
      const addedAtBottom: ShoppingItem[] = [];

      missing.forEach((m, idx) => {
        const scaledUnit = scaleIngredientAmount(
          m.amount || '1 pièce',
          recipe.servings || 4,
          servingsToUse
        );
        const canonical = getCanonicalShoppingIngredient(m.name);

        // Check both existing items and items being added in the current batch
        const existingIdx = updated.findIndex(
          (item) => !item.checked && getCanonicalShoppingIngredient(item.name).key === canonical.key
        );
        const batchIdx = addedAtBottom.findIndex(
          (item) => getCanonicalShoppingIngredient(item.name).key === canonical.key
        );

        if (existingIdx !== -1) {
          const existing = updated[existingIdx];
          const combinedUnit = combineIngredientAmounts(existing.unit, scaledUnit);
          updated[existingIdx] = {
            ...existing,
            name: canonical.displayName,
            category: canonical.category,
            unit: combinedUnit,
            estimatedPrice: estimateIngredientPrice(canonical.displayName, combinedUnit),
            notes: existing.notes?.includes(recipe.title)
              ? existing.notes
              : `${existing.notes ? `${existing.notes} + ` : ''}${recipe.title} (${servingsToUse} ad.)`,
          };
        } else if (batchIdx !== -1) {
          const existingBatch = addedAtBottom[batchIdx];
          const combinedUnit = combineIngredientAmounts(existingBatch.unit, scaledUnit);
          addedAtBottom[batchIdx] = {
            ...existingBatch,
            unit: combinedUnit,
            estimatedPrice: estimateIngredientPrice(canonical.displayName, combinedUnit),
          };
        } else {
          addedAtBottom.push({
            id: `shop-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            name: canonical.displayName,
            category: canonical.category,
            quantity: 1,
            unit: scaledUnit,
            estimatedPrice: estimateIngredientPrice(canonical.displayName, scaledUnit),
            checked: false,
            source: 'meal_plan',
            recommendedStore: 'Carrefour Market',
            notes: `Pour "${recipe.title}" (${servingsToUse} ad.)`,
          });
        }
      });

      return [...addedAtBottom, ...updated];
    });
  };

  const handleAddRecipeToPlanner = (recipe: Recipe) => {
    setMealPlan((prev) => {
      let assigned = false;
      return prev.map((day) => {
        if (!assigned && !day.dinner) {
          assigned = true;
          return { ...day, dinner: recipe };
        }
        if (!assigned && !day.lunch) {
          assigned = true;
          return { ...day, lunch: recipe };
        }
        return day;
      });
    });
    setActiveTab('planner');
  };

  const handleGenerateAiRecipe = async (options?: AiRecipeGenerateOptions): Promise<Recipe[]> => {
    setIsGeneratingAiRecipe(true);
    try {
      const hasHabits = (familyPreferences.habitualProducts || []).length > 0;
      const mode = options?.mode || (hasHabits ? 'habits' : 'from_scratch');
      const response = await fetch('/api/recipes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fridgeItems: fridgeItems.filter((f) => !f.consumed && f.quantity > 0),
          familyProfile: familyPreferences,
          language: lang,
          deals: storeDeals,
          mode,
          theme: options?.theme || 'Quotidien réalisable & rapide',
          customPrompt: options?.customPrompt || '',
          existingTitles: recipes.map((r) => r.title),
        }),
      });

      const data = await response.json();
      if (data && data.recipes && data.recipes.length > 0) {
        const normalizedAiRecipes = recalculateRecipesListWithRealPrices(data.recipes);
        setRecipes((prev) => [...normalizedAiRecipes, ...prev]);
        return normalizedAiRecipes;
      }
      return [];
    } catch (err) {
      console.error('Failed to generate recipe:', err);
      return [];
    } finally {
      setIsGeneratingAiRecipe(false);
    }
  };

  const handleImportRecipesFromText = async (rawText: string) => {
    setIsGeneratingAiRecipe(true);
    try {
      const response = await fetch('/api/recipes/import-from-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          familyProfile: familyPreferences,
        }),
      });
      const data = await response.json();
      if (data && data.recipes && data.recipes.length > 0) {
        const normalized = recalculateRecipesListWithRealPrices(data.recipes);
        setRecipes((prev) => [...normalized, ...prev]);
      }
    } catch (err) {
      console.error('Failed to import recipe text:', err);
    } finally {
      setIsGeneratingAiRecipe(false);
    }
  };

  // Handlers for Planner
  const handleUpdateMealSlot = (
    dayIndex: number,
    mealType: 'breakfast' | 'lunch' | 'dinner',
    recipe: Recipe | null
  ) => {
    setMealPlan((prev) =>
      prev.map((day) => {
        if (day.dayIndex === dayIndex) {
          return {
            ...day,
            [mealType]: recipe,
          };
        }
        return day;
      })
    );
  };

  // Helper to score a recipe according to the household's habitualProducts + fridge stock
  const scoreRecipeByHouseholdHabits = useCallback(
    (recipe: Recipe): number => {
      const habits = familyPreferences.habitualProducts || [];

      let score = 0;
      if (recipe.tags.includes('Selon nos habitudes 🏠')) {
        score += 25;
      }

      recipe.ingredients.forEach((ing) => {
        const nIng = normalizeIngredientText(ing.name);
        const matchesHabit = habits.some((hp) => {
          const nHp = normalizeIngredientText(hp);
          if (nIng.includes(nHp) || nHp.includes(nIng)) return true;
          return nHp
            .split(' ')
            .filter((w) => w.length >= 3)
            .some((w) => nIng.includes(w));
        });
        if (matchesHabit) score += 15;
        if (isIngredientPresentInFridge(ing.name)) score += 8;
      });

      return score;
    },
    [familyPreferences.habitualProducts, fridgeItems]
  );

  const buildMealPlanFromPool = useCallback(
    (sourceRecipes: Recipe[]) => {
      // Strictly exclude any recipe containing proscribed foods or household allergens
      const safePool = sourceRecipes.filter(
        (r) => !doesRecipeContainExcludedFood(r, familyPreferences).excluded
      );
      const effectivePool = safePool.length > 0 ? safePool : sourceRecipes;

      const breakfastPool = [
        ...effectivePool.filter((r) => r.tags.includes('Petit-déjeuner')),
      ].sort((a, b) => scoreRecipeByHouseholdHabits(b) - scoreRecipeByHouseholdHabits(a));
      const lunchDinnerPool = [
        ...effectivePool.filter((r) => !r.tags.includes('Petit-déjeuner')),
      ].sort((a, b) => scoreRecipeByHouseholdHabits(b) - scoreRecipeByHouseholdHabits(a));

      const bPool = breakfastPool.length > 0 ? breakfastPool : effectivePool;
      // Take top matching recipes for the household's habits (at least 14 for varied lunches & dinners)
      const topMainPool = lunchDinnerPool.slice(0, Math.max(14, lunchDinnerPool.length));
      const ldPool = topMainPool.length > 0 ? topMainPool : effectivePool;

      if (ldPool.length === 0) return;

      const offset = Math.floor(Math.random() * Math.min(4, ldPool.length));

      setMealPlan((prev) =>
        prev.map((day, idx) => ({
          ...day,
          breakfast: bPool.length > 0 ? bPool[(idx + offset) % bPool.length] : null,
          lunch: ldPool[(idx * 2 + offset) % ldPool.length],
          dinner: ldPool[(idx * 2 + 1 + offset) % ldPool.length],
        }))
      );
    },
    [scoreRecipeByHouseholdHabits, familyPreferences]
  );

  const handleAutoGeneratePlan = () => {
    buildMealPlanFromPool(recipes);
  };

  const handleGenerateMenuFromHabits = async () => {
    setActiveTab('planner');
    const newlyGenerated = await handleGenerateAiRecipe({
      mode: 'habits',
      theme: 'Classiques Familiaux & Réconfortants',
      customPrompt: familyPreferences.mealHabitsNotes || '',
    });
    const combinedPool = [...newlyGenerated, ...recipes];
    buildMealPlanFromPool(combinedPool);
  };

  const handleGenerateHabitRecipesFromFamily = async () => {
    setActiveTab('recipes');
    await handleGenerateAiRecipe({
      mode: 'habits',
      theme: 'Quotidien réalisable & rapide',
      customPrompt: familyPreferences.mealHabitsNotes || '',
    });
  };

  const handleNavigateToFamilyHabits = () => {
    setActiveTab('family');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('doudous-foyer-tab', { detail: 'habits' }));
      const el = document.getElementById('foyer-habitual-products');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  };

  const handleExportPlanToShopping = () => {
    const plannedRecipes = mealPlan
      .flatMap((d) => [d.breakfast, d.lunch, d.dinner])
      .filter((r): r is Recipe => r != null);

    if (plannedRecipes.length === 0) return;

    const portionInfo = getHouseholdPortionSummary(familyPreferences);
    // Strictly scale by adult count (children are never counted as adults)
    const servingsToUse = Math.max(1, portionInfo.adultsCount);

    const missingMap = new Map<string, ShoppingItem>();

    plannedRecipes.forEach((recipe) => {
      recipe.ingredients
        .filter((ing) => !isIngredientPresentInFridge(ing.name))
        .forEach((ing) => {
          const canonical = getCanonicalShoppingIngredient(ing.name);
          const scaledUnit = scaleIngredientAmount(
            ing.amount || '1 pièce',
            recipe.servings || 4,
            servingsToUse
          );

          if (!missingMap.has(canonical.key)) {
            missingMap.set(canonical.key, {
              id: `shop-plan-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              name: canonical.displayName,
              category: canonical.category,
              quantity: 1,
              unit: scaledUnit,
              estimatedPrice: estimateIngredientPrice(canonical.displayName, scaledUnit),
              checked: false,
              source: 'meal_plan',
              recommendedStore: 'Carrefour Market',
              notes: `Menu semaine (${recipe.title} · ${servingsToUse} ad.)`,
            });
          } else {
            const existing = missingMap.get(canonical.key)!;
            const combinedUnit = combineIngredientAmounts(existing.unit, scaledUnit);
            missingMap.set(canonical.key, {
              ...existing,
              unit: combinedUnit,
              estimatedPrice: estimateIngredientPrice(canonical.displayName, combinedUnit),
              notes: existing.notes?.includes(recipe.title)
                ? existing.notes
                : `${existing.notes} + ${recipe.title}`,
            });
          }
        });
    });

    const toAdd = Array.from(missingMap.values());
    if (toAdd.length > 0) {
      setShoppingItems((prev) => {
        // On retire les anciens articles non cochés issus d'un précédent export du menu
        // pour éviter tout doublon ou cumul artificiel si on reclique sur "Générer courses"
        const preserved = prev.filter((item) => item.checked || item.source !== 'meal_plan');
        const updated = [...preserved];
        const brandNew: ShoppingItem[] = [];

        toAdd.forEach((newItem) => {
          const canonical = getCanonicalShoppingIngredient(newItem.name);
          const existingIdx = updated.findIndex(
            (item) => !item.checked && getCanonicalShoppingIngredient(item.name).key === canonical.key
          );
          if (existingIdx !== -1) {
            const existing = updated[existingIdx];
            const combinedUnit = combineIngredientAmounts(existing.unit, newItem.unit);
            updated[existingIdx] = {
              ...existing,
              name: canonical.displayName,
              category: canonical.category,
              unit: combinedUnit,
              estimatedPrice: estimateIngredientPrice(canonical.displayName, combinedUnit),
              notes: newItem.notes,
            };
          } else {
            brandNew.push(newItem);
          }
        });

        return [...brandNew, ...updated];
      });
    }
  };

  // Handlers for Shopping
  const handleToggleShoppingItem = (id: string) => {
    setShoppingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  const handleDeleteShoppingItem = (id: string) => {
    deletedIdsRef.current.add(id);
    setShoppingItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleAddShoppingItem = (item: Omit<ShoppingItem, 'id'>) => {
    const canonical = getCanonicalShoppingIngredient(item.name);
    setShoppingItems((prev) => {
      const existingIdx = prev.findIndex(
        (existing) =>
          !existing.checked && getCanonicalShoppingIngredient(existing.name).key === canonical.key
      );
      if (existingIdx !== -1) {
        const existing = prev[existingIdx];
        const combinedUnit = combineIngredientAmounts(existing.unit, item.unit);
        const updated = [...prev];
        updated[existingIdx] = {
          ...existing,
          category: item.category && item.category !== 'other' ? item.category : canonical.category,
          quantity: existing.quantity + (item.quantity || 1) - 1,
          unit: combinedUnit,
          estimatedPrice: estimateIngredientPrice(existing.name, combinedUnit),
        };
        return updated;
      }
      const newItem: ShoppingItem = {
        ...item,
        id: `shop-${Date.now()}`,
        category:
          item.category && item.category !== 'other'
            ? item.category
            : inferIngredientCategory(item.name),
      };
      return [newItem, ...prev];
    });
  };

  const handleUpdateShoppingItemPriceOrQty = (
    id: string,
    updates: { quantity?: number; estimatedPrice?: number }
  ) => {
    setShoppingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const handleClearCheckedShopping = () => {
    setShoppingItems((prev) => {
      prev.filter((i) => i.checked).forEach((i) => deletedIdsRef.current.add(i.id));
      return prev.filter((i) => !i.checked);
    });
  };

  const handleClearAllShopping = () => {
    shoppingItems.forEach((i) => deletedIdsRef.current.add(i.id));
    clearAllShoppingFlagRef.current = true;
    setShoppingItems([]);
  };

  const handleRestoreShoppingItems = (restoredItems: ShoppingItem[]) => {
    restoredItems.forEach((i) => deletedIdsRef.current.delete(i.id));
    clearAllShoppingFlagRef.current = false;
    setShoppingItems(restoredItems);
  };

  const handleFinishShoppingAndStoreInFridge = () => {
    const checked = shoppingItems.filter((i) => i.checked);
    if (checked.length === 0) return;

    checked.forEach((i) => deletedIdsRef.current.add(i.id));
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);

    const converted: FridgeItem[] = checked.map((item, idx) => {
      const targetZone: StorageZone =
        item.category === 'baby_care' || item.category === 'breast_milk'
          ? 'baby_care'
          : item.category === 'household' || item.category === 'hygiene'
          ? 'household'
          : item.category === 'pantry' || item.category === 'bakery'
          ? 'pantry'
          : item.category === 'frozen'
          ? 'freezer'
          : 'fridge';

      return {
        id: `item-from-shop-${Date.now()}-${idx}`,
        name: item.name,
        category: item.category,
        zone: targetZone,
        quantity: item.quantity,
        unit: item.unit,
        expirationDate: targetDate.toISOString().split('T')[0],
        addedDate: new Date().toISOString().split('T')[0],
        autoRestock: item.source === 'fridge_staple',
        restockThreshold: 1,
        notes: `Acheté à ${item.recommendedStore || 'Supermarché'}`,
      };
    });

    setFridgeItems((prev) => [...converted, ...prev]);
    setShoppingItems((prev) => prev.filter((i) => !i.checked));
  };

  // Handlers for Loyalty Cards & Stores
  const handleAddLoyaltyCard = (cardData: Omit<LoyaltyCard, 'id'>) => {
    const newCard: LoyaltyCard = {
      ...cardData,
      id: `card-${Date.now()}`,
    };
    setLoyaltyCards((prev) => [newCard, ...prev]);
  };

  const handleDeleteLoyaltyCard = (id: string) => {
    deletedIdsRef.current.add(id);
    setLoyaltyCards((prev) => prev.filter((c) => c.id !== id));
  };

  // Haversine formula for real distance in km
  const calculateDistanceKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const [storeRadiusKm, setStoreRadiusKm] = useState<number>(() => {
    const saved = localStorage.getItem('doudous_v3_store_radius_km');
    return saved ? Number(saved) : 15;
  });

  const detectBrandCode = (
    name: string
  ): 'carrefour' | 'leclerc' | 'lidl' | 'intermarche' | 'auchan' | 'monoprix' | 'custom' => {
    const n = name.toLowerCase();
    if (n.includes('carrefour')) return 'carrefour';
    if (n.includes('leclerc')) return 'leclerc';
    if (n.includes('lidl')) return 'lidl';
    if (n.includes('intermarch')) return 'intermarche';
    if (n.includes('auchan')) return 'auchan';
    if (n.includes('monoprix')) return 'monoprix';
    return 'custom';
  };

  const fetchRealNearbyStores = useCallback(
    async (lat: number, lng: number, defaultCityName: string, radiusKmOverride?: number) => {
      const activeRadiusKm = radiusKmOverride ?? storeRadiusKm ?? 15;
      const radiusMeters = Math.round(activeRadiusKm * 1000);
      const parsedStores: StoreLocation[] = [];
      const seenKeys = new Set<string>();

      const addCandidateStore = (
        id: string,
        rawName: string,
        sLat: number,
        sLng: number,
        addressStr: string,
        cityStr: string
      ) => {
        const dist = calculateDistanceKm(lat, lng, sLat, sLng);
        if (dist > activeRadiusKm + 0.5) return;
        const dedupKey = `${rawName.toLowerCase().trim()}-${Math.round(dist * 2)}`;
        if (seenKeys.has(dedupKey)) return;
        seenKeys.add(dedupKey);

        parsedStores.push({
          id,
          name: rawName,
          brandCode: detectBrandCode(rawName),
          address: addressStr || 'Zone commerciale / Proximité',
          city: cityStr || defaultCityName,
          distanceKm: Number(dist.toFixed(1)),
          lat: sLat,
          lng: sLng,
          isOpen: true,
          activeDealsCount: 0,
        });
      };

      // 1. Primary search: Overpass API (single-pass nwr query across multiple mirrors)
      const overpassQuery = `[out:json][timeout:18];(nwr["shop"~"^(supermarket|hypermarket|convenience)$"](around:${radiusMeters},${lat},${lng}););out center 80;`;
      const overpassMirrors = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
      ];

      for (const mirror of overpassMirrors) {
        if (parsedStores.length > 0) break;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 9000);
          const url = `${mirror}?data=${encodeURIComponent(overpassQuery)}`;
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!res.ok) continue;
          const data = await res.json();

          if (data && Array.isArray(data.elements)) {
            for (const el of data.elements) {
              const tags = el.tags || {};
              const rawName = tags.name || tags.brand || tags.operator;
              if (!rawName) continue;

              const sLat = el.lat ?? el.center?.lat;
              const sLng = el.lon ?? el.center?.lon;
              if (typeof sLat !== 'number' || typeof sLng !== 'number') continue;

              const street = [tags['addr:housenumber'], tags['addr:street']]
                .filter(Boolean)
                .join(' ');
              const city =
                tags['addr:city'] ||
                tags['addr:town'] ||
                tags['addr:village'] ||
                tags['addr:municipality'] ||
                tags['addr:suburb'] ||
                defaultCityName;

              addCandidateStore(
                `osm-${el.id}`,
                rawName,
                sLat,
                sLng,
                street || tags['addr:place'] || 'Supermarché / Drive',
                city
              );
            }
          }
        } catch (err) {
          console.warn(`Overpass mirror ${mirror} failed:`, err);
        }
      }

      // 2. Fallback: Nominatim OpenStreetMap bounding-box search if Overpass returned 0 or timed out
      if (parsedStores.length === 0) {
        try {
          const latDelta = activeRadiusKm / 111.0;
          const lngDelta =
            activeRadiusKm / (111.0 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
          const viewbox = `${(lng - lngDelta).toFixed(4)},${(lat + latDelta).toFixed(4)},${(
            lng + lngDelta
          ).toFixed(4)},${(lat - latDelta).toFixed(4)}`;

          const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=supermarket&bounded=1&viewbox=${viewbox}&limit=40&accept-language=fr`;
          const res = await fetch(nomUrl);
          if (res.ok) {
            const items = await res.json();
            if (Array.isArray(items)) {
              for (const item of items) {
                const sLat = parseFloat(item.lat);
                const sLng = parseFloat(item.lon);
                if (isNaN(sLat) || isNaN(sLng)) continue;
                const rawName =
                  item.name ||
                  item.address?.shop ||
                  item.address?.retail ||
                  (item.display_name ? item.display_name.split(',')[0] : '');
                if (!rawName) continue;
                const addr = item.address || {};
                const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
                const city =
                  addr.city || addr.town || addr.village || addr.municipality || defaultCityName;
                addCandidateStore(
                  `nom-${item.place_id}`,
                  rawName,
                  sLat,
                  sLng,
                  street,
                  city
                );
              }
            }
          }
        } catch (err) {
          console.warn('Nominatim store fallback failed:', err);
        }
      }

      parsedStores.sort((a, b) => a.distanceKm - b.distanceKm);
      setStores(parsedStores.slice(0, 24));
    },
    [storeRadiusKm]
  );

  const reverseGeocodeCity = async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&accept-language=fr`
      );
      if (res.ok) {
        const data = await res.json();
        const addr = data?.address;
        const foundCity =
          addr?.city ||
          addr?.town ||
          addr?.village ||
          addr?.municipality ||
          addr?.county;
        if (foundCity) return foundCity;
      }
    } catch {
      // ignore
    }
    return 'Ma position GPS';
  };

  const applySharedLocation = useCallback(
    async (lat: number, lng: number, explicitCity?: string, radiusKmOverride?: number) => {
      const coords = { lat, lng };
      setUserCoords(coords);
      localStorage.setItem('doudous_v3_coords', JSON.stringify(coords));

      const resolvedCity = explicitCity || (await reverseGeocodeCity(lat, lng));
      setCityName(resolvedCity);
      localStorage.setItem('doudous_v3_city', resolvedCity);

      await fetchRealNearbyStores(lat, lng, resolvedCity, radiusKmOverride);
    },
    [fetchRealNearbyStores]
  );

  const handleUpdateStoreRadius = useCallback(
    async (newRadiusKm: number) => {
      setStoreRadiusKm(newRadiusKm);
      localStorage.setItem('doudous_v3_store_radius_km', String(newRadiusKm));
      if (userCoords) {
        setIsLocating(true);
        try {
          await fetchRealNearbyStores(userCoords.lat, userCoords.lng, cityName, newRadiusKm);
        } finally {
          setIsLocating(false);
        }
      }
    },
    [userCoords, cityName, fetchRealNearbyStores]
  );

  const handleGeolocate = useCallback(() => {
    setIsLocating(true);
    const fallbackIpLocation = async () => {
      try {
        const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
        if (res.ok) {
          const data = await res.json();
          const lat = parseFloat(data.latitude);
          const lng = parseFloat(data.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            await applySharedLocation(lat, lng, data.city || undefined);
            setIsLocating(false);
            return;
          }
        }
      } catch {
        // ignore
      }
      setIsLocating(false);
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await applySharedLocation(
            position.coords.latitude,
            position.coords.longitude
          );
          setIsLocating(false);
        },
        async () => {
          await fallbackIpLocation();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    } else {
      fallbackIpLocation();
    }
  }, [applySharedLocation]);

  const handleSearchCity = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setIsLocating(true);
      try {
        // 1. Check French official communes API first (handles 5-digit postal codes & French towns accurately)
        const isPostalCode = /^\d{5}$/.test(trimmed);
        const gouvUrl = isPostalCode
          ? `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(
              trimmed
            )}&fields=nom,centre,codesPostaux&limit=1`
          : `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(
              trimmed
            )}&fields=nom,centre,codesPostaux&boost=population&limit=1`;

        try {
          const gouvRes = await fetch(gouvUrl);
          if (gouvRes.ok) {
            const communes = await gouvRes.json();
            if (Array.isArray(communes) && communes.length > 0 && communes[0].centre?.coordinates) {
              const [lon, lat] = communes[0].centre.coordinates;
              const cp = communes[0].codesPostaux?.[0];
              const label = cp ? `${communes[0].nom} (${cp})` : communes[0].nom;
              await applySharedLocation(lat, lon, label);
              return;
            }
          }
        } catch {
          // fallback to Open-Meteo geocoding below
        }

        // 2. Fallback to Open-Meteo global geocoding
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            trimmed
          )}&count=1&language=fr&format=json`
        );
        const data = await res.json();
        if (data?.results && data.results.length > 0) {
          const best = data.results[0];
          const label = best.admin2 ? `${best.name} (${best.admin2})` : best.name;
          await applySharedLocation(best.latitude, best.longitude, label);
        }
      } catch (e) {
        console.warn('City search failed:', e);
      } finally {
        setIsLocating(false);
      }
    },
    [applySharedLocation]
  );

  // Auto-init shared geolocation & nearby stores on mount
  useEffect(() => {
    if (userCoords) {
      fetchRealNearbyStores(userCoords.lat, userCoords.lng, cityName, storeRadiusKm);
    } else {
      handleGeolocate();
    }
  }, []);

  const handleJoinHousehold = (newCode: string) => {
    setHouseholdCode(newCode);
    localStorage.setItem('doudous_v3_household_code', newCode);
  };

  const handleResetHousehold = async () => {
    isRemoteUpdate.current = true;
    const blankPlan = createBlankMealPlan();
    setFridgeItems([]);
    setShoppingItems([]);
    setBreastMilkBatches([]);
    setChores([]);
    setNotifications([]);
    setLoyaltyCards([]);
    setAppliances(INITIAL_APPLIANCES);
    setFamilyPreferences(INITIAL_FAMILY_PREFERENCES);
    setMealPlan(blankPlan);
    localStorage.removeItem('doudous_v3_last_feeding');
    localStorage.removeItem('doudous_v3_diversification');
    localStorage.removeItem('doudous_v3_diversification_by_child');
    localStorage.removeItem('doudous_v3_health_notes');
    localStorage.removeItem('doudous_v3_health_by_child');
    localStorage.removeItem('doudous_v3_diaper_bag');
    localStorage.removeItem('doudous_v3_bag_by_child');
    localStorage.removeItem('doudous_v3_med_doses');
    localStorage.removeItem('doudous_v3_pharmacy_checks');
    localStorage.removeItem('doudous_v3_homeworks_by_child');
    localStorage.removeItem('doudous_v3_schedule_by_child');

    try {
      await fetch(`/api/household/${householdCode}/reset`, { method: 'POST' });
    } catch {
      // ignore
    }
    setTimeout(() => {
      isRemoteUpdate.current = false;
      syncToServer({
        fridgeItems: [],
        recipes,
        mealPlan: blankPlan,
        shoppingItems: [],
        loyaltyCards: [],
        familyPreferences: INITIAL_FAMILY_PREFERENCES,
        appliances: INITIAL_APPLIANCES,
        breastMilkBatches: [],
        chores: [],
        notifications: [],
      });
    }, 300);
  };

  const pendingAlertsCount =
    appliances.filter((a) => a.status === 'completed_waiting_action').length +
    notifications.filter((n) => !n.acknowledged).length;

  const uncheckedShoppingCount = shoppingItems.filter((i) => !i.checked).length;

  // 5 Clear, Purpose-Built Mobile Navigation Pillars
  const navItems = [
    { id: 'fridge', label: 'Stocks', icon: Refrigerator },
    { id: 'daily', label: "Aujourd'hui", icon: Home, badge: pendingAlertsCount },
    { id: 'planner', label: 'Repas', icon: Calendar },
    { id: 'shopping', label: 'Courses', icon: ShoppingBag, badge: uncheckedShoppingCount },
    { id: 'family', label: 'Foyer', icon: Users },
  ];

  const isCuisineGroup = activeTab === 'recipes' || activeTab === 'planner';
  const isShoppingGroup = activeTab === 'shopping' || activeTab === 'loyalty';

  const latestUnacknowledgedApplianceNotif = notifications.find(
    (n) => !n.acknowledged && n.type === 'appliance'
  );

  const detectedChildrenInHousehold = getDetectedChildren(familyPreferences.members);
  const hasYoungChildren = detectedChildrenInHousehold.some((c) => c.totalMonths < 36);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 w-full overflow-x-hidden">
      {/* Sticky Top Wrapper (No backdrop-filter on parent so fixed modals are never trapped!) */}
      <div className="sticky top-0 z-30 w-full max-w-full shadow-2xs">
        {/* Top-of-Page Chunked Receipt Parsing Progress Bar */}
        {receiptParsingProgress?.active && (
          <div className="bg-slate-900 text-white border-b border-emerald-500/40 w-full">
            <div className="w-full h-1.5 bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-300 ease-out"
                style={{
                  width: `${Math.max(
                    8,
                    Math.round(
                      (receiptParsingProgress.processedCount /
                        Math.max(1, receiptParsingProgress.totalCount)) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
            <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
                <span className="font-bold text-emerald-300 shrink-0">
                  Parsing du ticket (Lot {receiptParsingProgress.currentChunk}/
                  {receiptParsingProgress.totalChunks}) :
                </span>
                <span className="text-slate-200 truncate">
                  {receiptParsingProgress.currentLabel}
                </span>
              </div>
              <span className="font-extrabold text-emerald-400 tabular-nums shrink-0">
                {receiptParsingProgress.processedCount} / {receiptParsingProgress.totalCount} articles (
                {Math.round(
                  (receiptParsingProgress.processedCount /
                    Math.max(1, receiptParsingProgress.totalCount)) *
                    100
                )}
                %)
              </span>
            </div>
          </div>
        )}

        {/* Bandeau Météo 7j/24h & Conseil Tenue Bébé (Portail plein écran garanti) */}
        <WeatherBanner
          lang={lang}
          userCoords={userCoords}
          cityName={cityName}
          onRequestGeolocate={handleGeolocate}
          members={familyPreferences.members}
        />

        {/* Top App Bar */}
        <header className="bg-white border-b border-slate-200 w-full max-w-full">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 h-13 sm:h-14 flex items-center justify-between gap-2 sm:gap-4">
            {/* Brand */}
            <div
              onClick={() => setActiveTab('fridge')}
              className="flex items-center gap-2 whitespace-nowrap min-w-0 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                <Home className="w-4 h-4" />
              </div>
              <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900 font-display truncate">
                Doudou's Home
              </span>
            </div>

            {/* Desktop Navigation (5 clear pillars) */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {navItems.map((item) => {
                const isActive =
                  activeTab === item.id ||
                  (item.id === 'planner' && isCuisineGroup) ||
                  (item.id === 'shopping' && isShoppingGroup);
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span className="px-1.5 py-0.2 text-[10px] font-extrabold bg-emerald-600 text-white rounded-full tabular-nums">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            {/* Compact Right Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => {
                  setBrowserPushPerm(getBrowserNotificationPermission());
                  setIsPushModalOpen(true);
                }}
                className={`min-h-[36px] flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  pushSettings.enabled
                    ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
                title="Configurer les notifications Push (Tâches du quotidien, Alertes péremptions & Vaccins)"
              >
                <BellRing
                  className={`w-3.5 h-3.5 shrink-0 ${
                    pushSettings.enabled ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                />
                <span>Push</span>
              </button>

              <button
                onClick={() => {
                  setSyncModalTab('install');
                  setIsSyncModalOpen(true);
                }}
                className="min-h-[36px] flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                title="Installer sur téléphone ou partager avec votre conjoint(e)"
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span className="sm:hidden">Foyer QR</span>
                <span className="hidden sm:inline">Installer / Partager</span>
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* Live Push Notification Floating Banners */}
      {pushToasts.length > 0 && (
        <div className="fixed top-20 right-4 z-[9990] w-full max-w-sm space-y-2 pointer-events-none px-4 sm:px-0">
          {pushToasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto p-3.5 rounded-2xl bg-slate-900/95 text-white shadow-2xl border border-slate-700 flex items-start justify-between gap-3 backdrop-blur-md"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  className={`p-2 rounded-xl shrink-0 ${
                    toast.category === 'expiry'
                      ? 'bg-rose-500/20 text-rose-400'
                      : toast.category === 'vaccine'
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  <BellRing className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-400">
                      Notification Push · {toast.timestamp}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-white mt-0.5">{toast.title}</p>
                  <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">{toast.body}</p>
                </div>
              </div>
              <button
                onClick={() =>
                  setPushToasts((prev) => prev.filter((item) => item.id !== toast.id))
                }
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Global Live Family Appliance Reminder Bar */}
      {latestUnacknowledgedApplianceNotif && activeTab !== 'daily' && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 shadow-xs">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 truncate">
              <BellRing className="w-4 h-4 shrink-0" />
              <span className="font-bold truncate">
                {latestUnacknowledgedApplianceNotif.title}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setActiveTab('daily')}
                className="px-2.5 py-1 bg-slate-900 text-white rounded-lg font-bold text-[11px] cursor-pointer"
              >
                Voir
              </button>
              <button
                onClick={() => handleDismissNotification(latestUnacknowledgedApplianceNotif.id)}
                className="px-2 py-1 bg-white/80 text-slate-900 rounded-lg font-bold text-[11px] cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 pb-24 md:pb-12">
        {activeTab === 'fridge' && (
          <FridgeView
            items={fridgeItems}
            lang={lang}
            onAddItemClick={() => setIsScanModalOpen(true)}
            onOpenPhotoScan={() => setIsPhotoScanModalOpen(true)}
            onConsumeItem={handleConsumeFridgeItem}
            onDeleteItem={handleDeleteFridgeItem}
            onAddToShopping={handleQuickAddToShopping}
            onUpdateQuantity={handleUpdateFridgeQuantity}
            onNavigateToRecipes={() => setActiveTab('recipes')}
            onQuickAddEverydayItem={handleAddItemFromScan}
            onThawItemToFridge={handleThawFridgeItem}
            hasYoungChildren={hasYoungChildren}
          />
        )}

        {activeTab === 'daily' && (
          <DailyHomeView
            appliances={appliances}
            breastMilkBatches={breastMilkBatches}
            chores={chores}
            notifications={notifications}
            members={familyPreferences.members}
            lang={lang}
            onStartAppliance={handleStartAppliance}
            onFinishApplianceNow={handleFinishApplianceNow}
            onAcknowledgeAppliance={handleAcknowledgeAppliance}
            onAddBreastMilk={handleAddBreastMilk}
            onUseBreastMilk={handleUseBreastMilk}
            onMoveBreastMilkToFridge={handleMoveBreastMilkToFridge}
            onToggleChore={handleToggleChore}
            onAddChore={handleAddChore}
            onDeleteChore={handleDeleteChore}
            onSendNotification={handleSendNotification}
            onDismissNotification={handleDismissNotification}
            onNavigateToFamily={() => setActiveTab('family')}
            onToggleVaccineCompleted={handleToggleVaccineCompletedFromDaily}
            onSendChorePush={handleSendChorePushNow}
          />
        )}

        {/* Repas Workspace: Unified Menu 7j + Recettes & Chef IA */}
        {isCuisineGroup && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:inline-flex bg-white p-1 rounded-2xl border border-slate-200 w-full sm:w-auto shadow-2xs">
              <button
                onClick={() => setActiveTab('planner')}
                className={`min-h-[40px] px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'planner'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span>Menu de la semaine</span>
              </button>
              <button
                onClick={() => setActiveTab('recipes')}
                className={`min-h-[40px] px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'recipes'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Idées Recettes & IA</span>
              </button>
            </div>

            {activeTab === 'recipes' ? (
              <RecipesView
                recipes={recipes}
                fridgeItems={fridgeItems}
                familyProfile={familyPreferences}
                lang={lang}
                onAddMissingToShopping={handleAddMissingToShopping}
                onAddToPlanner={handleAddRecipeToPlanner}
                onGenerateAiRecipe={async (opts) => {
                  await handleGenerateAiRecipe(opts);
                }}
                onImportRecipesFromText={handleImportRecipesFromText}
                isGeneratingAi={isGeneratingAiRecipe}
                onUpdateFamilyProfile={setFamilyPreferences}
                onNavigateToFamilyHabits={handleNavigateToFamilyHabits}
              />
            ) : (
              <PlannerView
                mealPlan={mealPlan}
                availableRecipes={recipes}
                familyProfile={familyPreferences}
                fridgeItems={fridgeItems}
                lang={lang}
                onUpdateMeal={handleUpdateMealSlot}
                onAutoGeneratePlan={handleAutoGeneratePlan}
                onExportPlanToShopping={handleExportPlanToShopping}
                onAddMissingToShopping={handleAddMissingToShopping}
                onGenerateMenuFromHabits={handleGenerateMenuFromHabits}
                isGeneratingAi={isGeneratingAiRecipe}
                onNavigateToFamilyHabits={handleNavigateToFamilyHabits}
              />
            )}
          </div>
        )}

        {/* Courses & Cartes de Fidélité Workspace (Grouped together for Supermarket use!) */}
        {isShoppingGroup && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:inline-flex bg-white p-1 rounded-2xl border border-slate-200 w-full sm:w-auto shadow-2xs">
              <button
                onClick={() => setActiveTab('shopping')}
                className={`min-h-[40px] px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'shopping'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                <span>Liste de courses ({uncheckedShoppingCount})</span>
              </button>
              <button
                onClick={() => setActiveTab('loyalty')}
                className={`min-h-[40px] px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'loyalty'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 shrink-0" />
                <span>Cartes & Magasins ({loyaltyCards.length})</span>
              </button>
            </div>

            {activeTab === 'shopping' ? (
              <ShoppingView
                items={shoppingItems}
                lang={lang}
                familyProfile={familyPreferences}
                onUpdateHouseholdSize={(newSize) =>
                  setFamilyPreferences({
                    ...familyPreferences,
                    adultsCount: newSize,
                    householdSize: newSize,
                  })
                }
                weeklyBudget={familyPreferences.weeklyBudget}
                onUpdateWeeklyBudget={(newBudget) =>
                  setFamilyPreferences({ ...familyPreferences, weeklyBudget: newBudget })
                }
                onUpdateItemPriceOrQty={handleUpdateShoppingItemPriceOrQty}
                onToggleItem={handleToggleShoppingItem}
                onDeleteItem={handleDeleteShoppingItem}
                onAddItem={handleAddShoppingItem}
                onClearChecked={handleClearCheckedShopping}
                onClearAll={handleClearAllShopping}
                onRestoreItems={handleRestoreShoppingItems}
                onFinishShoppingAndStore={handleFinishShoppingAndStoreInFridge}
                onOpenLoyaltyCards={() => setActiveTab('loyalty')}
                loyaltyCardsCount={loyaltyCards.length}
                onUpdateDriveSpec={(canonicalKey, spec) => {
                  const nextSpecs = { ...(familyPreferences.driveProductSpecs || {}) };
                  if (!spec.trim()) {
                    delete nextSpecs[canonicalKey];
                  } else {
                    nextSpecs[canonicalKey] = spec.trim();
                  }
                  setFamilyPreferences({
                    ...familyPreferences,
                    driveProductSpecs: nextSpecs,
                  });
                }}
                onUpdateDriveProductUrl={(canonicalKey, url) => {
                  const nextUrls = { ...(familyPreferences.driveProductUrls || {}) };
                  if (!url.trim()) {
                    delete nextUrls[canonicalKey];
                  } else {
                    nextUrls[canonicalKey] = url.trim();
                  }
                  setFamilyPreferences({
                    ...familyPreferences,
                    driveProductUrls: nextUrls,
                  });
                }}
                onUpdateLeclercStoreUrl={(storeUrl) =>
                  setFamilyPreferences({
                    ...familyPreferences,
                    leclercStoreUrl: storeUrl.trim(),
                  })
                }
                onUpdatePreferredDriveBrand={(brand) =>
                  setFamilyPreferences({
                    ...familyPreferences,
                    preferredDriveBrand: brand,
                  })
                }
              />
            ) : (
              <LoyaltyView
                cards={loyaltyCards}
                stores={stores}
                deals={storeDeals}
                lang={lang}
                onAddCard={handleAddLoyaltyCard}
                onDeleteCard={handleDeleteLoyaltyCard}
                onGeolocate={handleGeolocate}
                onSearchCity={handleSearchCity}
                isLocating={isLocating}
                userCoords={userCoords}
                cityName={cityName}
                storeRadiusKm={storeRadiusKm}
                onUpdateStoreRadius={handleUpdateStoreRadius}
              />
            )}
          </div>
        )}

        {/* Foyer: Direct Household Settings (No redundant outer sub-switch!) */}
        {activeTab === 'family' && (
          <FamilyView
            preferences={familyPreferences}
            lang={lang}
            onUpdatePreferences={setFamilyPreferences}
            fridgeItems={fridgeItems}
            onResetHousehold={handleResetHousehold}
            onOpenShareModal={() => {
              setSyncModalTab('invite');
              setIsSyncModalOpen(true);
            }}
            onNotifyVaccineReminder={handleNotifyVaccineReminder}
            onGenerateHabitRecipes={handleGenerateHabitRecipesFromFamily}
            onGenerateHabitMenu={handleGenerateMenuFromHabits}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (5 clear thumb-friendly pillars) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white border-t border-slate-200 shadow-lg py-1 px-1">
        <div className="grid grid-cols-5 items-center max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('fridge')}
            className={`min-h-[50px] flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
              activeTab === 'fridge' ? 'text-emerald-600 font-bold' : 'text-slate-500'
            }`}
          >
            <Refrigerator className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Stocks</span>
          </button>

          <button
            onClick={() => setActiveTab('daily')}
            className={`relative min-h-[50px] flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
              activeTab === 'daily' ? 'text-emerald-600 font-bold' : 'text-slate-500'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Aujourd'hui</span>
            {pendingAlertsCount > 0 && (
              <span className="absolute top-1 right-3 w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[9px] font-extrabold flex items-center justify-center tabular-nums">
                {pendingAlertsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('planner')}
            className={`min-h-[50px] flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
              isCuisineGroup ? 'text-emerald-600 font-bold' : 'text-slate-500'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Repas</span>
          </button>

          <button
            onClick={() => setActiveTab('shopping')}
            className={`relative min-h-[50px] flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
              isShoppingGroup ? 'text-emerald-600 font-bold' : 'text-slate-500'
            }`}
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Courses</span>
            {uncheckedShoppingCount > 0 && (
              <span className="absolute top-1 right-3 w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] font-extrabold flex items-center justify-center tabular-nums">
                {uncheckedShoppingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('family')}
            className={`min-h-[50px] flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
              activeTab === 'family' ? 'text-emerald-600 font-bold' : 'text-slate-500'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Foyer</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      <ScanModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onAddItem={handleAddItemFromScan}
      />

      <PhotoScanModal
        isOpen={isPhotoScanModalOpen}
        onClose={() => setIsPhotoScanModalOpen(false)}
        onAddDetectedItems={handleAddDetectedItemsFromPhoto}
      />

      <ShareHouseholdModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        householdCode={householdCode}
        onJoinHousehold={handleJoinHousehold}
        onManualSync={() => syncToServer()}
        isSyncing={isSyncing}
        lastSyncedTime={lastSyncedTime}
        initialTab={syncModalTab}
      />

      {/* Push Notifications Configuration Modal via Portal */}
      {isPushModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={() => setIsPushModalOpen(false)}
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-slide-up"
            >
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <BellRing className="w-4 h-4 text-emerald-400 shrink-0" />
                  <h3 className="text-sm font-bold truncate">
                    Notifications Push (Quotidien, DLC & Vaccins)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPushModalOpen(false)}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Fermer</span>
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-4">
                {/* Browser Permission Status */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      Autorisation Push du téléphone / navigateur
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {browserPushPerm === 'granted'
                        ? '✓ Notifications système activées sur cet appareil'
                        : browserPushPerm === 'denied'
                        ? 'Bannières Push internes actives (autorisation navigateur bloquée)'
                        : 'Activez pour recevoir les alertes même en arrière-plan'}
                    </p>
                  </div>
                  {browserPushPerm !== 'granted' && (
                    <button
                      type="button"
                      onClick={handleEnableBrowserPush}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                    >
                      Autoriser
                    </button>
                  )}
                </div>

                {/* Toggles */}
                <div className="space-y-2.5">
                  <label className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50">
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        ⚠️ Alertes Péremptions (Stocks & Frigo)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Notification Push automatique dès J-2 avant la date de péremption
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={pushSettings.expiryAlerts}
                      onChange={(e) =>
                        handleUpdatePushSettings({
                          ...pushSettings,
                          enabled: true,
                          expiryAlerts: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                  </label>

                  <label className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50">
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        ✅ Tâches du Quotidien & Machines
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Rappels aux heures programmées, nouvelles tâches et fin de machine
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={pushSettings.choreReminders}
                      onChange={(e) =>
                        handleUpdatePushSettings({
                          ...pushSettings,
                          enabled: true,
                          choreReminders: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                  </label>

                  <label className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50">
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        💉 Échéances Vaccinales des Enfants
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Alerte automatique dans Quotidien et en Push dès 14 jours avant le vaccin
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={pushSettings.vaccineReminders}
                      onChange={(e) =>
                        handleUpdatePushSettings({
                          ...pushSettings,
                          enabled: true,
                          vaccineReminders: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                  </label>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleTriggerManualPushScan}
                    className="flex-1 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <BellRing className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tester / Vérifier mes alertes maintenant</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPushModalOpen(false)}
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
