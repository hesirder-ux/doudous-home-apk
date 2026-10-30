import React, { useState } from 'react';
import {
  DriveBrandCode,
  FamilyMember,
  FamilyPreferences,
  FridgeItem,
  Language,
  VaccineReminder,
} from '../types';
import {
  buildOptimizedDriveQuery,
  DRIVE_BRANDS_CATALOG,
  getSmartDriveFormatSuggestions,
} from '../utils/portionScaler';
import { translations } from '../i18n/translations';
import {
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  Coins,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Syringe,
  Trash2,
  Users,
  Utensils,
  X,
} from 'lucide-react';

interface FamilyViewProps {
  preferences: FamilyPreferences;
  lang: Language;
  onUpdatePreferences: (updated: FamilyPreferences) => void;
  fridgeItems?: FridgeItem[];
  onResetHousehold?: () => void;
  onOpenShareModal?: () => void;
  onNotifyVaccineReminder?: (childName: string, vaccine: VaccineReminder) => void;
  onGenerateHabitRecipes?: () => void;
  onGenerateHabitMenu?: () => void;
}

interface AllergyOption {
  id: string;
  label: string;
  sublabel?: string;
  category: 'major_14' | 'other_allergies' | 'baby_maternity' | 'diets';
}

export const ALLERGY_AND_DIET_CATALOG: AllergyOption[] = [
  // 14 Allergènes Majeurs (Réglementation Européenne)
  { id: 'arachides', label: '🥜 Arachides (Cacahuètes)', sublabel: 'Huile, beurre et éclats d’arachide', category: 'major_14' },
  { id: 'fruits_a_coque', label: '🌰 Fruits à coque', sublabel: 'Amandes, noisettes, noix, cajou, pistaches, pécan', category: 'major_14' },
  { id: 'lait_plv', label: '🥛 Lait & PLV / Lactose', sublabel: 'Protéines de lait de vache, lactose, crèmerie', category: 'major_14' },
  { id: 'oeufs', label: '🥚 Œufs', sublabel: 'Blanc et jaune d’œuf, ovoproduits', category: 'major_14' },
  { id: 'gluten', label: '🌾 Gluten & Blé', sublabel: 'Blé, seigle, orge, avoine, épeautre, kamut', category: 'major_14' },
  { id: 'poissons', label: '🐟 Poissons', sublabel: 'Toutes espèces de poissons et dérivés', category: 'major_14' },
  { id: 'crustaces', label: '🦐 Crustacés', sublabel: 'Crevettes, crabe, langoustines, homard', category: 'major_14' },
  { id: 'mollusques', label: '🐚 Mollusques', sublabel: 'Moules, huîtres, coquilles St-Jacques, calamar', category: 'major_14' },
  { id: 'soja', label: '🌱 Soja', sublabel: 'Sauce soja, tofu, lécithine de soja', category: 'major_14' },
  { id: 'sesame', label: '🥯 Graines de Sésame', sublabel: 'Tahini, huile et pains au sésame', category: 'major_14' },
  { id: 'celeri', label: '🥬 Céleri', sublabel: 'Céleri-rave, céleri-branche, bouillons', category: 'major_14' },
  { id: 'moutarde', label: '🌭 Moutarde', sublabel: 'Graines, condiments et sauces à la moutarde', category: 'major_14' },
  { id: 'lupin', label: '🌸 Lupin', sublabel: 'Farine et graines de lupin', category: 'major_14' },
  { id: 'sulfites', label: '🍷 Sulfites', sublabel: 'Anhydride sulfureux, fruits secs traités, vinaigres', category: 'major_14' },

  // Autres allergies & intolérances alimentaires fréquentes
  { id: 'fraise_fruits_rouges', label: '🍓 Fraises & Fruits rouges', sublabel: 'Histamino-libérateurs (framboise, mûre...)', category: 'other_allergies' },
  { id: 'kiwi_exotiques', label: '🥝 Kiwi, Banane & Avocat', sublabel: 'Fruits exotiques et groupe croisé latex', category: 'other_allergies' },
  { id: 'legumineuses', label: '🫘 Légumineuses & Pois', sublabel: 'Lentilles, pois chiches, petits pois, fèves (favisme)', category: 'other_allergies' },
  { id: 'solanacees', label: '🍅 Tomate, Aubergine & Poivron', sublabel: 'Famille des solanacées', category: 'other_allergies' },
  { id: 'agrumes', label: '🍋 Agrumes', sublabel: 'Orange, citron, pamplemousse, clémentine', category: 'other_allergies' },
  { id: 'cacao', label: '🍫 Cacao & Chocolat', sublabel: 'Cacao et dérivés chocolatés', category: 'other_allergies' },
  { id: 'fodmap', label: '🫃 Pauvre en FODMAP', sublabel: 'Digestion sensible, ail/oignon/choux limités', category: 'other_allergies' },
  { id: 'histamine', label: '🧀 Intolérance à l’Histamine', sublabel: 'Aliments fermentés, charcuteries, fromages affinés', category: 'other_allergies' },

  // Spécial Bébés, Tout-Petits & Maternité
  { id: 'faible_sel', label: '🧂 Zéro sel ajouté (Spécial Bébé)', sublabel: 'Recommandé pour les enfants < 3 ans', category: 'baby_maternity' },
  { id: 'faible_sucre', label: '🍬 Sans sucres ajoutés', sublabel: 'Compotes et recettes sans sucre raffiné', category: 'baby_maternity' },
  { id: 'sans_miel', label: '🍯 Sans miel (< 12 mois)', sublabel: 'Prévention du botulisme infantile', category: 'baby_maternity' },
  { id: 'cuisson_coeur', label: '🔥 Viandes, œufs & poissons cuits à cœur', sublabel: 'Sécurité microbiologique enfants < 5 ans & grossesse', category: 'baby_maternity' },
  { id: 'lait_pasteurise', label: '🧀 Fromages au lait pasteurisé uniquement', sublabel: 'Aucun fromage au lait cru', category: 'baby_maternity' },

  // Régimes & Convictions
  { id: 'vegetarien', label: '🥕 Végétarien', sublabel: 'Sans viande ni poisson', category: 'diets' },
  { id: 'vegetalien', label: '🌿 Végétalien (Vegan)', sublabel: '100% végétal, aucun produit animal', category: 'diets' },
  { id: 'flexitarien', label: '🍽️ Flexitarien', sublabel: 'Privilégie le végétal, peu de viande rouge', category: 'diets' },
  { id: 'sans_porc', label: '🚫 Sans porc', sublabel: 'Aucune viande de porc ni gélatine porcine', category: 'diets' },
  { id: 'sans_boeuf', label: '🥩 Sans bœuf', sublabel: 'Aucune viande bovine', category: 'diets' },
  { id: 'halal', label: '🌙 Halal', sublabel: 'Viandes certifiées Halal, sans alcool', category: 'diets' },
  { id: 'casher', label: '✡️ Casher', sublabel: 'Respect des règles alimentaires Casher', category: 'diets' },
];

