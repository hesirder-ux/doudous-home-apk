export type Language = 'fr' | 'en' | 'es' | 'de';

export type StorageZone = 'fridge' | 'freezer' | 'pantry' | 'baby_care' | 'household';

export type FoodCategory =
  | 'dairy'
  | 'vegetables'
  | 'fruits'
  | 'meat_fish'
  | 'bakery'
  | 'pantry'
  | 'beverages'
  | 'frozen'
  | 'baby_care'
  | 'breast_milk'
  | 'household'
  | 'hygiene'
  | 'other';

export interface FridgeItem {
  id: string;
  name: string;
  category: FoodCategory;
  zone: StorageZone;
  quantity: number;
  unit: string; // 'pièce(s)', 'g', 'kg', 'L', 'ml', 'brique', 'paquet', etc.
  expirationDate: string; // ISO 'YYYY-MM-DD'
  addedDate: string;
  autoRestock: boolean;
  restockThreshold: number;
  notes?: string;
  consumed?: boolean;
}

export interface BreastMilkBatch {
  id: string;
  expressedAt: string; // ISO datetime or 'YYYY-MM-DD HH:mm'
  volumeMl: number;
  storageLocation: 'ambient' | 'fridge' | 'freezer';
  expiresAt: string; // ISO datetime or 'YYYY-MM-DD HH:mm'
  babyName: string;
  notes?: string;
  used?: boolean;
}

export interface ApplianceTask {
  id: string;
  type: 'washing_machine' | 'dishwasher' | 'dryer' | 'sterilizer' | 'robot_cooker';
  name: string;
  program: string;
  status: 'idle' | 'running' | 'completed_waiting_action';
  startedBy: string;
  startedAt?: string;
  durationMinutes: number;
  remainingMinutes: number;
  actionReminderText: string; // ex: "Sortir et étendre le linge des bébés !"
}

export interface HouseholdChore {
  id: string;
  title: string;
  category: 'laundry' | 'kitchen' | 'baby' | 'cleaning' | 'trash';
  frequency: string; // 'Quotidien', 'Lundi & Jeudi', 'Dimanche', etc.
  assignedTo: string;
  completedToday: boolean;
  lastDoneBy?: string;
  reminderTime?: string;
}

export interface FamilyNotification {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  createdBy: string;
  type: 'appliance' | 'breast_milk' | 'chore' | 'stock' | 'vaccine';
  acknowledged: boolean;
}

export interface LoyaltyCard {
  id: string;
  storeName: string;
  brandCode: 'carrefour' | 'leclerc' | 'auchan' | 'intermarche' | 'lidl' | 'monoprix' | 'custom';
  cardNumber: string;
  barcodeType: 'EAN13' | 'CODE128' | 'QR';
  color: string;
  accentColor: string;
  cashbackBalance: number;
  notes?: string;
}

export interface StoreDeal {
  id: string;
  storeName: string;
  brandCode: string;
  title: string;
  description: string;
  discountPercent: number;
  cardRequired: boolean;
  validUntil: string;
  category: FoodCategory;
  eligibleProducts: string[];
}

export interface StoreLocation {
  id: string;
  name: string;
  brandCode: string;
  address: string;
  city: string;
  distanceKm: number;
  lat: number;
  lng: number;
  isOpen: boolean;
  activeDealsCount: number;
}

export interface VaccineReminder {
  id: string;
  vaccineName: string;
  dueDate: string; // ISO 'YYYY-MM-DD'
  completed: boolean;
  completedDate?: string;
  notes?: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  role: 'parent' | 'child' | 'toddler' | 'baby' | 'other';
  age: number; // fallback age in years
  birthDate?: string; // ISO 'YYYY-MM-DD' for evolutionary age calculation
  gender?: 'M' | 'F' | 'other';
  avatarColor: string;
  dietNotes?: string;
  allergies: string[];
  vaccines?: VaccineReminder[];
}

export type DriveBrandCode =
  | 'leclerc'
  | 'carrefour'
  | 'intermarche'
  | 'super_u'
  | 'auchan'
  | 'chronodrive';

export interface FamilyPreferences {
  members: FamilyMember[];
  householdSize?: number; // Nombre d'adultes à table pour calibrer recettes et courses (sans compter les enfants comme adultes)
  adultsCount?: number; // Nombre explicite d'adultes pour les portions des recettes de la semaine
  weeklyBudget: number; // in Euros
  maxPerMeal: number; // in Euros per serving
  dietaryRestrictions: string[]; // 'vegetarien', 'sans_gluten', 'sans_lactose', 'halal', 'faible_sel', etc.
  excludedFoods?: string[]; // Aliments à proscrire complètement (même sans allergie : goûts, aversions...)
  habitualProducts?: string[]; // Produits que le foyer a l'habitude d'acheter et consommer chaque semaine
  mealHabitsNotes?: string; // Notes libres sur les habitudes des repas (ex: rapide le soir, poisson 2x/sem...)
  preferredDriveBrand?: DriveBrandCode; // Enseigne Drive favorite (par défaut: 'leclerc')
  driveProductSpecs?: Record<string, string>; // Précisions Drive mémorisées par clé canonique de produit (ex: "oeufs" -> "Boîte de 12 plein air")
  driveProductUrls?: Record<string, string>; // Liens directs vers la fiche produit E.Leclerc Drive mémorisés par clé canonique
  leclercStoreUrl?: string; // URL du magasin E.Leclerc Drive habituel (ex: https://fd12-courses.leclercdrive.fr/magasin-xxxx/)
  cookingTimePreference: 'rapide' | 'normal' | 'elaborate';
  varietyScoreTarget: number; // 1-100
}

export interface RecipeIngredient {
  name: string;
  amount: string;
  inStock: boolean;
  expiringSoon?: boolean;
  fridgeItemId?: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  prepTime: number; // in minutes
  cookTime: number; // in minutes
  servings: number;
  estimatedCost: number; // total in €
  costPerServing: number;
  difficulty: 'Facile' | 'Moyen' | 'Avancé' | 'Easy' | 'Medium' | 'Advanced';
  calories: number;
  tags: string[];
  image?: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
  matchedFridgeItems: string[];
  antiWasteScore: number; // 0-100
  familyApprovedTips?: string;
  babyAdaptation?: string; // Instructions for 16-month-old or infant adaptation
  minAgeMonths?: number; // e.g., 6, 12, 16 months for evolutionary filtering
}

export interface MealPlanDay {
  dayIndex: number; // 0: Monday, 6: Sunday
  dayName: string;
  breakfast?: Recipe | null;
  lunch: Recipe | null;
  dinner: Recipe | null;
  babyMeal?: Recipe | null;
  isCustomized?: boolean;
}

export interface ShoppingItem {
  id: string;
  name: string;
  category: FoodCategory;
  quantity: number;
  unit: string;
  estimatedPrice: number;
  checked: boolean;
  source: 'meal_plan' | 'fridge_staple' | 'manual';
  recommendedStore?: string;
  dealDiscount?: number;
  notes?: string;
}
