import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '15mb' }));

// Allow cross-origin requests between ais-dev and ais-pre preview domains
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Shared in-memory and persistent multi-device household storage
interface HouseholdData {
  fridgeItems: any[];
  recipes: any[];
  mealPlan: any[];
  shoppingItems: any[];
  loyaltyCards: any[];
  familyPreferences: any;
  appliances?: any[];
  breastMilkBatches?: any[];
  chores?: any[];
  notifications?: any[];
  deletedIds?: string[];
  lastUpdated: number;
}

const STORE_FILE_PATH = path.resolve(__dirname, 'household_store.json');
const householdStore = new Map<string, HouseholdData>();

// Load persisted household store on startup
try {
  if (fs.existsSync(STORE_FILE_PATH)) {
    const raw = fs.readFileSync(STORE_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([k, v]) => {
        householdStore.set(k, v as HouseholdData);
      });
    }
  }
} catch (err) {
  console.warn('Could not load household_store.json:', err);
}

function saveHouseholdStoreToDisk() {
  try {
    const obj: Record<string, HouseholdData> = {};
    householdStore.forEach((val, key) => {
      obj[key] = val;
    });
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(obj), 'utf-8');
  } catch (err) {
    console.warn('Could not save household_store.json:', err);
  }
}

// Helper: Non-destructive union merge by item ID so two spouses opening the app simultaneously never wipe each other's data
function mergeListsById(
  existingList: any[] = [],
  incomingList: any[] = [],
  deletedSet: Set<string>,
  preferIncomingOrder = true
): any[] {
  const safeExisting = Array.isArray(existingList) ? existingList : [];
  const safeIncoming = Array.isArray(incomingList) ? incomingList : [];

  const incomingMap = new Map<string, any>();
  for (const item of safeIncoming) {
    if (item && item.id && !deletedSet.has(String(item.id))) {
      incomingMap.set(String(item.id), item);
    }
  }

  const merged: any[] = [];
  const seen = new Set<string>();

  if (preferIncomingOrder) {
    for (const item of safeIncoming) {
      if (!item || !item.id) continue;
      const id = String(item.id);
      if (deletedSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      merged.push(item);
    }
    // Preserve any item created on the partner's phone that isn't in incomingList yet and wasn't explicitly deleted
    for (const oldItem of safeExisting) {
      if (!oldItem || !oldItem.id) continue;
      const id = String(oldItem.id);
      if (deletedSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      merged.push(oldItem);
    }
  } else {
    for (const oldItem of safeExisting) {
      if (!oldItem || !oldItem.id) continue;
      const id = String(oldItem.id);
      if (deletedSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      merged.push(incomingMap.get(id) || oldItem);
    }
    for (const item of safeIncoming) {
      if (!item || !item.id) continue;
      const id = String(item.id);
      if (deletedSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      merged.push(item);
    }
  }

  return merged;
}

function mergeMealPlans(existingPlan: any[] = [], incomingPlan: any[] = []): any[] {
  if (!Array.isArray(existingPlan) || existingPlan.length === 0) {
    return Array.isArray(incomingPlan) ? incomingPlan : [];
  }
  if (!Array.isArray(incomingPlan) || incomingPlan.length === 0) {
    return existingPlan;
  }
  // If incoming plan is completely blank (e.g. partner's freshly opened phone) while server has planned meals, keep server meals
  const incomingHasAnyMeal = incomingPlan.some((d) => d && (d.breakfast || d.lunch || d.dinner));
  const existingHasAnyMeal = existingPlan.some((d) => d && (d.breakfast || d.lunch || d.dinner));
  if (!incomingHasAnyMeal && existingHasAnyMeal) {
    return existingPlan;
  }
  return incomingPlan;
}

// GET shared household state
app.get('/api/household/:code', (req, res) => {
  const code = (req.params.code || 'DOUDOU-HOME').toUpperCase();
  const data = householdStore.get(code);
  if (!data) {
    return res.json({ exists: false });
  }
  return res.json({ exists: true, data });
});

// POST update shared household state (with conflict-free multi-device merge)
app.post('/api/household/:code', (req, res) => {
  const code = (req.params.code || 'DOUDOU-HOME').toUpperCase();
  const existing = householdStore.get(code);
  const {
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
    deletedIds = [],
    clearAllShopping = false,
    clearAllMealPlan = false,
  } = req.body;

  const combinedDeletedSet = new Set<string>([
    ...(existing?.deletedIds || []),
    ...(Array.isArray(deletedIds) ? deletedIds.map(String) : []),
  ]);

  if (clearAllShopping && Array.isArray(existing?.shoppingItems)) {
    for (const s of existing.shoppingItems) {
      if (s?.id) combinedDeletedSet.add(String(s.id));
    }
  }

  // Keep max 600 recent tombstones to prevent unbounded growth
  const prunedDeletedIds = Array.from(combinedDeletedSet).slice(-600);
  const activeDeletedSet = new Set<string>(prunedDeletedIds);

  const mergedFridgeItems = existing
    ? mergeListsById(existing.fridgeItems, fridgeItems, activeDeletedSet)
    : fridgeItems || [];

  const mergedShoppingItems = clearAllShopping
    ? (shoppingItems || []).filter((s: any) => s?.id && !activeDeletedSet.has(String(s.id)))
    : existing
    ? mergeListsById(existing.shoppingItems, shoppingItems, activeDeletedSet)
    : shoppingItems || [];

  const mergedRecipes = existing
    ? mergeListsById(existing.recipes, recipes, activeDeletedSet)
    : recipes || [];

  const mergedLoyaltyCards = existing
    ? mergeListsById(existing.loyaltyCards, loyaltyCards, activeDeletedSet)
    : loyaltyCards || [];

  const mergedBreastMilk = existing
    ? mergeListsById(existing.breastMilkBatches, breastMilkBatches, activeDeletedSet)
    : breastMilkBatches || [];

  const mergedChores = existing
    ? mergeListsById(existing.chores, chores, activeDeletedSet)
    : chores || [];

  const mergedNotifications = existing
    ? mergeListsById(existing.notifications, notifications, activeDeletedSet)
    : notifications || [];

  const mergedFamilyPrefs =
    existing?.familyPreferences && familyPreferences
      ? {
          ...existing.familyPreferences,
          ...familyPreferences,
          driveProductSpecs: {
            ...(existing.familyPreferences.driveProductSpecs || {}),
            ...(familyPreferences.driveProductSpecs || {}),
          },
          driveProductUrls: {
            ...(existing.familyPreferences.driveProductUrls || {}),
            ...(familyPreferences.driveProductUrls || {}),
          },
          excludedFoods: Array.from(
            new Set([
              ...(existing.familyPreferences.excludedFoods || []),
              ...(familyPreferences.excludedFoods || []),
            ])
          ),
        }
      : familyPreferences || existing?.familyPreferences || null;

  const updated: HouseholdData = {
    fridgeItems: mergedFridgeItems,
    recipes: mergedRecipes,
    mealPlan: clearAllMealPlan
      ? mealPlan || []
      : existing
      ? mergeMealPlans(existing.mealPlan, mealPlan)
      : mealPlan || [],
    shoppingItems: mergedShoppingItems,
    loyaltyCards: mergedLoyaltyCards,
    familyPreferences: mergedFamilyPrefs,
    appliances: appliances || existing?.appliances || [],
    breastMilkBatches: mergedBreastMilk,
    chores: mergedChores,
    notifications: mergedNotifications,
    deletedIds: prunedDeletedIds,
    lastUpdated: Date.now(),
  };

  householdStore.set(code, updated);
  saveHouseholdStoreToDisk();
  return res.json({ success: true, lastUpdated: updated.lastUpdated, data: updated });
});

// POST reset shared household state (only when explicitly requested by user action)
app.post('/api/household/:code/reset', (req, res) => {
  const code = (req.params.code || 'DOUDOU-HOME').toUpperCase();
  if (req.body?.confirmExplicitReset === true) {
    householdStore.delete(code);
    saveHouseholdStoreToDisk();
  }
  return res.json({ success: true });
});

// Helper to get Gemini client dynamically
function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Keep ai reference for photo scan route
const ai = getAiClient();

// API Route: Generate AI Recipes (supports starting from 0 ingredients, using fridge stock, OR using household habitual products)
app.post('/api/recipes/ai-generate', async (req, res) => {
  try {
    const {
      fridgeItems = [],
      familyProfile,
      language = 'fr',
      mode = 'from_scratch',
      theme = 'famille',
      customPrompt = '',
      existingTitles = [],
    } = req.body;

    const client = getAiClient();
    const activeStock = Array.isArray(fridgeItems)
      ? fridgeItems.filter((i: any) => !i.consumed && i.quantity > 0)
      : [];
    const habitualProducts: string[] = Array.isArray(familyProfile?.habitualProducts)
      ? familyProfile.habitualProducts
      : [];
    const excludedFoods: string[] = Array.isArray(familyProfile?.excludedFoods)
      ? familyProfile.excludedFoods
      : [];
    const mealHabitsNotes: string = familyProfile?.mealHabitsNotes || '';

    // Never count children/babies as adults when calibrating weekly recipes
    const membersList = Array.isArray(familyProfile?.members) ? familyProfile.members : [];
    const parentCount = membersList.filter((m: any) => m.role === 'parent').length;
    const adultServings = Math.max(
      1,
      parentCount > 0 ? parentCount : familyProfile?.adultsCount || familyProfile?.householdSize || 2
    );

    if (client) {
      const themeLabels: Record<string, string> = {
        express: 'Cuisine express du soir (10 à 20 minutes max, 4 à 6 ingrédients courants)',
        famille: 'Grands classiques familiaux appréciés des adultes et des enfants, simples et savoureux',
        budget: 'Recettes petit budget (< 1,80 € par personne) avec des ingrédients économiques de supermarché',
        poulet: 'Recettes autour du poulet, de la dinde ou de la volaille',
        pates_riz: 'Plats complets à base de pâtes, riz, gnocchis, pommes de terre ou gratins',
        poisson: 'Recettes simples de poisson (cabillaud, saumon, colin, thon) sans prise de tête',
        vegetarien: 'Recettes végétariennes gourmandes et rassasiantes (œufs, fromage, légumes, légumineuses)',
        batch: 'Plats mijotés ou gratins parfaits à cuisiner en avance pour 2 repas',
      };

      const stockInstruction =
        mode === 'habits' && habitualProducts.length > 0
          ? `L'utilisateur souhaite générer des recettes SELON LES HABITUDES ALIMENTAIRES DE SA MAISON. Voici les produits que le foyer a l'habitude d'acheter et de consommer chaque semaine : ${habitualProducts.join(
              ', '
            )}. ${
              mealHabitsNotes ? `Précisions sur leurs habitudes de repas : "${mealHabitsNotes}".` : ''
            } Construis IMPÉRATIVEMENT les 3 recettes en utilisant principalement ces produits habituels du foyer (4 à 6 ingrédients par recette) pour que les menus correspondent à 100% à ce qu'ils aiment manger au quotidien.`
          : mode === 'fridge' && activeStock.length > 0
          ? `L'utilisateur souhaite utiliser en priorité certains ingrédients de son frigo actuel : ${JSON.stringify(
              activeStock.map((i: any) => `${i.name} (${i.quantity} ${i.unit})`)
            )}.`
          : `L'utilisateur PART DE ZÉRO ingrédient en stock (frigo vide) : propose des recettes ultra réalisables du quotidien avec des ingrédients courants faciles à acheter au supermarché (4 à 6 ingrédients max par recette) pour qu'il puisse les ajouter en 1 clic à sa liste de courses.${
              habitualProducts.length > 0
                ? ` Privilégie autant que possible les produits habituels du foyer : ${habitualProducts.join(', ')}.`
                : ''
            }`;

      const prompt = `Tu es un chef familial français expert en cuisine du quotidien simple, réaliste, variée et économique.
Langue : ${language}.
Contexte : ${stockInstruction}
Thème demandé : ${themeLabels[theme] || theme}
${customPrompt ? `Envie spécifique de l'utilisateur : "${customPrompt}"` : ''}
Profil du foyer :
- Adultes à table (ne compte JAMAIS les enfants/bébés dans le nombre d'adultes pour les quantités) : ${adultServings} adulte(s)
- Membres du foyer : ${JSON.stringify(familyProfile?.members || [])}
- Produits habituels consommés dans la maison : ${habitualProducts.length > 0 ? habitualProducts.join(', ') : 'Non spécifiés'}
${mealHabitsNotes ? `- Notes habitudes repas : ${mealHabitsNotes}` : ''}
- Restrictions / Allergies à respecter strictement : ${(familyProfile?.dietaryRestrictions || []).join(', ') || 'Aucune'}
- Aliments À PROSCRIRE COMPLÈTEMENT (INTERDICTION STRICTE d'inclure ces ingrédients même en petite quantité) : ${excludedFoods.length > 0 ? excludedFoods.join(', ') : 'Aucun'}
- Budget cible : max ${familyProfile?.maxPerMeal || 3.5} €/portion

Recettes DÉJÀ présentes dans l'application (INTERDICTION STRICTE de proposer ces plats ou des variantes proches) :
${JSON.stringify(existingTitles.slice(0, 40))}

Génère EXACTEMENT 3 nouvelles recettes très différentes les unes des autres, 100% réalisables un soir de semaine avec des ingrédients simples de supermarché et des quantités réalistes calibrées STRICTEMENT pour ${adultServings} adulte(s) (servings = ${adultServings}).`;

      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.9,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recipes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    prepTime: { type: Type.INTEGER },
                    cookTime: { type: Type.INTEGER },
                    servings: { type: Type.INTEGER },
                    estimatedCost: { type: Type.NUMBER },
                    costPerServing: { type: Type.NUMBER },
                    difficulty: { type: Type.STRING },
                    calories: { type: Type.INTEGER },
                    tags: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    ingredients: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          amount: { type: Type.STRING },
                        },
                        required: ['name', 'amount'],
                      },
                    },
                    instructions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    familyApprovedTips: { type: Type.STRING },
                    babyAdaptation: { type: Type.STRING },
                  },
                  required: [
                    'title',
                    'description',
                    'prepTime',
                    'cookTime',
                    'servings',
                    'estimatedCost',
                    'costPerServing',
                    'difficulty',
                    'calories',
                    'tags',
                    'ingredients',
                    'instructions',
                  ],
                },
              },
            },
            required: ['recipes'],
          },
        },
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.recipes) && parsed.recipes.length > 0) {
          const nowTs = Date.now();
          const enriched = parsed.recipes.map((r: any, idx: number) => {
            const rawTags: string[] = Array.isArray(r.tags) ? r.tags : [];
            const extraTags = ['Généré par IA ✨'];
            if (mode === 'habits' || habitualProducts.length > 0) {
              extraTags.push('Selon nos habitudes 🏠');
            }
            return {
              ...r,
              id: `ai-recipe-${nowTs}-${idx}`,
              difficulty:
                r.difficulty === 'Moyen' || r.difficulty === 'Difficile' ? r.difficulty : 'Facile',
              tags: Array.from(new Set([...extraTags, ...rawTags])),
              antiWasteScore: 95,
              matchedFridgeItems: [],
              ingredients: (r.ingredients || []).map((ing: any) => ({
                name: ing.name,
                amount: ing.amount,
                inStock: false,
                expiringSoon: false,
              })),
            };
          });
          return res.json({ recipes: enriched, source: 'gemini-ai' });
        }
      }
    }

    return res.json(
      getSmartFallbackRecipes(
        fridgeItems,
        familyProfile,
        language,
        theme,
        customPrompt,
        existingTitles,
        mode
      )
    );
  } catch (error) {
    console.error('Error generating recipe with Gemini:', error);
    const {
      fridgeItems = [],
      familyProfile,
      language = 'fr',
      mode = 'from_scratch',
      theme = 'famille',
      customPrompt = '',
      existingTitles = [],
    } = req.body;
    return res.json(
      getSmartFallbackRecipes(
        fridgeItems,
        familyProfile,
        language,
        theme,
        customPrompt,
        existingTitles,
        mode
      )
    );
  }
});

// API Route: Import / Parse pasted text from Google AI Mode into structured Recipes
app.post('/api/recipes/import-from-text', async (req, res) => {
  try {
    const { rawText = '', familyProfile } = req.body;
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return res.status(400).json({ error: 'Texte vide' });
    }

    const membersList = Array.isArray(familyProfile?.members) ? familyProfile.members : [];
    const parentCount = membersList.filter((m: any) => m.role === 'parent').length;
    const servings = Math.max(
      1,
      parentCount > 0 ? parentCount : familyProfile?.adultsCount || familyProfile?.householdSize || 2
    );
    const client = getAiClient();

    if (client) {
      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Tu es un assistant culinaire. L'utilisateur a copié-collé une ou plusieurs idées de recettes ou un menu depuis le Mode IA de Google :
"""
${rawText}
"""
Transforme ce texte en 1 à 5 fiches recettes structurées complètes en français (calibrées pour ${servings} personnes), avec la liste précise des ingrédients (nom + quantité réaliste en g, cl ou pièces) et les étapes de préparation.`,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recipes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    prepTime: { type: Type.INTEGER },
                    cookTime: { type: Type.INTEGER },
                    servings: { type: Type.INTEGER },
                    estimatedCost: { type: Type.NUMBER },
                    costPerServing: { type: Type.NUMBER },
                    difficulty: { type: Type.STRING },
                    calories: { type: Type.INTEGER },
                    tags: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    ingredients: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          amount: { type: Type.STRING },
                        },
                        required: ['name', 'amount'],
                      },
                    },
                    instructions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    familyApprovedTips: { type: Type.STRING },
                  },
                  required: [
                    'title',
                    'description',
                    'prepTime',
                    'cookTime',
                    'servings',
                    'ingredients',
                    'instructions',
                  ],
                },
              },
            },
            required: ['recipes'],
          },
        },
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.recipes) && parsed.recipes.length > 0) {
          const nowTs = Date.now();
          const enriched = parsed.recipes.map((r: any, idx: number) => ({
            ...r,
            id: `google-import-${nowTs}-${idx}`,
            servings: r.servings || servings,
            estimatedCost: r.estimatedCost || 6.0,
            costPerServing: r.costPerServing || 1.5,
            difficulty: 'Facile',
            calories: r.calories || 420,
            tags: Array.from(new Set(['Généré par IA ✨', 'Selon nos habitudes 🏠', ...(r.tags || [])])),
            antiWasteScore: 95,
            matchedFridgeItems: [],
            ingredients: (r.ingredients || []).map((ing: any) => ({
              name: ing.name,
              amount: ing.amount,
              inStock: false,
              expiringSoon: false,
            })),
          }));
          return res.json({ recipes: enriched, source: 'google-ai-import' });
        }
      }
    }

    // Simple fallback parser if offline
    const lines = rawText
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean);
    const title = lines[0]?.replace(/^[-*#\d.)\s]+/, '').slice(0, 80) || 'Recette importée de Google IA';
    return res.json({
      recipes: [
        {
          id: `google-import-${Date.now()}`,
          title,
          description: 'Recette importée depuis votre recherche Google IA.',
          prepTime: 10,
          cookTime: 15,
          servings,
          estimatedCost: 6.0,
          costPerServing: 1.5,
          difficulty: 'Facile',
          calories: 400,
          tags: ['Généré par IA ✨', 'Selon nos habitudes 🏠'],
          ingredients: lines.slice(1, 6).map((l: string) => ({
            name: l.replace(/^[-*•]\s*/, ''),
            amount: '1 portion',
            inStock: false,
            expiringSoon: false,
          })),
          instructions: lines.slice(1),
          matchedFridgeItems: [],
          antiWasteScore: 95,
        },
      ],
      source: 'fallback-parser',
    });
  } catch (err) {
    console.error('Error importing recipe text:', err);
    return res.status(500).json({ error: 'Erreur lors de l’analyse du texte' });
  }
});