const OFFICIAL_VACCINE_MILESTONES: Array<{
  monthsOffset: number;
  vaccineName: string;
  notes: string;
}> = [
  {
    monthsOffset: 2,
    vaccineName: 'Hexavalent (DTP, Coqueluche, Hib, Hépatite B) + Pneumocoque (1ère dose)',
    notes: 'Échéance obligatoire des 2 mois',
  },
  {
    monthsOffset: 3,
    vaccineName: 'Méningocoque B (1ère dose)',
    notes: 'Échéance des 3 mois',
  },
  {
    monthsOffset: 4,
    vaccineName: 'Rappel Hexavalent (2e dose) + Pneumocoque (2e dose)',
    notes: 'Échéance obligatoire des 4 mois',
  },
  {
    monthsOffset: 5,
    vaccineName: 'Méningocoque C (1ère dose) + Méningocoque B (2e dose)',
    notes: 'Échéance des 5 mois',
  },
  {
    monthsOffset: 11,
    vaccineName: 'Rappel Hexavalent (3e dose) + Rappel Pneumocoque',
    notes: 'Rappel majeur des 11 mois',
  },
  {
    monthsOffset: 12,
    vaccineName: 'ROR (1ère dose) + Rappel Méningocoque C & B',
    notes: 'Échéance des 12 mois',
  },
  {
    monthsOffset: 16,
    vaccineName: 'ROR - Rougeole, Oreillons, Rubéole (2e dose)',
    notes: 'Rappel obligatoire entre 16 et 18 mois',
  },
  {
    monthsOffset: 72,
    vaccineName: 'Rappel DTP + Coqueluche (6 ans)',
    notes: 'Rappel scolaire des 6 ans',
  },
  {
    monthsOffset: 132,
    vaccineName: 'Rappel DTPc + Papillomavirus (HPV) (11-13 ans)',
    notes: 'Rappel adolescent 11-13 ans',
  },
];

const QUICK_VACCINE_PRESETS = [
  'Hexavalent + Pneumocoque (4 mois)',
  'Méningocoque C & B (5 mois)',
  'Rappel Hexavalent + Pneumocoque (11 mois)',
  'ROR 1ère dose + Méningo (12 mois)',
  'Rappel ROR 2ème dose (16-18 mois)',
  'Rappel DTP + Coqueluche (6 ans)',
  'Rappel DTPc + HPV (11-13 ans)',
  'Vaccin Grippe / Bronchiolite (Beyfortus)',
];

export const HABITUAL_PRODUCTS_CATALOG: Array<{
  category: 'proteins' | 'carbs' | 'veggies_fruits' | 'dairy_breakfast';
  categoryLabel: string;
  items: string[];
}> = [
  {
    category: 'proteins',
    categoryLabel: '🍗 Viandes, Poissons & Œufs',
    items: [
      'Filets de poulet',
      'Œufs frais',
      'Bœuf haché',
      'Jambon blanc',
      'Pavé de saumon',
      'Filet de cabillaud / colin',
      'Escalopes de dinde',
      'Thon en boîte',
      'Lardons / Bacon',
      'Saucisses / Knacks',
    ],
  },
  {
    category: 'carbs',
    categoryLabel: '🍝 Féculents, Pâtes & Céréales',
    items: [
      'Pâtes (Coquillettes / Spaghettis)',
      'Riz basmati',
      'Pommes de terre',
      'Gnocchis à poêler',
      'Semoule / Couscous',
      'Tortillas de blé (Wraps)',
      'Lentilles corail',
      'Pâte feuilletée / brisée',
      'Pain de mie / Pain frais',
      'Quinoa / Boulgour',
    ],
  },
  {
    category: 'veggies_fruits',
    categoryLabel: '🥕 Légumes & Fruits récurrents',
    items: [
      'Carottes',
      'Courgettes',
      'Tomates / Coulis de tomate',
      'Pommes',
      'Bananes',
      'Brocoli',
      'Épinards frais',
      'Haricots verts',
      'Petits pois',
      'Patate douce',
      'Poivrons',
      'Champignons de Paris',
    ],
  },
  {
    category: 'dairy_breakfast',
    categoryLabel: '🥛 Crèmerie, Fromages & Matin',
    items: [
      'Lait demi-écrémé',
      'Beurre doux',
      'Crème fraîche',
      'Emmental râpé',
      'Mozzarella',
      'Yaourts nature',
      'Fromage frais (St-Môret / Kiri)',
      'Flocons d’avoine',
      'Compotes sans sucre',
      'Lait de coco',
    ],
  },
];

export const EXCLUDED_FOODS_CATALOG: Array<{
  category: 'veggies_herbs' | 'meats_fish' | 'cheese_pantry';
  categoryLabel: string;
  items: string[];
}> = [
  {
    category: 'veggies_herbs',
    categoryLabel: '🥦 Légumes, Herbes & Crudités',
    items: [
      'Coriandre',
      'Champignons',
      'Endives',
      'Chou-fleur',
      'Choux de Bruxelles',
      'Brocoli',
      'Épinards',
      'Aubergine',
      'Poivrons',
      'Courgettes',
      'Céleri',
      'Fenouil',
      'Betterave',
      'Navet',
      'Petits pois',
      'Oignons',
      'Ail',
      'Avocat',
      'Olives',
    ],
  },
  {
    category: 'meats_fish',
    categoryLabel: '🥩 Viandes, Charcuteries & Poissons',
    items: [
      'Abats / Foie',
      'Porc / Lardons',
      'Bœuf / Viande rouge',
      'Agneau',
      'Veau',
      'Canard',
      'Lapin',
      'Saucisses / Charcuterie',
      'Poisson',
      'Saumon',
      'Thon',
      'Cabillaud / Colin',
      'Crevettes / Fruits de mer',
      'Moules',
    ],
  },
  {
    category: 'cheese_pantry',
    categoryLabel: '🧀 Fromages, Épicerie & Saveurs',
    items: [
      'Fromage de chèvre',
      'Roquefort / Fromage bleu',
      'Camembert / Fromages forts',
      'Œufs',
      'Lait de coco / Noix de coco',
      'Tofu / Soja',
      'Lentilles',
      'Pois chiches',
      'Haricots rouges',
      'Quinoa',
      'Raisins secs',
      'Câpres',
      'Cornichons',
      'Moutarde',
      'Piment / Plats épicés',
      'Cumin',
      'Cannelle',
      'Banane',
    ],
  },
];