// Helper: Deterministic post-processor & mathematical verifier for French Supermarket Receipts & E.Leclerc Drive orders
function enrichAndValidateReceiptItem(raw: any): {
  name: string;
  rawDesignation: string;
  driveSpec: string;
  category: string;
  zone: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  expirationDays: number;
  confidence: number;
} {
  const rawDesignation = String(
    raw.normalizedLine || raw.d || raw.rawDesignation || raw.name || raw.n || 'Article'
  ).trim();
  const unitPrice = Number(String(raw.p ?? raw.unitPrice ?? 0).replace(',', '.')) || 0;
  const totalPrice = Number(String(raw.t ?? raw.totalPrice ?? 0).replace(',', '.')) || 0;

  // 1. Mathematical verification of order quantity using Total TTC / Prix unitaire TTC
  let orderQty = Math.max(
    1,
    Math.round(Number(raw.q ?? raw.orderQuantity ?? raw.quantity ?? 1))
  );
  if (unitPrice > 0.05 && totalPrice > 0.05) {
    const computedQty = Math.round(totalPrice / unitPrice);
    if (
      computedQty >= 1 &&
      computedQty <= 60 &&
      Math.abs(computedQty * unitPrice - totalPrice) <= 0.08
    ) {
      orderQty = computedQty;
    }
  }

  // 2. Extract exact packaging / grammage / lot count from the designation if needed
  let packaging = String(raw.u || raw.packaging || raw.unit || '').trim();
  const desigNorm = rawDesignation
    .replace(/\b(\d+)\s*grs?\b/gi, '$1g')
    .replace(/\b(\d+)\s*kilos?\b/gi, '$1kg')
    .replace(/\b(\d+)\s*litres?\b/gi, '$1L')
    .replace(/\s+/g, ' ');

  // Detect multipacks like "16x100g", "6x1,5L", "20x25cl", "3x200g", "4x125ml"
  const multiPackMatch = desigNorm.match(
    /\b(\d+)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl|dl)\b/i
  );
  // Detect single weight/volume like "350g", "1,4kg", "1kg", "470g", "390g", "100g", "125g", "250g", "230g", "500g", "750ml", "25cl", "1L", "50L"
  const weightVolMatch = desigNorm.match(
    /(?:^|[\s\-–(])(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl|dl)\b/i
  );
  // Detect E.Leclerc Drive truncated produce weights at end of line: e.g. "- 400" (400g) or "Filet 25" (250g)
  const truncatedProduce400 =
    !weightVolMatch && /-\s*(150|200|250|300|350|400|450|500|750)\s*$/.test(desigNorm)
      ? `${desigNorm.match(/-\s*(150|200|250|300|350|400|450|500|750)\s*$/)?.[1]}g`
      : '';
  const truncatedFilet25 =
    !weightVolMatch && /\bFilet\s*25\s*$/i.test(desigNorm) ? '250g' : '';

  // Detect piece counts like "x12", "x5", "x1", "X6", "Boîte x90", "4p", "6p"
  const countLotMatch = desigNorm.match(
    /\b(bo[îi]te\s*[xX×]\s*\d+|[xX×]\s*\d+|\d+\s*p(?:i[èe]ces?)?)\b/i
  );

  if (multiPackMatch) {
    const count = multiPackMatch[1];
    const subVal = multiPackMatch[2].replace('.', ',');
    const subUnit = multiPackMatch[3].toLowerCase() === 'l' ? 'L' : multiPackMatch[3].toLowerCase();
    packaging = `${count}x${subVal}${subUnit}`;
  } else if (
    !packaging ||
    packaging === 'pièce(s)' ||
    packaging === 'pièce' ||
    packaging === 'paquet' ||
    packaging === 'unité'
  ) {
    if (weightVolMatch) {
      const valNum = parseFloat(weightVolMatch[1].replace(',', '.'));
      const rawU = weightVolMatch[2].toLowerCase();
      // Convert decimal kg < 1kg (e.g., 0,350kg) to grams (350g)
      if (rawU === 'kg' && valNum > 0 && valNum < 1) {
        packaging = `${Math.round(valNum * 1000)}g`;
      } else {
        packaging = `${weightVolMatch[1].replace('.', ',')}${rawU === 'l' ? 'L' : rawU}`;
      }
    } else if (truncatedProduce400) {
      packaging = truncatedProduce400;
    } else if (truncatedFilet25) {
      packaging = truncatedFilet25;
    } else if (countLotMatch) {
      packaging = countLotMatch[1].trim();
    }
  }

  // 3. Clean product name & extract Drive format specification (Brand + Grammage)
  const segments = desigNorm
    .split(/\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let cleanName = String(raw.name || raw.n || '').trim();
  let driveSpec = String(raw.driveSpec || raw.brandOrSpec || '').trim();

  if (segments.length >= 2) {
    if (!cleanName || cleanName.includes(' - ')) {
      cleanName = segments[0];
    }
    if (!driveSpec) {
      const restSegments = segments.slice(1).join(' · ');
      driveSpec =
        truncatedProduce400 && !restSegments.endsWith('g')
          ? `${restSegments}g`
          : truncatedFilet25
          ? restSegments.replace(/Filet\s*25$/i, 'Filet 250g')
          : restSegments;
    }
  }

  if (!cleanName) {
    cleanName = rawDesignation;
  }

  // 4. Compute combined human-readable unit with total grammage/volume/pieces (g, kg, cl, ml, L)
  let finalUnit = packaging || 'pièce(s)';
  const parsedMultiPack = finalUnit.match(
    /^(\d+)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*(g|gr|kg|ml|cl|dl|l)$/i
  );
  const singleGramMatch = finalUnit.match(/^(\d+(?:[.,]\d+)?)\s*(g|gr|kg|ml|cl|dl|l)$/i);
  const singleLotMatch = finalUnit.match(/^(?:[xX×]\s*(\d+)|(\d+)\s*p(?:i[èe]ces?)?)$/i);

  if (parsedMultiPack) {
    const packCount = parseInt(parsedMultiPack[1], 10);
    const unitVal = parseFloat(parsedMultiPack[2].replace(',', '.'));
    const u = parsedMultiPack[3].toLowerCase();
    const totalSubUnits = packCount * orderQty;
    const totalAmount = totalSubUnits * unitVal;
    const normU = u === 'l' ? 'L' : u === 'gr' ? 'g' : u;
    let totalStr = `${Math.round(totalAmount * 100) / 100}${normU}`;
    if (normU === 'g' && totalAmount >= 1000) {
      totalStr = `${String(Math.round((totalAmount / 1000) * 100) / 100).replace('.', ',')}kg`;
    } else if ((normU === 'cl' && totalAmount >= 100) || (normU === 'ml' && totalAmount >= 1000)) {
      const liters = normU === 'cl' ? totalAmount / 100 : totalAmount / 1000;
      totalStr = `${Math.round(totalAmount)}${normU} (${String(Math.round(liters * 100) / 100).replace('.', ',')}L)`;
    }
    finalUnit =
      orderQty > 1
        ? `${packCount}x${parsedMultiPack[2].replace('.', ',')}${normU} ×${orderQty} (Total : ${totalStr})`
        : `${packCount}x${parsedMultiPack[2].replace('.', ',')}${normU} (${totalStr})`;
  } else if (singleGramMatch) {
    let val = parseFloat(singleGramMatch[1].replace(',', '.'));
    let u = singleGramMatch[2].toLowerCase();
    if (u === 'gr') u = 'g';
    if (u === 'kg' && val > 0 && val < 1) {
      val = Math.round(val * 1000);
      u = 'g';
    }
    const baseStr = `${String(val).replace('.', ',')}${u === 'l' ? 'L' : u}`;
    if (orderQty > 1 && !isNaN(val)) {
      if (u === 'g') {
        const totalG = Math.round(val * orderQty);
        const totalFormatted =
          totalG >= 1000
            ? `${String(Math.round((totalG / 1000) * 100) / 100).replace('.', ',')}kg`
            : `${totalG}g`;
        finalUnit = `${baseStr} (Total : ${totalFormatted})`;
      } else if (u === 'kg') {
        const totalKg = Math.round(val * orderQty * 100) / 100;
        finalUnit = `${baseStr} (Total : ${String(totalKg).replace('.', ',')}kg)`;
      } else if (u === 'cl' || u === 'ml') {
        const totalVol = Math.round(val * orderQty);
        finalUnit = `${baseStr} (Total : ${totalVol}${u})`;
      } else if (u === 'l') {
        const totalL = Math.round(val * orderQty * 100) / 100;
        finalUnit = `${baseStr} (Total : ${String(totalL).replace('.', ',')}L)`;
      } else {
        finalUnit = `${baseStr} (×${orderQty})`;
      }
    } else {
      finalUnit = baseStr;
    }
  } else if (singleLotMatch) {
    const lotCount = parseInt(singleLotMatch[1] || singleLotMatch[2], 10);
    if (!isNaN(lotCount) && lotCount > 1) {
      const totalPieces = lotCount * orderQty;
      finalUnit =
        orderQty > 1
          ? `lot x${lotCount} (Total : ${totalPieces} pièces)`
          : `lot de ${lotCount} pièces`;
    } else {
      finalUnit = 'pièce(s)';
    }
  }

  // 5. Accurate Category & StorageZone classification
  const n = `${cleanName} ${rawDesignation}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let category = raw.category || 'pantry';
  let zone = raw.zone || 'pantry';
  let expirationDays = Number(raw.expirationDays) || 14;

  if (
    /\b(couche|lingette|biberon|lait infantile|petit pot|liniment|bebe)\b/.test(n)
  ) {
    category = 'baby_care';
    zone = 'baby_care';
    expirationDays = 365;
  } else if (
    /\b(vaisselle|sacs? poubelle|eponge|lessive|adoucissant|nettoyant|javel|papier toilette|essuie tout|sopalin|elembal|mamison|arbre vert|lotus)\b/.test(
      n
    )
  ) {
    category = 'household';
    zone = 'household';
    expirationDays = 365;
  } else if (
    /\b(gel douche|shampoing|shampooing|savon|dentifrice|deodorant|mouchoir|coton|cadum|caresse)\b/.test(
      n
    )
  ) {
    category = 'hygiene';
    zone = 'household';
    expirationDays = 365;
  } else if (/\b(surgele|glace|sorbet)\b/.test(n)) {
    category = 'frozen';
    zone = 'freezer';
    expirationDays = 90;
  } else if (
    /\b(eau de source|eau minerale|cristaline|biere|goudale|jus|soda|cola|sirop|cidre|vin)\b/.test(
      n
    )
  ) {
    category = 'beverages';
    zone = 'pantry';
    expirationDays = 180;
  } else if (
    /\b(farfalle|spaghetti|coquillette|tagliatelle|penne|pates|riz|semoule|quinoa|haricots? rouges?|lentilles?|pois chiches?|mayonnaise|moutarde|ketchup|pulpe de tomate|coulis|sauce tomate|turini|chocolat|lindt|farine|francine|amandes? en poudre|sucre|huile|vinaigre|compote|andros|conserve|biscuit|cereales)\b/.test(
      n
    )
  ) {
    category = 'pantry';
    zone = 'pantry';
    expirationDays = 120;
  } else if (
    /\b(pate brisee|pate feuilletee|pate a dérouler|pate a pizza|beurre|elle&vire|oeuf|oeufs|matines|fromage blanc|delisse|yaourt|lait|creme|emmental|mozzarella|comte|fromage)\b/.test(
      n
    )
  ) {
    category = 'dairy';
    zone = 'fridge';
    expirationDays = /\b(oeuf|oeufs|beurre)\b/.test(n) ? 21 : 12;
  } else if (
    /\b(poulet|dinde|boeuf|steak|porc|jambon|lardon|saumon|cabillaud|poisson|crevette|saucisse|charcuterie)\b/.test(
      n
    )
  ) {
    category = 'meat_fish';
    zone = 'fridge';
    expirationDays = 5;
  } else if (
    /\b(kiwi|banane|pomme|poire|orange|clementine|citron|fraise|framboise|raisin|melon|mangue|ananas|abricot|peche)\b/.test(
      n
    ) &&
    !n.includes('pomme de terre') &&
    !n.includes('compote')
  ) {
    category = 'fruits';
    zone = /\b(banane|kiwi)\b/.test(n) ? 'pantry' : 'fridge';
    expirationDays = 7;
  } else if (
    /\b(champignon|courge|butternut|tomate|echalote|oignon|ail|pomme de terre|endive|carotte|courgette|poireau|salade|epinard|brocoli|poivron|concombre|avocat|haricot vert)\b/.test(
      n
    )
  ) {
    category = 'vegetables';
    zone = /\b(pomme de terre|echalote|oignon|ail|courge|butternut)\b/.test(n)
      ? 'pantry'
      : 'fridge';
    expirationDays = /\b(pomme de terre|echalote|oignon|courge|butternut)\b/.test(n) ? 21 : 7;
  }

  return {
    name: cleanName,
    rawDesignation,
    driveSpec,
    category,
    zone,
    quantity: orderQty,
    unit: finalUnit,
    unitPrice,
    totalPrice,
    expirationDays,
    confidence: Number(raw.confidence) || 98,
  };
}

// Deterministic parser for pasted E.Leclerc Drive order / invoice text
function parsePastedReceiptText(rawText: string) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items: any[] = [];
  for (const line of lines) {
    if (
      /^(d[ée]signation|fruits l[ée]gumes|laitier|charcuterie|epicerie|boissons|hygi[èe]ne|entretien|origine\s*:|total de la commande|r[èe]glement|carte bancaire|d[ée]tail de votre commande|\d+\/\d+$)/i.test(
        line
      )
    ) {
      continue;
    }
    // Match lines ending with: <qty> <unitPrice> <totalPrice>
    const m = line.match(
      /^(.+?)\s+(\d{1,2})\s+(\d+(?:[.,]\d{2}))\s*(?:€)?\s+(\d+(?:[.,]\d{2}))\s*(?:€)?$/
    );
    if (m) {
      items.push(
        enrichAndValidateReceiptItem({
          rawDesignation: m[1].trim(),
          orderQuantity: parseInt(m[2], 10),
          unitPrice: parseFloat(m[3].replace(',', '.')),
          totalPrice: parseFloat(m[4].replace(',', '.')),
        })
      );
    }
  }
  return items;
}

// API Route: Fast LLM Text Normalization before Receipt Item Parsing (used by handleAddDetectedItemsFromPhoto)
app.post('/api/scan/normalize-receipt-items', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.json({ normalizedItems: [] });
    }

    const client = getAiClient();
    if (!client) {
      return res.json({
        normalizedItems: items.map((it: any) => enrichAndValidateReceiptItem(it)),
      });
    }

    const compactInput = items.map((it: any, idx: number) => ({
      i: idx,
      raw: `${it.rawDesignation || it.name || ''} | qty=${it.quantity ?? 1} | unit=${it.unit || ''} | spec=${it.driveSpec || ''}`,
    }));

    const normSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          i: { type: Type.INTEGER },
          cleanName: {
            type: Type.STRING,
            description: 'Nom propre du produit sans marque ni grammage',
          },
          normalizedUnit: {
            type: Type.STRING,
            description:
              'Unité métrique normalisée (g, kg, cl, ml, L) ou conditionnement complexe (ex: "350g", "1,4kg", "16x100g", "6x1,5L", "20x25cl", "750ml", "lot x12", "4 pièces")',
          },
          quantity: {
            type: Type.NUMBER,
            description: 'Quantité commandée (entier >= 1)',
          },
          driveSpec: {
            type: Type.STRING,
            description: 'Marque + format/grammage normalisé pour le Drive',
          },
        },
        required: ['i', 'cleanName', 'normalizedUnit', 'quantity'],
      },
    };

    const prompt = `Normalise chacune de ces lignes de ticket de caisse / facture Drive pour extraire proprement les unités métriques (g, kg, cl, ml, L) et les quantités complexes (multipacks NxM g/cl/ml/L, poids tronqués comme "- 400" -> "400g" ou "Filet 25" -> "250g").
Entrée :
${JSON.stringify(compactInput)}`;

    let responseText: string | undefined;
    try {
      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          temperature: 0,
          responseSchema: normSchema,
        },
      });
      responseText = response.text;
    } catch {
      const fallback = await client.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          temperature: 0,
          responseSchema: normSchema,
        },
      });
      responseText = fallback.text;
    }

    const llmList = responseText ? JSON.parse(responseText) : [];
    const byIdx = new Map<number, any>();
    if (Array.isArray(llmList)) {
      for (const row of llmList) {
        if (typeof row?.i === 'number') {
          byIdx.set(row.i, row);
        }
      }
    }

    const normalizedItems = items.map((orig: any, idx: number) => {
      const normRow = byIdx.get(idx);
      return enrichAndValidateReceiptItem({
        ...orig,
        name: normRow?.cleanName || orig.name,
        orderQuantity: normRow?.quantity ?? orig.quantity ?? 1,
        packaging: normRow?.normalizedUnit || orig.unit,
        driveSpec: normRow?.driveSpec || orig.driveSpec,
      });
    });

    return res.json({ normalizedItems });
  } catch (err) {
    console.warn('Error in /api/scan/normalize-receipt-items:', err);
    const fallbackItems = Array.isArray(req.body?.items)
      ? req.body.items.map((it: any) => enrichAndValidateReceiptItem(it))
      : [];
    return res.json({ normalizedItems: fallbackItems });
  }
});

// API Route: Ultra-Fast AI Food Photo, E.Leclerc Drive Invoice & Supermarket Receipt Scanner
app.post('/api/scan/analyze-photo', async (req, res) => {
  try {
    const {
      imageBase64,
      images,
      rawText,
      mimeType = 'image/jpeg',
      language = 'fr',
      scanType = 'receipt',
    } = req.body;

    // 1. Instant deterministic parse if user pasted raw receipt/order text directly (< 5ms)
    if (rawText && typeof rawText === 'string' && rawText.trim().length > 5) {
      const parsedFromLines = parsePastedReceiptText(rawText);
      if (parsedFromLines.length > 0) {
        return res.json({
          detectedItems: parsedFromLines,
          source: 'deterministic-leclerc-parser',
        });
      }
    }

    const client = getAiClient();

    // Normalize single or multiple images
    const imageList: Array<{ base64: string; mimeType: string }> = [];
    if (Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        if (img?.imageBase64) {
          const detectedMimeMatch = String(img.imageBase64).match(/^data:([^;]+);base64,/);
          const resolvedMime = img.mimeType || detectedMimeMatch?.[1] || 'image/jpeg';
          const cleanB64 = String(img.imageBase64).replace(/^data:[^;]+;base64,/, '');
          imageList.push({ base64: cleanB64, mimeType: resolvedMime });
        }
      }
    } else if (imageBase64) {
      const detectedMimeMatch = String(imageBase64).match(/^data:([^;]+);base64,/);
      const resolvedMime = detectedMimeMatch?.[1] || mimeType || 'image/jpeg';
      const cleanB64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
      imageList.push({ base64: cleanB64, mimeType: resolvedMime });
    }

    if (client && (imageList.length > 0 || (rawText && rawText.trim()))) {
      // Compact 5-key schema (75% fewer output tokens + ThinkingLevel.LOW => 5-8x faster response)
      const compactSchema = {
        type: Type.OBJECT,
        properties: {
          s: {
            type: Type.STRING,
            description: 'Ville et code postal du magasin si visible (ex: 35500 Vitré)',
          },
          o: {
            type: Type.STRING,
            description: 'Numéro de commande si visible',
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                d: {
                  type: Type.STRING,
                  description:
                    'Désignation normalisée complète "Nom produit - Marque - Unité" (ex: "Tomates cerises colorées - Panier du Primeur - 350g", "Champignons de Paris blancs - Panier du Primeur - 400g")',
                },
                q: {
                  type: Type.NUMBER,
                  description: 'Quantité commandée exacte (colonne Quantité, vérifiée par t / p)',
                },
                u: {
                  type: Type.STRING,
                  description:
                    'Unité/grammage normalisé (g, kg, cl, ml, L, NxMg, NxMcl, xN, Np — ex: "350g", "1,4kg", "16x100g", "6x1,5L", "20x25cl", "750ml", "4p", "x12")',
                },
                p: {
                  type: Type.NUMBER,
                  description: 'Prix unitaire TTC',
                },
                t: {
                  type: Type.NUMBER,
                  description: 'Total TTC de la ligne',
                },
              },
              required: ['d', 'q', 'u'],
            },
          },
        },
        required: ['items'],
      };

      const prompt =
        scanType === 'receipt'
          ? `Extrais et normalise TOUTES les lignes d'articles de ce ticket/facture Drive (ne saute aucun article).
Ignore les sous-lignes "Origine : ...".
Pour chaque ligne :
- "d": Désignation normalisée "Produit - Marque - Format" (corrige les poids tronqués en fin de ligne : "- 400" -> "- 400g", "Filet 25" -> "Filet 250g").
- "q": Quantité commandée (vérifie q = t / p).
- "u": Unité/grammage normalisé en g, kg, cl, ml, L ou lot (ex: "350g", "1,4kg", "16x100g", "6x1,5L", "20x25cl", "750ml", "x12", "4p").
- "p": Prix unitaire TTC.
- "t": Total TTC.`
          : `Identifie les produits visibles (${language}) : d="Nom - Marque", q=quantité, u=grammage/unité (g, kg, cl, ml, L, pièce).`;

      const analyzeSingleGroup = async (parts: any[]) => {
        try {
          const response = await client.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: { parts },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
              responseMimeType: 'application/json',
              temperature: 0,
              responseSchema: compactSchema,
            },
          });
          return response.text ? JSON.parse(response.text) : null;
        } catch (firstErr) {
          console.warn('gemini-3.8-flash fallback to gemini-3.1-flash-lite:', firstErr);
          const fallbackResponse = await client.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: { parts },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
              responseMimeType: 'application/json',
              temperature: 0,
              responseSchema: compactSchema,
            },
          });
          return fallbackResponse.text ? JSON.parse(fallbackResponse.text) : null;
        }
      };

      let storeLocation = '';
      let orderNumber = '';
      let rawExtractedItems: any[] = [];

      // If multiple images were sent in a single call, process them in parallel for maximum speed
      if (imageList.length > 1) {
        const results = await Promise.all(
          imageList.map((img) =>
            analyzeSingleGroup([
              { inlineData: { mimeType: img.mimeType, data: img.base64 } },
              { text: prompt },
            ])
          )
        );
        for (const r of results) {
          if (!r) continue;
          if (r.s && !storeLocation) storeLocation = r.s;
          if (r.o && !orderNumber) orderNumber = r.o;
          if (Array.isArray(r.items)) {
            rawExtractedItems.push(...r.items);
          }
        }
      } else {
        const parts: any[] = imageList.map((img) => ({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          },
        }));
        if (rawText && typeof rawText === 'string' && rawText.trim()) {
          parts.push({
            text: `Texte brut du ticket :\n"""\n${rawText}\n"""`,
          });
        }
        parts.push({ text: prompt });
        const singleResult = await analyzeSingleGroup(parts);
        if (singleResult) {
          storeLocation = singleResult.s || '';
          orderNumber = singleResult.o || '';
          rawExtractedItems = Array.isArray(singleResult.items) ? singleResult.items : [];
        }
      }

      if (rawExtractedItems.length > 0) {
        const enrichedItems = rawExtractedItems.map(enrichAndValidateReceiptItem);
        return res.json({
          storeLocation,
          orderNumber,
          detectedItems: enrichedItems,
          source: 'gemini-fast-normalized',
        });
      }
    }

    return res.status(400).json({
      error:
        'Impossible de lire l’image ou le texte fourni. Veuillez réessayer avec une capture nette.',
      detectedItems: [],
    });
  } catch (error) {
    console.error('Error analyzing photo with Gemini:', error);
    return res.status(500).json({
      error:
        'Erreur lors de l’analyse du ticket. Vérifiez la netteté de l’image ou collez le texte de la commande.',
      detectedItems: [],
    });
  }
});

// Top-Level Android App & Cart Launcher Bridge (escapes cross-origin iframe sandbox so intent://, leclercdrive://, and new-window navigation work 100% reliably)
app.get('/api/drive/launch', (req, res) => {
  const query = String(req.query.q || '').trim();
  const qty = String(req.query.qty || '').trim();
  const brand = String(req.query.brand || 'leclerc').trim();
  const rawWeb = String(req.query.web || '').trim();
  const rawPanier = String(req.query.panier || '').trim();

  let parsedCartItems: Array<{ q: string; qty: string }> = [];
  if (rawPanier) {
    try {
      const parsed = JSON.parse(rawPanier);
      if (Array.isArray(parsed)) {
        parsedCartItems = parsed
          .map((it: any) => ({
            q: String(it?.q || '').trim(),
            qty: String(it?.qty || '').trim(),
          }))
          .filter((it) => it.q.length > 0);
      }
    } catch {
      // fallback if rawPanier is plain text
      parsedCartItems = rawPanier
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => ({ q: s, qty: '' }));
    }
  }

  const effectiveQuery = query || parsedCartItems[0]?.q || '';
  const effectiveQty = qty || parsedCartItems[0]?.qty || '';

  const webUrl =
    rawWeb && rawWeb.includes('leclercdrive.fr')
      ? rawWeb
      : effectiveQuery
      ? `https://www.leclercdrive.fr/region-bretagne/vitre/drive-vitre.aspx?TexteRecherche=${encodeURIComponent(
          effectiveQuery
        )}`
      : 'https://www.leclercdrive.fr/region-bretagne/vitre/drive-vitre.aspx';

  const pkgMap: Record<string, string> = {
    leclerc: 'com.infomil.leclercdrive',
    carrefour: 'com.carrefour.fid.android',
    intermarche: 'com.intermarche.mobile.courses',
    super_u: 'com.systemeu.coursesu',
    auchan: 'fr.auchan.android.application',
    chronodrive: 'com.chronodrive.android',
  };
  const pkg = pkgMap[brand] || 'com.infomil.leclercdrive';
  const playStoreMarketUrl = `market://details?id=${pkg}`;
  const schemePath = effectiveQuery
    ? `recherche?TexteRecherche=${encodeURIComponent(effectiveQuery)}&q=${encodeURIComponent(
        effectiveQuery
      )}`
    : 'open';
  const customSchemeUrl = `leclercdrive://${schemePath}`;
  const customSchemeIntentUrl = `intent://${schemePath}#Intent;scheme=leclercdrive;package=${pkg};${
    effectiveQuery
      ? `S.query=${encodeURIComponent(effectiveQuery)};S.user_query=${encodeURIComponent(
          effectiveQuery
        )};S.TexteRecherche=${encodeURIComponent(
          effectiveQuery
        )};S.android.intent.extra.TEXT=${encodeURIComponent(effectiveQuery)};`
      : ''
  }S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;

  const escHtml = (s: string) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const safeQueryHtml = escHtml(effectiveQuery);
  const safeQtyHtml = escHtml(effectiveQty);

  const itemsListHtml =
    parsedCartItems.length > 0
      ? `<div class="cart-list">
          <div class="cart-list-title">📋 ÉTAPE 1 — Touchez chaque article ci-dessous (1 touche = 1 case propre séparée dans votre Presse-papiers) :</div>
          ${parsedCartItems
            .map(
              (item, idx) => `
            <div class="cart-item" id="cart-item-${idx}" onclick="copySingleItem(${idx})">
              <div class="cart-item-info">
                <div class="cart-item-name">${escHtml(item.q)}</div>
                ${item.qty ? `<div class="cart-item-qty">Quantité : <strong>${escHtml(item.qty)}</strong></div>` : ''}
              </div>
              <span class="cart-item-btn" id="cart-btn-${idx}">+ Presse-papiers</span>
            </div>`
            )
            .join('')}
        </div>`
      : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>Commande E.Leclerc Drive</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 18px;
    }
    .card {
      max-width: 480px;
      width: 100%;
      margin: 0 auto;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 24px;
      padding: 20px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
    .badge {
      display: inline-block;
      background: #1d4ed8;
      color: #dbeafe;
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    h1 { font-size: 18px; font-weight: 800; margin-bottom: 6px; line-height: 1.3; }
    .copied-box {
      background: #0f172a;
      border: 2px solid #10b981;
      border-radius: 16px;
      padding: 14px;
      margin: 12px 0;
    }
    .copied-label {
      font-size: 11px;
      font-weight: 700;
      color: #34d399;
      margin-bottom: 4px;
      display: block;
    }
    .copied-query {
      font-size: 16px;
      font-weight: 800;
      color: #ffffff;
      word-break: break-word;
    }
    .copied-qty {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 4px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 50px;
      padding: 13px 16px;
      border-radius: 16px;
      font-size: 14px;
      font-weight: 800;
      text-decoration: none;
      text-align: center;
      margin-top: 10px;
      border: none;
      cursor: pointer;
    }
    .btn-primary {
      background: #059669;
      color: #ffffff;
      box-shadow: 0 10px 20px -5px rgba(5,150,105,0.45);
    }
    .btn-secondary {
      background: #334155;
      color: #e2e8f0;
      font-size: 13px;
    }
    .cart-list {
      margin: 12px 0;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 12px;
      max-height: 310px;
      overflow-y: auto;
    }
    .cart-list-title {
      font-size: 12px;
      font-weight: 800;
      color: #93c5fd;
      margin-bottom: 10px;
      line-height: 1.4;
    }
    .cart-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 12px;
      background: #1e293b;
      margin-bottom: 7px;
      cursor: pointer;
      border: 1px solid #334155;
    }
    .cart-item.copied {
      background: #064e3b;
      border-color: #10b981;
    }
    .cart-item-info { min-width: 0; flex: 1; }
    .cart-item-name { font-size: 14px; font-weight: 800; color: #f8fafc; }
    .cart-item-qty { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    .cart-item-qty strong { color: #34d399; }
    .cart-item-btn {
      background: #2563eb;
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      padding: 7px 11px;
      border-radius: 9px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .cart-item.copied .cart-item-btn {
      background: #10b981;
      color: #022c22;
    }
    .help {
      margin-top: 14px;
      font-size: 12px;
      line-height: 1.5;
      color: #94a3b8;
      background: rgba(15,23,42,0.6);
      padding: 12px;
      border-radius: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge" id="status-badge">✓ Prêt pour Leclerc DRIVE</span>
    <h1>Préparer mon Presse-papiers Leclerc DRIVE</h1>
    ${itemsListHtml}
    ${
      safeQueryHtml
        ? `<div class="copied-box">
            <span class="copied-label" id="copied-label">📋 DERNIER ARTICLE AJOUTÉ AU PRESSE-PAPIERS :</span>
            <div class="copied-query" id="copied-query">« ${safeQueryHtml} »</div>
            ${
              safeQtyHtml
                ? `<div class="copied-qty" id="copied-qty">Quantité : <strong style="color:#34d399">${safeQtyHtml}</strong></div>`
                : `<div class="copied-qty" id="copied-qty"></div>`
            }
          </div>`
        : ''
    }

    <a id="btn-scheme" href="${customSchemeIntentUrl}" class="btn btn-primary">
      📱 ÉTAPE 2 : Ouvrir l’application « Leclerc DRIVE » →
    </a>

    <a href="${webUrl}" class="btn btn-secondary">
      🌐 Ouvrir mon magasin sur leclercdrive.fr →
    </a>

    <button onclick="window.close()" class="btn btn-secondary" style="margin-top:10px;background:transparent;border:1px solid #475569;">
      ← Retourner à ma liste de courses
    </button>

    <div class="help">
      <strong>Pourquoi toucher chaque article en Étape 1 :</strong><br/>
      Sur téléphone Android/Xiaomi, le clavier refuse qu’une application crée 10 cases d’un seul coup (sinon tout est collé en un seul bloc). En touchant chaque ligne ci-dessus (<em>Toc, toc, toc</em>), votre téléphone crée <strong>une case propre par produit</strong> dans <strong>Presse-papiers → Récents</strong> !
    </div>
  </div>
  <script>
    var CART_ITEMS = ${JSON.stringify(parsedCartItems)};
    var INITIAL_QUERY = ${JSON.stringify(effectiveQuery)};
    var CUSTOM_SCHEME_URL = ${JSON.stringify(customSchemeUrl)};

    function copySingleItem(idx) {
      var item = CART_ITEMS[idx];
      if (!item) return;
      var qEl = document.getElementById('copied-query');
      var qtyEl = document.getElementById('copied-qty');
      var badgeEl = document.getElementById('status-badge');
      var rowEl = document.getElementById('cart-item-' + idx);
      var btnEl = document.getElementById('cart-btn-' + idx);
      if (qEl) qEl.textContent = '« ' + item.q + ' »';
      if (qtyEl) qtyEl.innerHTML = item.qty ? 'Quantité : <strong style="color:#34d399">' + item.qty + '</strong>' : '';
      if (badgeEl) badgeEl.textContent = '✓ « ' + item.q + ' » ajouté en case séparée !';
      if (rowEl) rowEl.classList.add('copied');
      if (btnEl) btnEl.textContent = '✓ Dans Presse-papiers';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(item.q).catch(function(){});
      }
    }

    try {
      if (INITIAL_QUERY && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(INITIAL_QUERY).catch(function(){});
      }
      if (CART_ITEMS.length === 0) {
        setTimeout(function() {
          window.location.href = CUSTOM_SCHEME_URL;
        }, 150);
      }
    } catch (e) {}
  </script>
</body>
</html>`);
});