export const FamilyView: React.FC<FamilyViewProps> = ({
  preferences,
  lang,
  onUpdatePreferences,
  fridgeItems = [],
  onResetHousehold,
  onOpenShareModal,
  onNotifyVaccineReminder,
  onGenerateHabitRecipes,
  onGenerateHabitMenu,
}) => {
  const t = translations[lang] || translations.fr;
  const [activeSection, setActiveSection] = useState<
    'members' | 'habits' | 'vaccines' | 'settings'
  >('members');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  React.useEffect(() => {
    const onSwitchTab = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (
        custom.detail === 'members' ||
        custom.detail === 'habits' ||
        custom.detail === 'vaccines' ||
        custom.detail === 'settings'
      ) {
        setActiveSection(custom.detail);
      }
    };
    window.addEventListener('doudous-foyer-tab', onSwitchTab);
    return () => window.removeEventListener('doudous-foyer-tab', onSwitchTab);
  }, []);

  // Habitual Products state
  const [customHabitInput, setCustomHabitInput] = useState('');
  const [activeHabitCategory, setActiveHabitCategory] = useState<
    'all' | 'proteins' | 'carbs' | 'veggies_fruits' | 'dairy_breakfast'
  >('all');
  const habitualProducts = preferences.habitualProducts || [];

  // Excluded / Proscribed Foods state (hors allergies)
  const [customExcludedInput, setCustomExcludedInput] = useState('');
  const [activeExcludedCategory, setActiveExcludedCategory] = useState<
    'all' | 'veggies_herbs' | 'meats_fish' | 'cheese_pantry'
  >('all');
  const excludedFoods = preferences.excludedFoods || [];

  const handleToggleExcludedFood = (foodName: string) => {
    const exists = excludedFoods.some(
      (f) => f.toLowerCase() === foodName.toLowerCase()
    );
    const updatedExcluded = exists
      ? excludedFoods.filter((f) => f.toLowerCase() !== foodName.toLowerCase())
      : [...excludedFoods, foodName];
    // Si on proscrit un aliment, on le retire des produits habituels pour éviter toute contradiction
    const updatedHabits = exists
      ? habitualProducts
      : habitualProducts.filter(
          (hp) => !hp.toLowerCase().includes(foodName.toLowerCase())
        );
    onUpdatePreferences({
      ...preferences,
      excludedFoods: updatedExcluded,
      habitualProducts: updatedHabits,
    });
  };

  const handleAddCustomExcludedFood = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customExcludedInput.trim();
    if (!trimmed) return;
    if (!excludedFoods.some((f) => f.toLowerCase() === trimmed.toLowerCase())) {
      onUpdatePreferences({
        ...preferences,
        excludedFoods: [...excludedFoods, trimmed],
        habitualProducts: habitualProducts.filter(
          (hp) => !hp.toLowerCase().includes(trimmed.toLowerCase())
        ),
      });
    }
    setCustomExcludedInput('');
  };

  const handleToggleHabitualProduct = (productName: string) => {
    const exists = habitualProducts.some(
      (p) => p.toLowerCase() === productName.toLowerCase()
    );
    const updated = exists
      ? habitualProducts.filter((p) => p.toLowerCase() !== productName.toLowerCase())
      : [...habitualProducts, productName];
    onUpdatePreferences({
      ...preferences,
      habitualProducts: updated,
    });
  };

  const handleAddCustomHabitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customHabitInput.trim();
    if (!trimmed) return;
    if (!habitualProducts.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      onUpdatePreferences({
        ...preferences,
        habitualProducts: [...habitualProducts, trimmed],
      });
    }
    setCustomHabitInput('');
  };

  const handleApplyFamilyStaplesPreset = () => {
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
    const merged = Array.from(new Set([...habitualProducts, ...preset]));
    onUpdatePreferences({
      ...preferences,
      habitualProducts: merged,
    });
  };

  const handleImportFromFridgeToHabits = () => {
    const activeNames = fridgeItems
      .filter((i) => !i.consumed && i.quantity > 0)
      .map((i) => i.name.trim());
    if (activeNames.length === 0) return;
    const merged = Array.from(new Set([...habitualProducts, ...activeNames]));
    onUpdatePreferences({
      ...preferences,
      habitualProducts: merged,
    });
  };

  // Dedicated Allergies & Preferences Modal state
  const [isAllergyModalOpen, setIsAllergyModalOpen] = useState(false);
  const [allergyModalTarget, setAllergyModalTarget] = useState<'household' | 'new_member' | string>('household');
  const [allergySearch, setAllergySearch] = useState('');
  const [activeAllergyTab, setActiveAllergyTab] = useState<
    'all' | 'major_14' | 'other_allergies' | 'baby_maternity' | 'diets'
  >('all');
  const [customAllergyInput, setCustomAllergyInput] = useState('');

  // New Member form state
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'parent' | 'child' | 'toddler' | 'baby'>('parent');
  const [newMemberGender, setNewMemberGender] = useState<'M' | 'F' | 'other'>('M');
  const [newMemberBirthDate, setNewMemberBirthDate] = useState('');
  const [newMemberNotes, setNewMemberNotes] = useState('');
  const [newMemberSelectedAllergies, setNewMemberSelectedAllergies] = useState<string[]>([]);

  // Vaccine Tracker state per child
  const childMembers = preferences.members.filter((m) => m.role !== 'parent');
  const [selectedVaccineChildId, setSelectedVaccineChildId] = useState<string>('');
  const [newVaccineName, setNewVaccineName] = useState('');
  const [newVaccineDueDate, setNewVaccineDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [newVaccineNotes, setNewVaccineNotes] = useState('');

  const activeVaccineChild =
    childMembers.find((c) => c.id === selectedVaccineChildId) || childMembers[0] || null;

  const getOptionLabel = (idOrText: string): string => {
    const found = ALLERGY_AND_DIET_CATALOG.find((o) => o.id === idOrText || o.label === idOrText);
    return found ? found.label : idOrText;
  };

  // Calculate evolutionary age & pediatric nutrition stage from birthDate
  const getMemberAgeDetails = (member: FamilyMember) => {
    if (member.birthDate) {
      const birth = new Date(member.birthDate);
      const now = new Date();
      const totalMonths =
        (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());

      if (totalMonths < 36) {
        const months = Math.max(0, totalMonths);
        let stage = 'Assiette Junior Évolutive';
        if (months < 4) {
          stage = '🍼 Nourrisson · Lait exclusif';
        } else if (months <= 8) {
          stage = '🥣 Début Diversification · Purées lisses';
        } else if (months <= 12) {
          stage = '🥄 Textures Écrasées · Zéro sel';
        } else if (months <= 24) {
          stage = '👶 Morceaux Fondants · Sans sel ajouté';
        } else {
          stage = '🍽️ Petits Morceaux Familiaux';
        }
        return {
          ageLabel: `${months} mois`,
          months,
          isYoungChild: true,
          stage,
          formattedBirth: birth.toLocaleDateString('fr-FR'),
        };
      }

      const years = Math.floor(totalMonths / 12);
      return {
        ageLabel: `${years} ans`,
        months: totalMonths,
        isYoungChild: false,
        stage: member.role === 'parent' ? 'Adulte' : 'Enfant',
        formattedBirth: birth.toLocaleDateString('fr-FR'),
      };
    }

    return {
      ageLabel: `${member.age} ans`,
      months: member.age * 12,
      isYoungChild: member.age < 3,
      stage: member.age < 3 ? 'Tout-petit' : 'Adulte / Enfant',
      formattedBirth: null,
    };
  };

  const handleWeeklyBudgetChange = (value: number) => {
    onUpdatePreferences({
      ...preferences,
      weeklyBudget: value,
      maxPerMeal: Number((value / (7 * 4)).toFixed(2)),
    });
  };

  // Get active list of selected items for the currently open Allergy Modal target
  const getTargetSelectedList = (): string[] => {
    if (allergyModalTarget === 'household') {
      return preferences.dietaryRestrictions || [];
    }
    if (allergyModalTarget === 'new_member') {
      return newMemberSelectedAllergies;
    }
    const member = preferences.members.find((m) => m.id === allergyModalTarget);
    return member?.allergies || [];
  };

  const toggleItemInAllergyModal = (itemKey: string) => {
    if (allergyModalTarget === 'household') {
      const current = preferences.dietaryRestrictions || [];
      const updated = current.includes(itemKey)
        ? current.filter((r) => r !== itemKey)
        : [...current, itemKey];
      onUpdatePreferences({
        ...preferences,
        dietaryRestrictions: updated,
      });
    } else if (allergyModalTarget === 'new_member') {
      setNewMemberSelectedAllergies((prev) =>
        prev.includes(itemKey) ? prev.filter((a) => a !== itemKey) : [...prev, itemKey]
      );
    } else {
      const updatedMembers = preferences.members.map((m) => {
        if (m.id !== allergyModalTarget) return m;
        const exists = m.allergies.includes(itemKey);
        return {
          ...m,
          allergies: exists
            ? m.allergies.filter((a) => a !== itemKey)
            : [...m.allergies, itemKey],
        };
      });
      onUpdatePreferences({
        ...preferences,
        members: updatedMembers,
      });
    }
  };

  const handleAddCustomAllergy = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customAllergyInput.trim();
    if (!trimmed) return;
    const current = getTargetSelectedList();
    if (!current.includes(trimmed)) {
      toggleItemInAllergyModal(trimmed);
    }
    setCustomAllergyInput('');
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    const colors = ['bg-emerald-600', 'bg-blue-600', 'bg-amber-600', 'bg-rose-500', 'bg-purple-600'];
    const randomColor = colors[preferences.members.length % colors.length];

    const birth = newMemberBirthDate ? new Date(newMemberBirthDate) : null;
    const now = new Date();
    const computedMonths = birth
      ? Math.max(0, (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth()))
      : newMemberRole === 'parent'
      ? 360
      : 12;
    const computedYears = Math.floor(computedMonths / 12);

    const autoRole: FamilyMember['role'] =
      newMemberRole === 'parent'
        ? 'parent'
        : computedMonths < 12
        ? 'baby'
        : computedMonths < 36
        ? 'toddler'
        : 'child';

    const newMember: FamilyMember = {
      id: `member-${Date.now()}`,
      name: newMemberName.trim(),
      role: autoRole,
      gender: newMemberGender,
      birthDate: newMemberBirthDate || undefined,
      age: computedYears,
      avatarColor: randomColor,
      dietNotes: newMemberNotes.trim() || undefined,
      allergies: newMemberSelectedAllergies.map((a) => getOptionLabel(a)),
      vaccines: [],
    };

    const updatedMembers = [...preferences.members, newMember];
    const adultMembersCount = updatedMembers.filter((m) => m.role === 'parent').length;
    const nextAdultsCount =
      adultMembersCount > 0
        ? adultMembersCount
        : preferences.adultsCount || preferences.householdSize || 2;

    onUpdatePreferences({
      ...preferences,
      members: updatedMembers,
      adultsCount: nextAdultsCount,
      householdSize: nextAdultsCount,
    });

    if (autoRole !== 'parent') {
      setSelectedVaccineChildId(newMember.id);
    }

    setNewMemberName('');
    setNewMemberBirthDate('');
    setNewMemberNotes('');
    setNewMemberSelectedAllergies([]);
    setIsAddingMember(false);
  };

  const handleDeleteMember = (id: string) => {
    const updatedMembers = preferences.members.filter((m) => m.id !== id);
    const adultMembersCount = updatedMembers.filter((m) => m.role === 'parent').length;
    const nextAdultsCount =
      adultMembersCount > 0 ? adultMembersCount : Math.max(1, preferences.adultsCount || 2);

    onUpdatePreferences({
      ...preferences,
      members: updatedMembers,
      adultsCount: nextAdultsCount,
      householdSize: nextAdultsCount,
    });
  };

  // Vaccine Handlers
  const handleAddVaccineForChild = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVaccineChild || !newVaccineName.trim() || !newVaccineDueDate) return;

    const newReminder: VaccineReminder = {
      id: `vac-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      vaccineName: newVaccineName.trim(),
      dueDate: newVaccineDueDate,
      completed: false,
      notes: newVaccineNotes.trim() || undefined,
    };

    const updatedMembers = preferences.members.map((m) => {
      if (m.id !== activeVaccineChild.id) return m;
      const existing = m.vaccines || [];
      return {
        ...m,
        vaccines: [...existing, newReminder].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      };
    });

    onUpdatePreferences({
      ...preferences,
      members: updatedMembers,
    });

    if (onNotifyVaccineReminder) {
      onNotifyVaccineReminder(activeVaccineChild.name, newReminder);
    }

    setNewVaccineName('');
    setNewVaccineNotes('');
  };

  const handleToggleVaccineCompleted = (childId: string, vaccineId: string) => {
    const todayIso = new Date().toISOString().split('T')[0];
    const updatedMembers = preferences.members.map((m) => {
      if (m.id !== childId) return m;
      const updatedVaccines = (m.vaccines || []).map((v) =>
        v.id === vaccineId
          ? {
              ...v,
              completed: !v.completed,
              completedDate: !v.completed ? todayIso : undefined,
            }
          : v
      );
      return { ...m, vaccines: updatedVaccines };
    });

    onUpdatePreferences({
      ...preferences,
      members: updatedMembers,
    });
  };

  const handleDeleteVaccine = (childId: string, vaccineId: string) => {
    const updatedMembers = preferences.members.map((m) => {
      if (m.id !== childId) return m;
      return {
        ...m,
        vaccines: (m.vaccines || []).filter((v) => v.id !== vaccineId),
      };
    });

    onUpdatePreferences({
      ...preferences,
      members: updatedMembers,
    });
  };

  const handlePrefillOfficialSchedule = (child: FamilyMember) => {
    const ageInfo = getMemberAgeDetails(child);
    const existingNames = new Set((child.vaccines || []).map((v) => v.vaccineName));

    const baseBirthDate = child.birthDate
      ? new Date(child.birthDate)
      : new Date(Date.now() - ageInfo.months * 30.4375 * 24 * 3600 * 1000);

    const relevantMilestones = OFFICIAL_VACCINE_MILESTONES.filter(
      (ms) => ms.monthsOffset >= Math.max(2, ageInfo.months - 1) && !existingNames.has(ms.vaccineName)
    ).slice(0, 4);

    if (relevantMilestones.length === 0) return;

    const generated: VaccineReminder[] = relevantMilestones.map((ms, idx) => {
      const targetDate = new Date(baseBirthDate);
      targetDate.setMonth(targetDate.getMonth() + ms.monthsOffset);
      return {
        id: `vac-auto-${Date.now()}-${idx}`,
        vaccineName: ms.vaccineName,
        dueDate: targetDate.toISOString().split('T')[0],
        completed: false,
        notes: ms.notes,
      };
    });

    const updatedMembers = preferences.members.map((m) => {
      if (m.id !== child.id) return m;
      const merged = [...(m.vaccines || []), ...generated].sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate)
      );
      return { ...m, vaccines: merged };
    });

    onUpdatePreferences({
      ...preferences,
      members: updatedMembers,
    });
  };

  const getDaysUntilVaccine = (dueDateStr: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const filteredCatalog = ALLERGY_AND_DIET_CATALOG.filter((item) => {
    if (activeAllergyTab !== 'all' && item.category !== activeAllergyTab) return false;
    if (allergySearch.trim()) {
      const q = allergySearch.toLowerCase();
      return (
        item.label.toLowerCase().includes(q) ||
        (item.sublabel && item.sublabel.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const currentSelectedInModal = getTargetSelectedList();
  const totalUpcomingVaccines = childMembers.reduce(
    (sum, c) => sum + (c.vaccines || []).filter((v) => !v.completed).length,
    0
  );

  return (
    <div className="space-y-4">
      {/* CLEAN 4-TAB SEGMENTED NAVIGATION FOR FOYER (2x2 grid on mobile, inline on desktop) */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shadow-2xs">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full lg:w-auto">
          <button
            type="button"
            onClick={() => setActiveSection('members')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer ${
              activeSection === 'members'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 sm:bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Membres ({preferences.members.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('habits')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer ${
              activeSection === 'habits'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 sm:bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="truncate">Habitudes ({habitualProducts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('vaccines')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer ${
              activeSection === 'vaccines'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 sm:bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Syringe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate">Vaccins</span>
            {totalUpcomingVaccines > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-black shrink-0">
                {totalUpcomingVaccines}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('settings')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer ${
              activeSection === 'settings'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 sm:bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Partage & Maison</span>
          </button>
        </div>

        {/* Always-accessible Household Adults Stepper (children are never counted as adults) */}
        {(() => {
          const parentCount = preferences.members.filter((m) => m.role === 'parent').length;
          const activeAdults = Math.max(
            1,
            preferences.adultsCount || (parentCount > 0 ? parentCount : 2)
          );
          return (
            <div
              className="flex items-center justify-between sm:justify-start gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
              title="Les enfants et bébés ne sont pas comptés comme des adultes pour les recettes de la semaine"
            >
              <span className="text-slate-600 font-semibold">Adultes (recettes) :</span>
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(1, activeAdults - 1);
                  onUpdatePreferences({
                    ...preferences,
                    adultsCount: next,
                    householdSize: next,
                  });
                }}
                className="w-5 h-5 rounded bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer flex items-center justify-center"
              >
                -
              </button>
              <strong className="px-1 text-slate-900 font-extrabold">
                {activeAdults} adulte{activeAdults > 1 ? 's' : ''}
              </strong>
              <button
                type="button"
                onClick={() => {
                  const next = activeAdults + 1;
                  onUpdatePreferences({
                    ...preferences,
                    adultsCount: next,
                    householdSize: next,
                  });
                }}
                className="w-5 h-5 rounded bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer flex items-center justify-center"
              >
                +
              </button>
              {childMembers.length > 0 && (
                <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg ml-1">
                  +{childMembers.length} enfant{childMembers.length > 1 ? 's' : ''} à part
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* SECTION 1: MEMBRES DU FOYER */}
      {activeSection === 'members' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Membres de la famille ({preferences.members.length} configuré{preferences.members.length > 1 ? 's' : ''})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ajoutez les adultes et enfants pour adapter automatiquement les portions, allergies et suivis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingMember(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Ajouter un membre</span>
            </button>
          </div>

          {preferences.members.length === 0 ? (
            <div className="text-center py-8 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 p-6">
              <p className="text-sm font-bold text-slate-800">Aucun membre configuré</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Ajoutez les parents et vos enfants (avec leur date de naissance et leurs allergies) pour personnaliser votre maison.
              </p>
              <button
                type="button"
                onClick={() => setIsAddingMember(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter le 1er membre</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {preferences.members.map((member) => {
                const ageInfo = getMemberAgeDetails(member);
                const isChild = member.role !== 'parent';
                const pendingVaccinesCount = (member.vaccines || []).filter((v) => !v.completed).length;
                const genderLabel =
                  member.gender === 'M'
                    ? member.role === 'parent'
                      ? 'Homme'
                      : 'Garçon'
                    : member.gender === 'F'
                    ? member.role === 'parent'
                      ? 'Femme'
                      : 'Fille'
                    : 'Membre';

                return (
                  <div
                    key={member.id}
                    className="p-4 rounded-2xl bg-slate-50/60 border border-slate-200 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-full ${member.avatarColor} text-white flex items-center justify-center font-bold text-xs shrink-0`}
                          >
                            {member.name.substring(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{member.name}</h4>
                            <p className="text-xs text-slate-500">
                              {genderLabel} · <strong className="text-slate-800">{ageInfo.ageLabel}</strong>
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteMember(member.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-700">
                          {ageInfo.stage}
                        </span>
                        {isChild && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVaccineChildId(member.id);
                              setActiveSection('vaccines');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-[11px] font-bold text-indigo-800 cursor-pointer"
                          >
                            <Syringe className="w-3 h-3 text-indigo-600" />
                            <span>Vaccins ({pendingVaccinesCount})</span>
                          </button>
                        )}
                      </div>

                      {member.dietNotes && (
                        <p className="text-xs text-slate-500 mt-1.5 italic">« {member.dietNotes} »</p>
                      )}

                      <div className="mt-2.5 pt-2.5 border-t border-slate-200/70">
                        {member.allergies.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {member.allergies.map((all, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded-md flex items-center gap-1"
                              >
                                <ShieldAlert className="w-3 h-3" />
                                {getOptionLabel(all)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 mb-1.5">Aucune allergie signalée</p>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setAllergyModalTarget(member.id);
                            setIsAllergyModalOpen(true);
                          }}
                          className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          <span>Allergies ({member.allergies.length})</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: SUIVI VACCINAL PAR ENFANT */}
      {activeSection === 'vaccines' && (
        <div
          id="foyer-vaccine-module"
          className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Syringe className="w-4 h-4 text-indigo-600" />
                <span>Carnet Vaccinal par Enfant & Rappels Quotidien</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Les échéances à moins de 14 jours déclenchent automatiquement un rappel dans Quotidien et en Push.
              </p>
            </div>

            {childMembers.length > 0 && activeVaccineChild && (
              <button
                type="button"
                onClick={() => handlePrefillOfficialSchedule(activeVaccineChild)}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Suggérer selon l’âge de {activeVaccineChild.name}</span>
              </button>
            )}
          </div>

          {childMembers.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
              <p className="text-xs font-bold text-slate-700">
                Aucun enfant configuré dans le foyer
              </p>
              <button
                type="button"
                onClick={() => {
                  setNewMemberRole('baby');
                  setIsAddingMember(true);
                }}
                className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter un enfant</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {childMembers.map((child) => {
                  const isSelected = activeVaccineChild?.id === child.id;
                  const ageDetails = getMemberAgeDetails(child);
                  const vaccines = child.vaccines || [];
                  const upcomingCount = vaccines.filter((v) => !v.completed).length;

                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setSelectedVaccineChildId(child.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{ageDetails.months < 12 ? '👶' : ageDetails.months < 36 ? '🧒' : '🎒'}</span>
                      <span>{child.name} ({ageDetails.ageLabel})</span>
                      {upcomingCount > 0 && (
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                            isSelected ? 'bg-amber-400 text-slate-950' : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {upcomingCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {activeVaccineChild && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <form
                    onSubmit={handleAddVaccineForChild}
                    className="lg:col-span-5 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
                  >
                    <h4 className="text-xs font-bold text-slate-800">
                      + Nouveau rappel pour {activeVaccineChild.name}
                    </h4>

                    <div className="flex flex-wrap gap-1">
                      {QUICK_VACCINE_PRESETS.slice(0, 6).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewVaccineName(preset)}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 text-[10px] font-semibold text-slate-700 cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      required
                      value={newVaccineName}
                      onChange={(e) => setNewVaccineName(e.target.value)}
                      placeholder="Nom du vaccin (ex: ROR 2ème dose) *"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        required
                        value={newVaccineDueDate}
                        onChange={(e) => setNewVaccineDueDate(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                      />
                      <input
                        type="text"
                        value={newVaccineNotes}
                        onChange={(e) => setNewVaccineNotes(e.target.value)}
                        placeholder="Note (ex: Ordonnance)"
                        className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Enregistrer l’échéance
                    </button>
                  </form>

                  <div className="lg:col-span-7 space-y-2">
                    {(activeVaccineChild.vaccines || []).length === 0 ? (
                      <div className="h-full min-h-[160px] p-5 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                        <p className="text-xs font-bold text-slate-700">
                          Aucune échéance enregistrée pour {activeVaccineChild.name}
                        </p>
                      </div>
                    ) : (
                      (activeVaccineChild.vaccines || []).map((vac) => {
                        const daysUntil = getDaysUntilVaccine(vac.dueDate);
                        const isOverdue = !vac.completed && daysUntil < 0;
                        const isImminent = !vac.completed && daysUntil >= 0 && daysUntil <= 14;
                        const formattedDate = new Date(vac.dueDate).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        });

                        return (
                          <div
                            key={vac.id}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                              vac.completed
                                ? 'bg-slate-50 border-slate-200'
                                : isOverdue
                                ? 'bg-rose-50/60 border-rose-300'
                                : isImminent
                                ? 'bg-amber-50/60 border-amber-300'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleVaccineCompleted(activeVaccineChild.id, vac.id)
                                }
                                className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border shrink-0 cursor-pointer ${
                                  vac.completed
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'bg-white border-slate-300'
                                }`}
                              >
                                {vac.completed && <Check className="w-3.5 h-3.5" />}
                              </button>
                              <div className="min-w-0">
                                <p
                                  className={`text-xs font-bold ${
                                    vac.completed ? 'line-through text-slate-400' : 'text-slate-900'
                                  }`}
                                >
                                  {vac.vaccineName}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  Échéance : <strong>{formattedDate}</strong>
                                  {!vac.completed && ` (${daysUntil < 0 ? `Retard ${Math.abs(daysUntil)}j` : `J-${daysUntil}`})`}
                                  {vac.notes ? ` · ${vac.notes}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {!vac.completed && onNotifyVaccineReminder && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onNotifyVaccineReminder(activeVaccineChild.name, vac)
                                  }
                                  className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[11px] font-bold cursor-pointer"
                                >
                                  Rappeler
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteVaccine(activeVaccineChild.id, vac.id)}
                                className="p-1 text-slate-300 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: HABITUDES ALIMENTAIRES, ALLERGIES & BUDGET */}
      {activeSection === 'habits' && (
        <div className="space-y-4">
          {/* Sub-card A: Habitual Products */}
          <div
            id="foyer-habitual-products"
            className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Nos Produits Habituels ({habitualProducts.length} sélectionnés)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cochez les produits que vous achetez régulièrement : vos recettes et menus seront créés avec ces aliments.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleApplyFamilyStaplesPreset}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-bold cursor-pointer"
                >
                  ✨ Pré-remplir les classiques
                </button>
                {fridgeItems.filter((i) => !i.consumed && i.quantity > 0).length > 0 && (
                  <button
                    type="button"
                    onClick={handleImportFromFridgeToHabits}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    + Importer du frigo
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'Tous les rayons' },
                { id: 'proteins', label: '🍗 Viandes, Poissons & Œufs' },
                { id: 'carbs', label: '🍝 Féculents, Pâtes & Riz' },
                { id: 'veggies_fruits', label: '🥕 Légumes & Fruits' },
                { id: 'dairy_breakfast', label: '🥛 Crèmerie & Matin' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveHabitCategory(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                    activeHabitCategory === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Selectable Chips */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {HABITUAL_PRODUCTS_CATALOG.filter(
                (group) => activeHabitCategory === 'all' || group.category === activeHabitCategory
              ).map((group) => (
                <div
                  key={group.category}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2"
                >
                  <h4 className="text-xs font-bold text-slate-800">{group.categoryLabel}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => {
                      const isSelected = habitualProducts.some(
                        (p) => p.toLowerCase() === item.toLowerCase()
                      );
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleToggleHabitualProduct(item)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1 cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                          }`}
                        >
                          {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-slate-400" />}
                          <span>{item}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Custom Input + Habits Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <form onSubmit={handleAddCustomHabitProduct} className="flex gap-2">
                <input
                  type="text"
                  value={customHabitInput}
                  onChange={(e) => setCustomHabitInput(e.target.value)}
                  placeholder="Autre produit habituel (ex: Skyr, Crevettes...)"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                >
                  + Ajouter
                </button>
              </form>

              <input
                type="text"
                value={preferences.mealHabitsNotes || ''}
                onChange={(e) =>
                  onUpdatePreferences({
                    ...preferences,
                    mealHabitsNotes: e.target.value,
                  })
                }
                placeholder="Notes repas (ex: Pâtes 2x/semaine, rapide le soir...)"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            {/* Formats Drive Mémorisés pour vos produits habituels */}
            {habitualProducts.length > 0 && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Formats Drive mémorisés ({DRIVE_BRANDS_CATALOG[preferences.preferredDriveBrand || 'leclerc'].name})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Associez vos conditionnements préférés (ex: boîte x12, pack 6x1L, Bio, Marque Repère) pour cibler le bon article dans l'Assistant Drive.
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {(Object.keys(DRIVE_BRANDS_CATALOG) as DriveBrandCode[]).map((bCode) => {
                      const bInfo = DRIVE_BRANDS_CATALOG[bCode];
                      const active = (preferences.preferredDriveBrand || 'leclerc') === bCode;
                      return (
                        <button
                          key={bCode}
                          type="button"
                          onClick={() =>
                            onUpdatePreferences({
                              ...preferences,
                              preferredDriveBrand: bCode,
                            })
                          }
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {bInfo.shortName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                  {habitualProducts.map((prodName) => {
                    const qInfo = buildOptimizedDriveQuery(
                      prodName,
                      preferences.driveProductSpecs
                    );
                    const suggestions = getSmartDriveFormatSuggestions(prodName);
                    return (
                      <div
                        key={prodName}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {prodName}
                          </span>
                          {qInfo.savedSpec && (
                            <span className="text-[10px] font-bold text-blue-700 truncate">
                              {qInfo.savedSpec}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {suggestions.slice(0, 3).map((sug) => {
                            const isSelected =
                              qInfo.savedSpec.toLowerCase() === sug.toLowerCase();
                            return (
                              <button
                                key={sug}
                                type="button"
                                onClick={() => {
                                  const nextSpecs = {
                                    ...(preferences.driveProductSpecs || {}),
                                  };
                                  if (isSelected) {
                                    delete nextSpecs[qInfo.canonicalKey];
                                  } else {
                                    nextSpecs[qInfo.canonicalKey] = sug;
                                  }
                                  onUpdatePreferences({
                                    ...preferences,
                                    driveProductSpecs: nextSpecs,
                                  });
                                }}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border cursor-pointer ${
                                  isSelected
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'
                                }`}
                              >
                                {isSelected ? `✓ ${sug}` : `+ ${sug}`}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="text"
                          value={qInfo.savedSpec}
                          onChange={(e) => {
                            const val = e.target.value;
                            const nextSpecs = {
                              ...(preferences.driveProductSpecs || {}),
                            };
                            if (!val.trim()) {
                              delete nextSpecs[qInfo.canonicalKey];
                            } else {
                              nextSpecs[qInfo.canonicalKey] = val;
                            }
                            onUpdatePreferences({
                              ...preferences,
                              driveProductSpecs: nextSpecs,
                            });
                          }}
                          placeholder="Précision Drive (ex: Pack 6x1L Bio...)"
                          className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] focus:bg-white focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Direct CTA to generate recipes or weekly menu */}
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold">
                🏠 Prêt à générer vos repas avec vos <strong>{habitualProducts.length} produits habituels</strong> :
              </span>
              <div className="flex flex-wrap gap-2">
                {onGenerateHabitRecipes && (
                  <button
                    type="button"
                    onClick={onGenerateHabitRecipes}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-extrabold cursor-pointer"
                  >
                    ✨ Générer 3 recettes
                  </button>
                )}
                {onGenerateHabitMenu && (
                  <button
                    type="button"
                    onClick={onGenerateHabitMenu}
                    className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    📅 Créer le menu 7 jours
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Sub-card B: Aliments à proscrire complètement (même sans allergies) */}
          <div
            id="foyer-excluded-foods"
            className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span>🚫 Aliments à proscrire complètement ({excludedFoods.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sélectionnez les aliments que vous n'aimez pas (même sans allergie) : ils seront bannis de vos recettes et menus de la semaine.
                </p>
              </div>
              {excludedFoods.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePreferences({
                      ...preferences,
                      excludedFoods: [],
                    })
                  }
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 shrink-0 cursor-pointer"
                >
                  Réinitialiser les exclusions
                </button>
              )}
            </div>

            {/* Active Excluded Foods Badges */}
            {excludedFoods.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                <span className="text-xs font-bold text-rose-900 mr-1 self-center">
                  Bannis des menus :
                </span>
                {excludedFoods.map((food) => (
                  <span
                    key={food}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-2xs"
                  >
                    <span>🚫 {food}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleExcludedFood(food)}
                      className="text-rose-200 hover:text-white ml-0.5 cursor-pointer"
                      title="Retirer des aliments proscrits"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Category Filter Tabs for Excluded Foods */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'Tous les aliments' },
                { id: 'veggies_herbs', label: '🥦 Légumes & Herbes' },
                { id: 'meats_fish', label: '🥩 Viandes & Poissons' },
                { id: 'cheese_pantry', label: '🧀 Fromages, Épicerie & Autres' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveExcludedCategory(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                    activeExcludedCategory === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Selectable Chips */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {EXCLUDED_FOODS_CATALOG.filter(
                (group) =>
                  activeExcludedCategory === 'all' || group.category === activeExcludedCategory
              ).map((group) => (
                <div
                  key={group.category}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2"
                >
                  <h4 className="text-xs font-bold text-slate-800">{group.categoryLabel}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => {
                      const isExcluded = excludedFoods.some(
                        (f) => f.toLowerCase() === item.toLowerCase()
                      );
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleToggleExcludedFood(item)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1 cursor-pointer ${
                            isExcluded
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-rose-400'
                          }`}
                        >
                          {isExcluded ? (
                            <X className="w-3 h-3" />
                          ) : (
                            <Plus className="w-3 h-3 text-slate-400" />
                          )}
                          <span>{item}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Custom Excluded Food Input */}
            <form onSubmit={handleAddCustomExcludedFood} className="flex gap-2">
              <input
                type="text"
                value={customExcludedInput}
                onChange={(e) => setCustomExcludedInput(e.target.value)}
                placeholder="Proscrire un autre aliment (ex: boudin, salsifis, aneth, surimi...)"
                className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
              >
                + Proscrire
              </button>
            </form>
          </div>

          {/* Sub-card C: Allergies & Weekly Budget */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Allergies & Régimes Alimentaires du Foyer ({preferences.dietaryRestrictions.length})
                </h3>
                {preferences.dietaryRestrictions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {preferences.dietaryRestrictions.map((itemKey) => (
                      <span
                        key={itemKey}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold"
                      >
                        <span>{getOptionLabel(itemKey)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdatePreferences({
                              ...preferences,
                              dietaryRestrictions: preferences.dietaryRestrictions.filter(
                                (r) => r !== itemKey
                              ),
                            })
                          }
                          className="text-emerald-700 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mt-0.5">
                    Aucune restriction sélectionnée pour l'ensemble du foyer.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setAllergyModalTarget('household');
                  setIsAllergyModalOpen(true);
                }}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
              >
                Choisir les allergies ({preferences.dietaryRestrictions.length})
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Budget courses hebdomadaire : {preferences.weeklyBudget} € / semaine
                </h3>
                <p className="text-xs text-slate-500">
                  Cible par repas : ~{preferences.maxPerMeal.toFixed(2)} € / personne
                </p>
              </div>
              <input
                type="range"
                min="40"
                max="250"
                step="5"
                value={preferences.weeklyBudget}
                onChange={(e) => handleWeeklyBudgetChange(Number(e.target.value))}
                className="w-full sm:w-56 accent-emerald-600 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: PARTAGE & GESTION DE LA MAISON */}
      {activeSection === 'settings' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Partage & Réinitialisation</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Synchronisez votre foyer avec le téléphone de votre conjoint(e) ou remettez l'application à zéro.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenShareModal && (
              <button
                type="button"
                onClick={onOpenShareModal}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                📱 Partager / Installer sur téléphone
              </button>
            )}

            {onResetHousehold && (
              <>
                {!confirmReset ? (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Vider la maison</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onResetHousehold();
                        setConfirmReset(false);
                      }}
                      className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Confirmer la remise à zéro
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="px-2.5 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {isAddingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Ajouter un membre au foyer</h3>
              <button
                onClick={() => setIsAddingMember(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prénom *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Papa, Maman, Léo, Chloé..."
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sexe *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'M', label: '👦 Garçon / Homme' },
                    { id: 'F', label: '👧 Fille / Femme' },
                  ].map((g) => (
                    <button
                      type="button"
                      key={g.id}
                      onClick={() => setNewMemberGender(g.id as any)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border cursor-pointer ${
                        newMemberGender === g.id
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date de naissance *
                  </label>
                  <input
                    type="date"
                    required
                    value={newMemberBirthDate}
                    onChange={(e) => setNewMemberBirthDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rôle</label>
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="parent">Parent / Adulte</option>
                    <option value="baby">Bébé (- 12 mois)</option>
                    <option value="toddler">Tout-petit (1 à 3 ans)</option>
                    <option value="child">Enfant (+ 3 ans)</option>
                  </select>
                </div>
              </div>

              {/* Allergies button opening the dedicated selector modal */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allergies & intolérances de ce membre
                </label>
                {newMemberSelectedAllergies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {newMemberSelectedAllergies.map((all) => (
                      <span
                        key={all}
                        className="text-[10px] bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded-md"
                      >
                        {getOptionLabel(all)}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAllergyModalTarget('new_member');
                    setIsAllergyModalOpen(true);
                  }}
                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-slate-300 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    Choisir dans la liste des allergies ({newMemberSelectedAllergies.length})
                  </span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes (optionnel)
                </label>
                <input
                  type="text"
                  placeholder="ex: Allaitement, DME, gros appétit..."
                  value={newMemberNotes}
                  onChange={(e) => setNewMemberNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingMember(false)}
                  className="flex-1 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEDICATED POPUP MODAL: CHOISIR LES ALLERGIES & PRÉFÉRENCES ALIMENTAIRES */}
      {isAllergyModalOpen && (
        <div
          onClick={() => setIsAllergyModalOpen(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[88dvh] animate-slide-up"
          >
            {/* Modal Header */}
            <div className="px-4 py-3.5 sm:px-5 sm:py-4 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold block">
                  Catalogue Complet (30+ Allergènes & Régimes)
                </span>
                <h3 className="text-sm sm:text-base font-bold font-display truncate">
                  Allergies, Intolérances & Préférences
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAllergyModalOpen(false)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Fermer</span>
              </button>
            </div>

            {/* Search & Category Filter Tabs */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={allergySearch}
                  onChange={(e) => setAllergySearch(e.target.value)}
                  placeholder="Rechercher une allergie (ex: arachide, lait, fraise, gluten, oeuf, sésame...)"
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {[
                  { id: 'all', label: 'Tous (31)' },
                  { id: 'major_14', label: '🚨 14 Allergènes Majeurs' },
                  { id: 'other_allergies', label: '🍓 Autres Allergies & Intolérances' },
                  { id: 'baby_maternity', label: '👶 Sécurité Bébé & Maternité' },
                  { id: 'diets', label: '🥗 Régimes & Convictions' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveAllergyTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      activeAllergyTab === tab.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Options Grid */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredCatalog.map((opt) => {
                  const isSelected =
                    currentSelectedInModal.includes(opt.id) ||
                    currentSelectedInModal.includes(opt.label);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleItemInAllergyModal(opt.id)}
                      className={`p-3 rounded-2xl border text-left transition-all flex items-start justify-between gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900">{opt.label}</p>
                        {opt.sublabel && (
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            {opt.sublabel}
                          </p>
                        )}
                      </div>
                      <span
                        className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'border border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Allergy Input */}
              <form
                onSubmit={handleAddCustomAllergy}
                className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <input
                  type="text"
                  value={customAllergyInput}
                  onChange={(e) => setCustomAllergyInput(e.target.value)}
                  placeholder="Autre allergie ou aliment à exclure (ex: Pêche, Sarrasin, Coriandre...)"
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                >
                  + Ajouter
                </button>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <span className="text-xs font-semibold text-slate-600">
                <strong>{currentSelectedInModal.length}</strong> élément(s) sélectionné(s)
              </span>
              <button
                type="button"
                onClick={() => setIsAllergyModalOpen(false)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                Valider la sélection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