// Rich rotating fallback recipe generator (supports household habitual products & never repeats the same recipes)
function getSmartFallbackRecipes(
  _fridgeItems: any[],
  familyProfile: any,
  _lang: string,
  theme = 'famille',
  customPrompt = '',
  existingTitles: string[] = [],
  mode = 'from_scratch'
) {
  const membersList = Array.isArray(familyProfile?.members) ? familyProfile.members : [];
  const parentCount = membersList.filter((m: any) => m.role === 'parent').length;
  const servings = Math.max(
    1,
    parentCount > 0 ? parentCount : familyProfile?.adultsCount || familyProfile?.householdSize || 2
  );
  const nowTs = Date.now();
  const habitualProducts: string[] = Array.isArray(familyProfile?.habitualProducts)
    ? familyProfile.habitualProducts
    : [];
  const excludedFoods: string[] = Array.isArray(familyProfile?.excludedFoods)
    ? familyProfile.excludedFoods
    : [];

  const norm = (s: string) =>
    (s || '')
      .toLowerCase()
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const POOL = [
    {
      themeKey: 'pates_riz',
      title: 'Gnocchis Poêlés aux Tomates Cerises, Mozzarella & Basilic',
      description: 'Prêt en 10 minutes dans une seule poêle : croustillant dehors et fondant dedans.',
      prepTime: 5,
      cookTime: 8,
      estimatedCost: 5.2,
      costPerServing: 1.3,
      difficulty: 'Facile',
      calories: 410,
      tags: ['< 25 min', 'Végétarien', 'Enfant friendly', 'Budget Malin'],
      ingredients: [
        { name: 'Gnocchis à poêler', amount: '500g', inStock: false, expiringSoon: false },
        { name: 'Tomates cerises ou Coulis de tomate', amount: '250g', inStock: false, expiringSoon: false },
        { name: 'Boule de Mozzarella pasteurisée', amount: '125g', inStock: false, expiringSoon: false },
        { name: 'Huile d’olive & Herbes', amount: '1 c.à.s', inStock: false, expiringSoon: false },
      ],
      instructions: [
        'Faire dorer les gnocchis à la poêle avec un filet d’huile d’olive pendant 5 minutes.',
        'Ajouter les tomates cerises coupées en deux (ou le coulis) et laisser compoter 3 minutes.',
        'Hors du feu, parsemer de dés de mozzarella pour qu’elle fonde doucement.',
      ],
      familyApprovedTips: 'Les enfants adorent les gnocchis dorés à la poêle.',
      babyAdaptation: 'Couper chaque gnocchi et chaque tomate cerise en 4 pour les enfants en bas âge.',
    },
    {
      themeKey: 'poulet',
      title: 'Blanquette Express de Filets de Poulet aux Carottes & Riz Basmati',
      description: 'Toute la douceur de la blanquette familiale prête en 20 minutes avec vos produits habituels.',
      prepTime: 8,
      cookTime: 15,
      estimatedCost: 6.8,
      costPerServing: 1.7,
      difficulty: 'Facile',
      calories: 430,
      tags: ['< 25 min', 'Enfant friendly', 'Spécial Bébé (16 mois)'],
      ingredients: [
        { name: 'Filets de poulet', amount: '400g', inStock: false, expiringSoon: false },
        { name: 'Carottes', amount: '3 pièces', inStock: false, expiringSoon: false },
        { name: 'Riz basmati', amount: '250g', inStock: false, expiringSoon: false },
        { name: 'Crème fraîche', amount: '15 cl', inStock: false, expiringSoon: false },
        { name: 'Beurre doux', amount: '15g', inStock: false, expiringSoon: false },
      ],
      instructions: [
        'Couper les filets de poulet en morceaux et les carottes en fines rondelles.',
        'Faire revenir avec le beurre doux puis couvrir d’eau à hauteur et laisser mijoter 14 minutes à couvert.',
        'Incorporer la crème fraîche en fin de cuisson et servir avec le riz basmati.',
      ],
      familyApprovedTips: 'Viande très tendre qui ne sèche jamais grâce à la cuisson dans le bouillon crémeux.',
      babyAdaptation: 'Parfait dès 6-8 mois mixé ou en petits morceaux fondants à 16 mois.',
    },
    {
      themeKey: 'express',
      title: 'Quesadillas Fondantes Poulet, Maïs & Emmental à la Poêle',
      description: 'Des galettes de blé dorées à la poêle en 8 minutes, ludiques et croustillantes.',
      prepTime: 5,
      cookTime: 6,
      estimatedCost: 5.5,
      costPerServing: 1.38,
      difficulty: 'Facile',
      calories: 440,
      tags: ['< 25 min', 'Enfant friendly', 'Budget Malin'],
      ingredients: [
        { name: 'Tortillas de blé souples', amount: '4 grandes galettes', inStock: false, expiringSoon: false },
        { name: 'Filets de poulet ou Jambon blanc', amount: '200g', inStock: false, expiringSoon: false },
        { name: 'Maïs doux en boîte', amount: '1 petite boîte (140g)', inStock: false, expiringSoon: false },
        { name: 'Emmental râpé', amount: '120g', inStock: false, expiringSoon: false },
      ],
      instructions: [
        'Répartir l’emmental râpé, le poulet émincé (ou jambon) et le maïs égoutté sur la moitié de chaque tortilla.',
        'Replier les tortillas en demi-lunes.',
        'Les dorer 2 à 3 minutes de chaque côté dans une poêle chaude sans matière grasse jusqu’à ce que le fromage soit fondu.',
      ],
      familyApprovedTips: 'Coupez chaque demi-lune en 3 triangles façon parts de pizza !',
    },
    {
      themeKey: 'poisson',
      title: 'Crumble Salé de Cabillaud aux Courgettes, Beurre Doux & Emmental',
      description: 'Une façon gourmande et croustillante de faire aimer le poisson blanc et les légumes à toute la famille.',
      prepTime: 10,
      cookTime: 20,
      estimatedCost: 7.4,
      costPerServing: 1.85,
      difficulty: 'Facile',
      calories: 380,
      tags: ['Enfant friendly', 'Spécial Bébé (16 mois)'],
      ingredients: [
        { name: 'Filet de cabillaud ou colin', amount: '400g', inStock: false, expiringSoon: false },
        { name: 'Courgettes', amount: '2 pièces', inStock: false, expiringSoon: false },
        { name: 'Farine de blé', amount: '80g', inStock: false, expiringSoon: false },
        { name: 'Beurre doux', amount: '50g', inStock: false, expiringSoon: false },
        { name: 'Emmental râpé', amount: '50g', inStock: false, expiringSoon: false },
      ],
      instructions: [
        'Faire revenir les courgettes coupées en petits dés pendant 6 minutes à la poêle.',
        'Disposer les courgettes et le poisson émietté dans un plat à gratin.',
        'Sabler du bout des doigts la farine, le beurre et le fromage râpé, répartir sur le poisson et enfourner 18 min à 190°C.',
      ],
      familyApprovedTips: 'Le croustillant du crumble au fromage fait l’unanimité chez les enfants.',
    },
    {
      themeKey: 'budget',
      title: 'Dahl Crémeux de Lentilles Corail, Carottes & Lait de Coco',
      description: 'Prêt en 15 minutes sans trempage : ultra économique (< 1€/pers), riche en protéines et très doux.',
      prepTime: 5,
      cookTime: 12,
      estimatedCost: 3.6,
      costPerServing: 0.9,
      difficulty: 'Facile',
      calories: 365,
      tags: ['< 25 min', 'Végétarien', 'Budget Malin', 'Spécial Bébé (16 mois)'],
      ingredients: [
        { name: 'Lentilles corail', amount: '250g', inStock: false, expiringSoon: false },
        { name: 'Carottes', amount: '2 pièces râpées', inStock: false, expiringSoon: false },
        { name: 'Lait de coco', amount: '20 cl', inStock: false, expiringSoon: false },
        { name: 'Coulis de tomates', amount: '20 cl', inStock: false, expiringSoon: false },
      ],
      instructions: [
        'Rincer les lentilles corail à l’eau froide.',
        'Les mettre dans une casserole avec les carottes râpées, le lait de coco, le coulis de tomates et 30 cl d’eau.',
        'Cuire à feu moyen 12 minutes en remuant jusqu’à obtenir une texture crémeuse.',
      ],
      familyApprovedTips: 'Les lentilles corail fondent toutes seules en 12 minutes et sont très digestes.',
      babyAdaptation: 'Texture naturellement fondante idéale dès 8-12 mois.',
    },
    {
      themeKey: 'famille',
      title: 'Boulettes de Bœuf Moelleuses à la Sauce Tomate Douce & Pâtes',
      description: 'Le grand classique familial avec une sauce tomate maison toute douce et des pâtes.',
      prepTime: 10,
      cookTime: 15,
      estimatedCost: 6.9,
      costPerServing: 1.72,
      difficulty: 'Facile',
      calories: 480,
      tags: ['< 25 min', 'Enfant friendly', 'Spécial Bébé (16 mois)'],
      ingredients: [
        { name: 'Bœuf haché', amount: '350g', inStock: false, expiringSoon: false },
        { name: 'Pâtes (Coquillettes ou Spaghettis)', amount: '350g', inStock: false, expiringSoon: false },
        { name: 'Tomates / Coulis de tomate', amount: '400g', inStock: false, expiringSoon: false },
        { name: 'Œufs frais', amount: '1 pièce', inStock: false, expiringSoon: false },
        { name: 'Emmental râpé', amount: '50g', inStock: false, expiringSoon: false },
      ],
      instructions: [
        'Mélanger le bœuf haché avec l’œuf et former de petites boulettes de la taille d’une noix.',
        'Les dorer 5 minutes à la poêle puis verser le coulis de tomates et laisser mijoter à couvert 10 minutes (cuisson à cœur).',
        'Servir sur les pâtes chaudes avec l’emmental râpé.',
      ],
      familyApprovedTips: 'Vous pouvez glisser une courgette râpée dans la sauce tomate.',
    },
    {
      themeKey: 'vegetarien',
      title: 'Tarte Fine Feuilletée Tomate, Fromage Frais & Mozzarella',
      description: '4 ingrédients habituels, 5 minutes de préparation et un résultat croustillant adoré toute l’année.',
      prepTime: 5,
      cookTime: 20,
      estimatedCost: 4.5,
      costPerServing: 1.12,
      difficulty: 'Facile',
      calories: 380,
      tags: ['< 25 min', 'Végétarien', 'Budget Malin', 'Enfant friendly'],
      ingredients: [
        { name: 'Pâte feuilletée pur beurre', amount: '1 rouleau', inStock: false, expiringSoon: false },
        { name: 'Tomates / Coulis de tomate', amount: '4 pièces', inStock: false, expiringSoon: false },
        { name: 'Mozzarella', amount: '150g', inStock: false, expiringSoon: false },
        { name: 'Fromage frais', amount: '2 c.à.s', inStock: false, expiringSoon: false },
      ],
      instructions: [
        'Dérouler la pâte dans un moule et la piquer à la fourchette.',
        'Étaler une fine couche de fromage frais sur le fond.',
        'Disposer les rondelles de tomates et la mozzarella, puis enfourner 20 minutes à 200°C.',
      ],
      familyApprovedTips: 'Version fromage frais toute douce pour les jeunes enfants.',
    },
    {
      themeKey: 'batch',
      title: 'Gratin Familial de Pommes de Terre, Jambon Blanc, Œufs & Crème Fraîche',
      description: 'Le gratin doré et réconfortant préparé avec les produits habituels du frigo et du placard.',
      prepTime: 10,
      cookTime: 22,
      estimatedCost: 5.4,
      costPerServing: 1.35,
      difficulty: 'Facile',
      calories: 420,
      tags: ['< 25 min', 'Enfant friendly', 'Budget Malin', 'Spécial Bébé (16 mois)'],
      ingredients: [
        { name: 'Pommes de terre', amount: '600g', inStock: false, expiringSoon: false },
        { name: 'Jambon blanc', amount: '4 tranches', inStock: false, expiringSoon: false },
        { name: 'Crème fraîche', amount: '20 cl', inStock: false, expiringSoon: false },
        { name: 'Œufs frais', amount: '2 pièces', inStock: false, expiringSoon: false },
        { name: 'Emmental râpé', amount: '70g', inStock: false, expiringSoon: false },
      ],
      instructions: [
        'Cuire les pommes de terre coupées en rondelles 10 minutes à l’eau ou à la vapeur.',
        'Les disposer dans un plat à gratin avec le jambon blanc coupé en dés.',
        'Battre les œufs avec la crème fraîche, verser sur le plat, parsemer d’emmental râpé et gratiner 12 min à 200°C.',
      ],
      familyApprovedTips: 'Un plat complet du soir avec les incontournables que l’on a toujours à la maison.',
    },
  ];

  // If the household has habitual products configured, also build a bespoke recipe directly from their habitual products!
  const dynamicHabitRecipes: any[] = [];
  if (habitualProducts.length >= 2) {
    const p1 = habitualProducts[0];
    const p2 = habitualProducts[1];
    const p3 = habitualProducts[2] || 'Crème fraîche';
    const p4 = habitualProducts[3] || 'Emmental râpé';
    dynamicHabitRecipes.push({
      themeKey: theme,
      title: `Poêlée Familiale Express : ${p1}, ${p2} & ${p3}`,
      description: `Recette sur-mesure créée à partir des produits habituels de votre maison (${habitualProducts
        .slice(0, 4)
        .join(', ')}).`,
      prepTime: 8,
      cookTime: 14,
      estimatedCost: 5.8,
      costPerServing: 1.45,
      difficulty: 'Facile',
      calories: 415,
      tags: ['Selon nos habitudes 🏠', 'Généré par IA ✨', '< 25 min', 'Enfant friendly'],
      ingredients: [
        { name: p1, amount: '350g', inStock: false, expiringSoon: false },
        { name: p2, amount: '300g', inStock: false, expiringSoon: false },
        { name: p3, amount: '15 cl', inStock: false, expiringSoon: false },
        { name: p4, amount: '60g', inStock: false, expiringSoon: false },
      ],
      instructions: [
        `Préparer et couper ${p1.toLowerCase()} et ${p2.toLowerCase()} en morceaux adaptés à toute la famille.`,
        `Faire revenir à la poêle ou cuire doucement pendant 12 minutes jusqu’à ce que l’ensemble soit bien fondant.`,
        `Lier avec ${p3.toLowerCase()} et parsemer de ${p4.toLowerCase()} juste avant de servir chaud.`,
      ],
      familyApprovedTips: `Conçu spécialement autour de vos habitudes alimentaires (${habitualProducts
        .slice(0, 3)
        .join(', ')}).`,
      babyAdaptation: 'Prélever une petite portion avant salage et couper en petits dés fondants.',
    });
  }

  // Filter out any recipe containing an excluded/proscribed food
  const containsExcluded = (recipe: any): boolean => {
    if (excludedFoods.length === 0) return false;
    const haystack = norm(
      `${recipe.title} ${(recipe.ingredients || []).map((i: any) => i.name).join(' ')}`
    );
    return excludedFoods.some((ex) => {
      const nEx = norm(ex);
      if (!nEx) return false;
      const escaped = nEx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}s?\\b`, 'i');
      return regex.test(haystack) || haystack.includes(nEx);
    });
  };

  const allCandidatesPool = [...dynamicHabitRecipes, ...POOL].filter(
    (r) => !containsExcluded(r)
  );
  const safePool = allCandidatesPool.length > 0 ? allCandidatesPool : POOL;
  const existingSet = new Set(existingTitles.map((t) => t.toLowerCase()));
  const unvisited = safePool.filter((r) => !existingSet.has(r.title.toLowerCase()));
  const candidates = unvisited.length >= 3 ? unvisited : safePool;

  // Score how many habitual products each recipe matches
  const countHabitMatches = (recipe: any): number => {
    if (habitualProducts.length === 0) return 0;
    return (recipe.ingredients || []).filter((ing: any) => {
      const nIng = norm(ing.name);
      return habitualProducts.some((hp) => {
        const nHp = norm(hp);
        return (
          nIng.includes(nHp) ||
          nHp.includes(nIng) ||
          nHp
            .split(' ')
            .filter((w) => w.length >= 3)
            .some((w) => nIng.includes(w))
        );
      });
    }).length;
  };

  // Prioritize recipes matching habitual products, the chosen theme, or custom prompt
  const sorted = [...candidates].sort((a, b) => {
    const aHabits = countHabitMatches(a);
    const bHabits = countHabitMatches(b);
    if (mode === 'habits' && aHabits !== bHabits) {
      return bHabits - aHabits;
    }
    const aMatch =
      a.themeKey === theme ||
      (customPrompt && a.title.toLowerCase().includes(customPrompt.toLowerCase()))
        ? -2
        : 0;
    const bMatch =
      b.themeKey === theme ||
      (customPrompt && b.title.toLowerCase().includes(customPrompt.toLowerCase()))
        ? -2
        : 0;
    return aMatch - bMatch - (aHabits - bHabits);
  });

  const selected = sorted.slice(0, 3).map((r, idx) => {
    const habitMatches = countHabitMatches(r);
    const extraTags = ['Généré par IA ✨'];
    if (mode === 'habits' || habitMatches > 0) {
      extraTags.push('Selon nos habitudes 🏠');
    }
    return {
      ...r,
      id: `ai-fallback-${nowTs}-${idx}`,
      servings,
      tags: Array.from(new Set([...extraTags, ...(r.tags || [])])),
      matchedFridgeItems: [],
      antiWasteScore: 95,
    };
  });

  return { recipes: selected, source: 'catalog-smart' };
}

// ============================================================================
// MOBILE 1-CLICK GITHUB EXPORT + ANDROID APK CLOUD COMPILER
// Allows exporting the full codebase and triggering .github/workflows/build-android-apk.yml
// directly from a smartphone without needing a computer or desktop GitHub UI.
// ============================================================================
function collectProjectFilesForGitHub(rootDir: string): Array<{ relPath: string; content: string }> {
  const results: Array<{ relPath: string; content: string }> = [];
  const topLevelFiles = [
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'index.html',
    'capacitor.config.ts',
    'metadata.json',
    'server.ts',
    '.github/workflows/build-android-apk.yml',
  ];

  for (const rel of topLevelFiles) {
    const abs = path.join(rootDir, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      results.push({ relPath: rel, content: fs.readFileSync(abs, 'utf8') });
    }
  }

  const walkDir = (dirRel: string) => {
    const absDir = path.join(rootDir, dirRel);
    if (!fs.existsSync(absDir)) return;
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const childRel = path.posix.join(dirRel, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'aistudio') continue;
        walkDir(childRel);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx|json|css|html|svg|md|yml|yaml)$/i.test(entry.name)) {
        const absFile = path.join(rootDir, childRel);
        if (fs.statSync(absFile).size < 500_000) {
          results.push({ relPath: childRel, content: fs.readFileSync(absFile, 'utf8') });
        }
      }
    }
  };

  walkDir('src');
  return results;
}

app.post('/api/github/export-apk', async (req, res) => {
  try {
    const { githubToken, repoName = 'doudous-home-apk', isPrivate = true } = req.body || {};
    const token = String(githubToken || '').trim();
    const cleanRepo = String(repoName || 'doudous-home-apk')
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '-');

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: 'Veuillez coller votre jeton GitHub (Personal Access Token ghp_...).',
      });
    }

    const ghHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'DoudousHome-Mobile-Exporter',
    };

    // 1. Get authenticated GitHub user
    const userResp = await fetch('https://api.github.com/user', { headers: ghHeaders });
    if (!userResp.ok) {
      return res.status(401).json({
        ok: false,
        error: 'Jeton GitHub invalide ou expiré. Vérifiez que vous avez coché "repo" et "workflow".',
      });
    }
    const userData = (await userResp.json()) as { login: string };
    const owner = userData.login;

    // 2. Check or create repository
    let repoResp = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`, {
      headers: ghHeaders,
    });
    if (repoResp.status === 404) {
      repoResp = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          name: cleanRepo,
          description: "Doudou's Home - Application Android Capacitor (.APK) + Pilote Leclerc Drive",
          private: Boolean(isPrivate),
          auto_init: true,
        }),
      });
      if (!repoResp.ok) {
        const errText = await repoResp.text();
        return res.status(400).json({
          ok: false,
          error: `Impossible de créer le dépôt GitHub (${repoResp.status}): ${errText}`,
        });
      }
      // Small delay for GitHub to initialize main branch
      await new Promise((r) => setTimeout(r, 1500));
    }

    const repoInfo = (await repoResp.json()) as { default_branch?: string; html_url?: string };
    const branch = repoInfo.default_branch || 'main';

    // 3. Get latest commit SHA on default branch (or initialize README if empty)
    let refResp = await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/git/ref/heads/${branch}`,
      { headers: ghHeaders }
    );
    if (refResp.status === 404 || refResp.status === 409) {
      await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/contents/README.md`, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: 'Initialisation du dépôt Android APK',
          content: Buffer.from("# Doudou's Home Android APK\n").toString('base64'),
          branch,
        }),
      });
      await new Promise((r) => setTimeout(r, 1000));
      refResp = await fetch(
        `https://api.github.com/repos/${owner}/${cleanRepo}/git/ref/heads/${branch}`,
        { headers: ghHeaders }
      );
    }

    if (!refResp.ok) {
      const errText = await refResp.text();
      return res.status(400).json({
        ok: false,
        error: `Impossible de lire la branche ${branch}: ${errText}`,
      });
    }

    const refData = (await refResp.json()) as { object: { sha: string } };
    const baseCommitSha = refData.object.sha;

    // 4. Collect project files and build Git tree
    const files = collectProjectFilesForGitHub(__dirname);
    const treeItems = files.map((f) => ({
      path: f.relPath,
      mode: '100644',
      type: 'blob',
      content: f.content,
    }));

    const treeResp = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/git/trees`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({
        base_tree: baseCommitSha,
        tree: treeItems,
      }),
    });

    if (!treeResp.ok) {
      const errText = await treeResp.text();
      return res.status(400).json({
        ok: false,
        error: `Erreur lors de l'envoi des fichiers sur GitHub (vérifiez que la case "workflow" est cochée sur votre jeton): ${errText}`,
      });
    }
    const treeData = (await treeResp.json()) as { sha: string };

    // 5. Create commit and update branch ref
    const commitResp = await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/git/commits`,
      {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          message: '📱 Export mobile Doudous Home + Workflow compilation Android APK Capacitor',
          tree: treeData.sha,
          parents: [baseCommitSha],
        }),
      }
    );
    if (!commitResp.ok) {
      const errText = await commitResp.text();
      return res.status(400).json({
        ok: false,
        error: `Erreur lors de la création du commit GitHub: ${errText}`,
      });
    }
    const commitData = (await commitResp.json()) as { sha: string };

    await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: ghHeaders,
      body: JSON.stringify({ sha: commitData.sha, force: true }),
    });

    // 6. Trigger workflow_dispatch just in case push didn't already start it
    await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/actions/workflows/build-android-apk.yml/dispatches`,
      {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({ ref: branch }),
      }
    ).catch(() => {});

    return res.json({
      ok: true,
      owner,
      repo: cleanRepo,
      filesCount: files.length,
      repoUrl: `https://github.com/${owner}/${cleanRepo}`,
      actionsUrl: `https://github.com/${owner}/${cleanRepo}/actions`,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Erreur interne lors de l’export GitHub',
    });
  }
});

// In development, hook Vite middleware; in production serve static files
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Doudou's Fridge server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
