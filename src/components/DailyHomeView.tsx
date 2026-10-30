import React, { useState, useEffect } from 'react';
import {
  ApplianceTask,
  BreastMilkBatch,
  FamilyMember,
  FamilyNotification,
  HouseholdChore,
  Language,
} from '../types';
import {
  Baby,
  BellRing,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  GraduationCap,
  Heart,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  Users,
  X,
} from 'lucide-react';

interface DailyHomeViewProps {
  appliances: ApplianceTask[];
  breastMilkBatches: BreastMilkBatch[];
  chores: HouseholdChore[];
  notifications: FamilyNotification[];
  members: FamilyMember[];
  lang: Language;
  onStartAppliance: (id: string, program: string, durationMinutes: number, startedBy: string) => void;
  onFinishApplianceNow: (id: string) => void;
  onAcknowledgeAppliance: (id: string, doneBy: string) => void;
  onAddBreastMilk: (batch: Omit<BreastMilkBatch, 'id'>) => void;
  onUseBreastMilk: (id: string) => void;
  onMoveBreastMilkToFridge: (id: string) => void;
  onToggleChore: (id: string, doneBy: string) => void;
  onAddChore: (chore: Omit<HouseholdChore, 'id'>) => void;
  onDeleteChore: (id: string) => void;
  onSendNotification: (
    title: string,
    message: string,
    createdBy: string,
    type: FamilyNotification['type']
  ) => void;
  onDismissNotification: (id: string) => void;
  onNavigateToFamily?: () => void;
  onToggleVaccineCompleted?: (childId: string, vaccineId: string) => void;
  onSendChorePush?: (chore: HouseholdChore) => void;
}

interface LastFeedingLog {
  timestampIso: string;
  type: 'left_breast' | 'right_breast' | 'bottle';
  volumeMl?: number;
  loggedBy: string;
}

type FoodReaction = 'untested' | 'loved' | 'neutral' | 'allergy';

interface ChildHealthRecord {
  weightKg: string;
  heightCm: string;
  shoeSize: string;
  nextVaccineOrDoctor: string;
}

interface HomeworkItem {
  id: string;
  subject: string;
  task: string;
  dueDay: string;
  done: boolean;
}

interface SchoolDaySchedule {
  canteen: boolean;
  afterSchoolCare: boolean;
  activity: string;
}

export interface DetectedChildProfile {
  member: FamilyMember;
  totalMonths: number;
  ageLabel: string;
  category: 'baby' | 'toddler' | 'school_child';
  icon: string;
}

export function getDetectedChildren(members: FamilyMember[]): DetectedChildProfile[] {
  const now = new Date();
  return members
    .filter((m) => m.role !== 'parent')
    .map((member) => {
      let totalMonths = 0;
      if (member.birthDate) {
        const birth = new Date(member.birthDate);
        totalMonths = Math.max(
          0,
          (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
        );
      } else if (member.role === 'baby') {
        totalMonths = member.age > 0 ? member.age * 12 : 5;
      } else if (member.role === 'toddler') {
        totalMonths = member.age > 0 ? member.age * 12 : 18;
      } else {
        totalMonths = Math.max(36, (member.age || 6) * 12);
      }

      const category: 'baby' | 'toddler' | 'school_child' =
        totalMonths < 12 || member.role === 'baby'
          ? 'baby'
          : totalMonths < 36 || member.role === 'toddler'
          ? 'toddler'
          : 'school_child';

      const ageLabel =
        totalMonths < 36 ? `${totalMonths} mois` : `${Math.floor(totalMonths / 12)} ans`;

      const icon = category === 'baby' ? '👶' : category === 'toddler' ? '🧒' : '🎒';

      return {
        member,
        totalMonths,
        ageLabel,
        category,
        icon,
      };
    });
}

const DIVERSIFICATION_FOODS: Array<{
  id: string;
  name: string;
  group: 'legumes' | 'fruits' | 'proteines' | 'allergenes';
  minMonths: number;
}> = [
  { id: 'carotte', name: '🥕 Carotte', group: 'legumes', minMonths: 4 },
  { id: 'courgette', name: '🥒 Courgette (sans pépins)', group: 'legumes', minMonths: 4 },
  { id: 'patate_douce', name: '🍠 Patate douce', group: 'legumes', minMonths: 4 },
  { id: 'potimarron', name: '🎃 Potimarron / Butternut', group: 'legumes', minMonths: 4 },
  { id: 'haricots_verts', name: '🫛 Haricots verts', group: 'legumes', minMonths: 4 },
  { id: 'brocoli', name: '🥦 Brocoli', group: 'legumes', minMonths: 5 },
  { id: 'petits_pois', name: '🟢 Petits pois', group: 'legumes', minMonths: 5 },
  { id: 'epinards', name: '🥬 Épinards', group: 'legumes', minMonths: 5 },
  { id: 'poireau', name: '🌱 Blanc de poireau', group: 'legumes', minMonths: 5 },
  { id: 'avocat', name: '🥑 Avocat écrasé', group: 'legumes', minMonths: 6 },
  { id: 'pomme', name: '🍎 Pomme cuite', group: 'fruits', minMonths: 4 },
  { id: 'poire', name: '🍐 Poire cuite', group: 'fruits', minMonths: 4 },
  { id: 'banane', name: '🍌 Banane bien mûre', group: 'fruits', minMonths: 4 },
  { id: 'peche_abricot', name: '🍑 Pêche / Abricot', group: 'fruits', minMonths: 5 },
  { id: 'pruneau', name: '🟣 Pruneau (transit)', group: 'fruits', minMonths: 5 },
  { id: 'mangue', name: '🥭 Mangue', group: 'fruits', minMonths: 6 },
  { id: 'fruits_rouges', name: '🍓 Fraise / Framboise', group: 'fruits', minMonths: 6 },
  { id: 'poulet_dinde', name: '🍗 Poulet / Dinde', group: 'proteines', minMonths: 6 },
  { id: 'cabillaud', name: '🐟 Poisson blanc (Cabillaud)', group: 'proteines', minMonths: 6 },
  { id: 'saumon', name: '🍣 Saumon vapeur', group: 'proteines', minMonths: 6 },
  { id: 'boeuf_veau', name: '🥩 Bœuf / Veau bien cuit', group: 'proteines', minMonths: 6 },
  { id: 'lentilles', name: '🫘 Lentilles corail fondantes', group: 'proteines', minMonths: 8 },
  { id: 'pates_petites', name: '🍝 Petites pâtes / Semoule', group: 'proteines', minMonths: 8 },
  { id: 'oeuf_dur', name: '🥚 Œuf bien cuit (jaune + blanc)', group: 'allergenes', minMonths: 6 },
  { id: 'gluten', name: '🌾 Gluten (blé / avoine)', group: 'allergenes', minMonths: 4 },
  { id: 'arachide', name: '🥜 Purée cacahuète 100% lisse', group: 'allergenes', minMonths: 6 },
  { id: 'amande_noisette', name: '🌰 Purée d’amande / noisette', group: 'allergenes', minMonths: 6 },
  { id: 'lait_yaourt', name: '🥛 Yaourt nature / Laitage', group: 'allergenes', minMonths: 6 },
  { id: 'poisson_allerg', name: '🐟 Poisson (introduction)', group: 'allergenes', minMonths: 6 },
];

const BAG_CHECKLISTS_BY_STAGE: Record<
  'baby' | 'toddler' | 'school_child',
  Array<{ id: string; label: string; category: string }>
> = {
  baby: [
    { id: 'bb_1', label: '🍼 Biberons / Lait tiré en sac isotherme + pain de glace', category: 'Repas' },
    { id: 'bb_2', label: '🧷 4 à 5 Couches + Coton & Liniment / Lingettes', category: 'Change' },
    { id: 'bb_3', label: '🧺 2 Langes propres + Tapis à langer pliable', category: 'Change' },
    { id: 'bb_4', label: '👕 Body + Pyjama de rechange complet dans pochette', category: 'Tenue' },
    { id: 'bb_5', label: '👶 Tétine + Attache-tétine + Doudou', category: 'Réconfort' },
    { id: 'bb_6', label: '💧 Pipettes de sérum physiologique + Compresses', category: 'Soin' },
    { id: 'bb_7', label: '📒 Carnet de santé + Ordonnance Doliprane (Crèche/Sortie)', category: 'Santé' },
  ],
  toddler: [
    { id: 'td_1', label: '🥤 Gourde d’eau pleine + Bavoir', category: 'Repas' },
    { id: 'td_2', label: '🍎 Compote + Biscuit / Pain des fleurs (Goûter)', category: 'Goûter' },
    { id: 'td_3', label: '🧷 3 à 4 Couches / Culottes + Lingettes à l’eau', category: 'Change' },
    { id: 'td_4', label: '👖 Pantalon + Body/T-shirt + Chaussettes de rechange', category: 'Tenue' },
    { id: 'td_5', label: '🧸 Doudou + Tétine (marqués au prénom pour Crèche/Nounou)', category: 'Dodo' },
    { id: 'td_6', label: '🧥 Manteau / Chaussons / Bonnet ou Casquette selon météo', category: 'Sortie' },
  ],
  school_child: [
    { id: 'sc_1', label: '📚 Cahiers, agenda & devoirs faits rangés dans le cartable', category: 'École' },
    { id: 'sc_2', label: '✏️ Trousse complète (stylos, crayon, gomme, colle)', category: 'Matériel' },
    { id: 'sc_3', label: '✍️ Cahier de liaison vérifié / signé par les parents', category: 'Parents' },
    { id: 'sc_4', label: '🥤 Gourde d’eau remplie + Boîte à goûter pour la récré/garderie', category: 'Goûter' },
    { id: 'sc_5', label: '👟 Sac de Sport / Baskets ou Affaires de Piscine (si jour d’EPS)', category: 'Sport' },
    { id: 'sc_6', label: '🧥 Veste / Imperméable + Mouchoirs dans la poche', category: 'Météo' },
  ],
};

const SCHOOL_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const HOMEWORK_SUBJECTS = [
  '📖 Lecture / Français',
  '🔢 Mathématiques',
  '📝 Poésie / Dictée',
  '🌍 Anglais / Découverte',
  '🔬 Sciences / Histoire-Géo',
  '✍️ Mot à signer / Administratif',
];

export const DailyHomeView: React.FC<DailyHomeViewProps> = ({
  appliances,
  breastMilkBatches,
  chores,
  notifications,
  members,
  onStartAppliance,
  onFinishApplianceNow,
  onAcknowledgeAppliance,
  onAddBreastMilk,
  onUseBreastMilk,
  onMoveBreastMilkToFridge,
  onToggleChore,
  onAddChore,
  onDeleteChore,
  onSendNotification,
  onDismissNotification,
  onNavigateToFamily,
  onToggleVaccineCompleted,
  onSendChorePush,
}) => {
  const parents = members.filter((m) => m.role === 'parent');
  const parentOptions = parents.length > 0 ? parents.map((p) => p.name) : ['Papa', 'Maman'];
  const detectedChildren = getDetectedChildren(members);

  const [selectedParent, setSelectedParent] = useState<string>(parentOptions[0]);
  // activeSubTab can be 'chores', 'appliances', or `child_${member.id}`
  const [activeSubTab, setActiveSubTab] = useState<string>('chores');

  // Sub-section inside a Baby/Toddler tab or School Child tab
  const [babySubView, setBabySubView] = useState<'feeding' | 'health' | 'bag' | 'diversification'>('health');
  const [schoolSubView, setSchoolSubView] = useState<'homework' | 'bag_schedule' | 'health'>('homework');

  // Breast milk modal state
  const [isAddingMilk, setIsAddingMilk] = useState(false);
  const [milkVolume, setMilkVolume] = useState(120);
  const [milkStorage, setMilkStorage] = useState<'ambient' | 'fridge' | 'freezer'>('fridge');
  const [milkNotes, setMilkNotes] = useState('');

  // Per-child Last Feeding (Tétée / Biberon)
  const [feedingsByChild, setFeedingsByChild] = useState<Record<string, LastFeedingLog>>(() => {
    const saved = localStorage.getItem('doudous_v3_last_feeding');
    if (!saved) return {};
    try {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.timestampIso) {
        return { default: parsed };
      }
      return parsed;
    } catch {
      return {};
    }
  });
  const [bottleMlInput, setBottleMlInput] = useState(120);

  // Per-child Vitamin D daily check-in
  const todayStr = new Date().toISOString().split('T')[0];
  const [vitaminDChecks, setVitaminDChecks] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(`doudous_v3_vitd_${todayStr}`);
    return saved ? JSON.parse(saved) : {};
  });

  // Per-child Diversification reactions: Record<childId, Record<foodId, FoodReaction>>
  const [diversificationByChild, setDiversificationByChild] = useState<
    Record<string, Record<string, FoodReaction>>
  >(() => {
    const saved = localStorage.getItem('doudous_v3_diversification_by_child');
    return saved ? JSON.parse(saved) : {};
  });
  const [activeFoodGroup, setActiveFoodGroup] = useState<
    'all' | 'legumes' | 'fruits' | 'proteines' | 'allergenes'
  >('all');

  // Per-child Health Records (weight, height, shoe size, next doctor/vaccine)
  const [healthByChild, setHealthByChild] = useState<Record<string, ChildHealthRecord>>(() => {
    const saved = localStorage.getItem('doudous_v3_health_by_child');
    return saved ? JSON.parse(saved) : {};
  });

  // Per-child Last Paracetamol Dose (6h safety interval)
  const [lastMedDoses, setLastMedDoses] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('doudous_v3_med_doses');
    return saved ? JSON.parse(saved) : {};
  });

  // Per-child Bag / Cartable checklist state
  const [bagChecksByChild, setBagChecksByChild] = useState<Record<string, Record<string, boolean>>>(
    () => {
      const saved = localStorage.getItem('doudous_v3_bag_by_child');
      return saved ? JSON.parse(saved) : {};
    }
  );

  // Per-child Homework list (for school-aged children)
  const [homeworksByChild, setHomeworksByChild] = useState<Record<string, HomeworkItem[]>>(() => {
    const saved = localStorage.getItem('doudous_v3_homeworks_by_child');
    return saved ? JSON.parse(saved) : {};
  });
  const [hwSubject, setHwSubject] = useState(HOMEWORK_SUBJECTS[0]);
  const [hwTask, setHwTask] = useState('');
  const [hwDueDay, setHwDueDay] = useState('Pour demain');

  // Per-child Weekly School Schedule (Canteen, Garderie, Extracurricular Activity)
  const [scheduleByChild, setScheduleByChild] = useState<
    Record<string, Record<string, SchoolDaySchedule>>
  >(() => {
    const saved = localStorage.getItem('doudous_v3_schedule_by_child');
    return saved ? JSON.parse(saved) : {};
  });

  // Quick message & Chores state
  const [quickPingText, setQuickPingText] = useState('');
  const [newChoreTitle, setNewChoreTitle] = useState('');
  const [newChoreCategory, setNewChoreCategory] = useState<HouseholdChore['category']>('laundry');
  const [newChoreReminderTime, setNewChoreReminderTime] = useState('');

  // Persist trackers
  useEffect(() => {
    localStorage.setItem('doudous_v3_last_feeding', JSON.stringify(feedingsByChild));
  }, [feedingsByChild]);

  useEffect(() => {
    localStorage.setItem(`doudous_v3_vitd_${todayStr}`, JSON.stringify(vitaminDChecks));
  }, [vitaminDChecks, todayStr]);

  useEffect(() => {
    localStorage.setItem(
      'doudous_v3_diversification_by_child',
      JSON.stringify(diversificationByChild)
    );
  }, [diversificationByChild]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_health_by_child', JSON.stringify(healthByChild));
  }, [healthByChild]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_med_doses', JSON.stringify(lastMedDoses));
  }, [lastMedDoses]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_bag_by_child', JSON.stringify(bagChecksByChild));
  }, [bagChecksByChild]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_homeworks_by_child', JSON.stringify(homeworksByChild));
  }, [homeworksByChild]);

  useEffect(() => {
    localStorage.setItem('doudous_v3_schedule_by_child', JSON.stringify(scheduleByChild));
  }, [scheduleByChild]);

  // If the currently active child tab was deleted from Foyer, fall back to 'appliances'
  useEffect(() => {
    if (activeSubTab.startsWith('child_')) {
      const childId = activeSubTab.replace('child_', '');
      const stillExists = detectedChildren.some((c) => c.member.id === childId);
      if (!stillExists) {
        setActiveSubTab('appliances');
      }
    }
  }, [detectedChildren, activeSubTab]);

  // Only show sterilizer appliance if there is a baby (< 18 months) in the household
  const hasInfantInHousehold = detectedChildren.some((c) => c.totalMonths < 18);
  const visibleAppliances = appliances.filter(
    (app) => app.type !== 'sterilizer' || hasInfantInHousehold
  );

  const APPLIANCE_PROGRAMS: Record<ApplianceTask['type'], Array<{ label: string; min: number }>> = {
    washing_machine: [
      { label: hasInfantInHousehold ? 'Layette Bébé 40°C' : 'Coton 40°C', min: 60 },
      { label: 'Couleurs & Quotidien 30°C', min: 45 },
      { label: 'Draps & Serviettes 60°C', min: 90 },
      { label: 'Express 15 min', min: 15 },
    ],
    dishwasher: [
      { label: 'Éco 50°C', min: 90 },
      { label: 'Intensif 65°C', min: 110 },
      { label: 'Rapide 45 min', min: 45 },
    ],
    sterilizer: [
      { label: 'Vapeur Express 10 min', min: 10 },
      { label: 'Stérilisation + Séchage', min: 30 },
    ],
    dryer: [
      { label: 'Cycle Doux', min: 45 },
      { label: 'Coton Prêt à ranger', min: 60 },
    ],
    robot_cooker: [
      { label: 'Cuisson Vapeur 15 min', min: 15 },
      { label: 'Mijotage 35 min', min: 35 },
    ],
  };

  const activeMilkBatches = breastMilkBatches
    .filter((b) => !b.used)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  const getHoursRemaining = (expiresIso: string): number => {
    const diffMs = new Date(expiresIso).getTime() - Date.now();
    return Math.round(diffMs / (1000 * 3600));
  };

  const formatExpiryCountdown = (
    expiresIso: string,
    location: BreastMilkBatch['storageLocation']
  ) => {
    const hours = getHoursRemaining(expiresIso);
    if (hours <= 0) return { label: 'Dépassé', urgent: true };
    if (location === 'ambient') {
      return { label: `Reste ${hours}h (Max 4h)`, urgent: hours <= 2 };
    }
    if (location === 'fridge') {
      return {
        label: hours < 24 ? `Reste ${hours}h` : `Reste ${Math.ceil(hours / 24)}j`,
        urgent: hours <= 24,
      };
    }
    const days = Math.ceil(hours / 24);
    return { label: `Reste ${days}j`, urgent: false };
  };

  const formatFeedingTimeAgo = (isoStr: string): string => {
    const diffMin = Math.max(0, Math.round((Date.now() - new Date(isoStr).getTime()) / 60000));
    const timeStr = new Date(isoStr).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (diffMin < 60) {
      return `à ${timeStr} (il y a ${diffMin} min)`;
    }
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `à ${timeStr} (il y a ${h}h${m > 0 ? String(m).padStart(2, '0') : ''})`;
  };

  const handleLogFeedingForChild = (
    child: DetectedChildProfile,
    type: LastFeedingLog['type']
  ) => {
    const nowIso = new Date().toISOString();
    const entry: LastFeedingLog = {
      timestampIso: nowIso,
      type,
      volumeMl: type === 'bottle' ? bottleMlInput : undefined,
      loggedBy: selectedParent,
    };
    setFeedingsByChild((prev) => ({ ...prev, [child.member.id]: entry }));

    const label =
      type === 'left_breast'
        ? '🤱 Tétée Sein Gauche'
        : type === 'right_breast'
        ? '🤱 Tétée Sein Droit'
        : `🍼 Biberon ${bottleMlInput} ml`;

    onSendNotification(
      `${label} (${child.member.name}) noté par ${selectedParent}`,
      type === 'left_breast'
        ? 'Prochaine tétée : Sein Droit conseillé.'
        : type === 'right_breast'
        ? 'Prochaine tétée : Sein Gauche conseillé.'
        : `Biberon de ${bottleMlInput} ml pris.`,
      selectedParent,
      'breast_milk'
    );
  };

  const handleCreateMilkBatch = (e: React.FormEvent, babyName: string) => {
    e.preventDefault();
    const now = new Date();
    const expires = new Date(now);
    if (milkStorage === 'ambient') {
      expires.setHours(expires.getHours() + 4);
    } else if (milkStorage === 'fridge') {
      expires.setHours(expires.getHours() + 48);
    } else {
      expires.setMonth(expires.getMonth() + 4);
    }

    onAddBreastMilk({
      expressedAt: now.toISOString(),
      volumeMl: milkVolume,
      storageLocation: milkStorage,
      expiresAt: expires.toISOString(),
      babyName,
      notes: milkNotes.trim() || undefined,
      used: false,
    });

    setMilkNotes('');
    setIsAddingMilk(false);
  };

  const getChildHealth = (child: DetectedChildProfile): ChildHealthRecord => {
    const existing = healthByChild[child.member.id];
    if (existing) return existing;
    const defaultWeight =
      child.category === 'baby'
        ? '6.0'
        : child.category === 'toddler'
        ? '10.5'
        : String(Math.min(45, Math.max(14, Math.round((child.totalMonths / 12) * 3.2 + 8))));
    const defaultHeight =
      child.category === 'baby'
        ? '61'
        : child.category === 'toddler'
        ? '80'
        : String(Math.min(165, Math.round((child.totalMonths / 12) * 6 + 75)));
    return {
      weightKg: defaultWeight,
      heightCm: defaultHeight,
      shoeSize: child.category === 'school_child' ? '31' : child.category === 'toddler' ? '21' : '17',
      nextVaccineOrDoctor: '',
    };
  };

  const updateChildHealth = (
    child: DetectedChildProfile,
    updates: Partial<ChildHealthRecord>
  ) => {
    const current = getChildHealth(child);
    setHealthByChild((prev) => ({
      ...prev,
      [child.member.id]: { ...current, ...updates },
    }));
  };

  const handleCycleChildFoodReaction = (childId: string, foodId: string) => {
    const order: FoodReaction[] = ['untested', 'loved', 'neutral', 'allergy'];
    setDiversificationByChild((prev) => {
      const childMap = prev[childId] || {};
      const current = childMap[foodId] || 'untested';
      const next = order[(order.indexOf(current) + 1) % order.length];
      return {
        ...prev,
        [childId]: {
          ...childMap,
          [foodId]: next,
        },
      };
    });
  };

  const handleAddHomework = (e: React.FormEvent, child: DetectedChildProfile) => {
    e.preventDefault();
    if (!hwTask.trim()) return;
    const newItem: HomeworkItem = {
      id: `hw-${Date.now()}`,
      subject: hwSubject,
      task: hwTask.trim(),
      dueDay: hwDueDay,
      done: false,
    };
    setHomeworksByChild((prev) => ({
      ...prev,
      [child.member.id]: [newItem, ...(prev[child.member.id] || [])],
    }));
    setHwTask('');
  };

  const handleToggleHomework = (child: DetectedChildProfile, hwId: string) => {
    setHomeworksByChild((prev) => {
      const list = prev[child.member.id] || [];
      const updated = list.map((h) => (h.id === hwId ? { ...h, done: !h.done } : h));
      const toggled = updated.find((h) => h.id === hwId);
      if (toggled && toggled.done) {
        onSendNotification(
          `📚 Devoir terminé par ${child.member.name} : ${toggled.subject}`,
          toggled.task,
          selectedParent,
          'chore'
        );
      }
      return { ...prev, [child.member.id]: updated };
    });
  };

  const handleDeleteHomework = (childId: string, hwId: string) => {
    setHomeworksByChild((prev) => ({
      ...prev,
      [childId]: (prev[childId] || []).filter((h) => h.id !== hwId),
    }));
  };

  const getSchoolDaySchedule = (childId: string, day: string): SchoolDaySchedule => {
    return (
      scheduleByChild[childId]?.[day] || {
        canteen: day !== 'Mercredi' && day !== 'Samedi',
        afterSchoolCare: false,
        activity: '',
      }
    );
  };

  const updateSchoolDaySchedule = (
    childId: string,
    day: string,
    updates: Partial<SchoolDaySchedule>
  ) => {
    const current = getSchoolDaySchedule(childId, day);
    setScheduleByChild((prev) => ({
      ...prev,
      [childId]: {
        ...(prev[childId] || {}),
        [day]: { ...current, ...updates },
      },
    }));
  };

  const handleSendQuickPing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPingText.trim()) return;
    onSendNotification(
      `💬 Message de ${selectedParent} : "${quickPingText.trim()}"`,
      'Rappel partagé en direct sur les téléphones du foyer',
      selectedParent,
      'chore'
    );
    setQuickPingText('');
  };

  const handleCreateChore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChoreTitle.trim()) return;
    onAddChore({
      title: newChoreTitle.trim(),
      category: newChoreCategory,
      frequency: 'Quotidien',
      assignedTo: selectedParent,
      completedToday: false,
      reminderTime: newChoreReminderTime || undefined,
    });
    setNewChoreTitle('');
    setNewChoreReminderTime('');
  };

  const getApplianceEmoji = (type: ApplianceTask['type']) => {
    switch (type) {
      case 'washing_machine':
        return '🧺';
      case 'dishwasher':
        return '🍽️';
      case 'sterilizer':
        return '🍼';
      case 'dryer':
        return '💨';
      case 'robot_cooker':
        return '🍲';
    }
  };

  const unacknowledgedNotifications = notifications.filter((n) => !n.acknowledged);
  const runningOrWaitingAppliances = visibleAppliances.filter((a) => a.status !== 'idle').length;
  const remainingChores = chores.filter((c) => !c.completedToday).length;

  // Determine currently selected child if activeSubTab === `child_${id}`
  const activeChildProfile = activeSubTab.startsWith('child_')
    ? detectedChildren.find((c) => `child_${c.member.id}` === activeSubTab) || null
    : null;

  return (
    <div className="space-y-4">
      {/* Compact Top Bar: Active Parent + Dynamic Sub-Tabs per Child */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Sub-Tabs Navigation: Tâches & Rappels + Machines + 1 Tab per Detected Child */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('chores')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'chores'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>✅ Tâches & Rappels</span>
            {remainingChores > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black">
                {remainingChores}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('appliances')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'appliances'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🧺 Machines</span>
            {runningOrWaitingAppliances > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                {runningOrWaitingAppliances}
              </span>
            )}
          </button>

          {/* Dynamic Sub-Tab for EACH Child configured in Foyer */}
          {detectedChildren.map((child) => {
            const tabKey = `child_${child.member.id}`;
            const isActive = activeSubTab === tabKey;
            const pendingHwCount =
              child.category === 'school_child'
                ? (homeworksByChild[child.member.id] || []).filter((h) => !h.done).length
                : 0;

            return (
              <button
                key={tabKey}
                type="button"
                onClick={() => {
                  setActiveSubTab(tabKey);
                  if (child.category === 'baby') {
                    setBabySubView('feeding');
                  } else if (child.category === 'toddler') {
                    setBabySubView('health');
                  } else {
                    setSchoolSubView('homework');
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-white/70 hover:text-slate-900'
                }`}
              >
                <span>{child.icon}</span>
                <span>{child.member.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    isActive
                      ? 'bg-emerald-800 text-emerald-100'
                      : 'bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {child.ageLabel}
                </span>
                {pendingHwCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                    {pendingHwCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active Parent Selector */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <span className="text-[11px] font-semibold text-slate-400">Parent actif :</span>
          {parentOptions.map((parent) => (
            <button
              key={parent}
              type="button"
              onClick={() => setSelectedParent(parent)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedParent === parent
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {parent}
            </button>
          ))}
        </div>
      </div>

      {/* Active Alerts Banner (if any unacknowledged) */}
      {unacknowledgedNotifications.length > 0 && (
        <div className="space-y-2">
          {unacknowledgedNotifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                notif.type === 'vaccine'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <BellRing
                  className={`w-4 h-4 shrink-0 ${
                    notif.type === 'vaccine' ? 'text-indigo-600' : 'text-amber-600'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{notif.title}</p>
                  <p
                    className={`text-[11px] truncate ${
                      notif.type === 'vaccine' ? 'text-indigo-800' : 'text-amber-800'
                    }`}
                  >
                    {notif.message}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onDismissNotification(notif.id)}
                className={`px-3 py-1 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer ${
                  notif.type === 'vaccine' ? 'bg-indigo-900' : 'bg-amber-900'
                }`}
              >
                OK
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Automatic Upcoming Vaccine Reminders Banner (shown in Tâches & Rappels) */}
      {activeSubTab === 'chores' && (() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const upcomingVaccines: Array<{
          child: DetectedChildProfile;
          vaccineId: string;
          vaccineName: string;
          dueDate: string;
          daysUntil: number;
          notes?: string;
        }> = [];

        detectedChildren.forEach((child) => {
          (child.member.vaccines || []).forEach((v) => {
            if (v.completed) return;
            const due = new Date(v.dueDate);
            due.setHours(0, 0, 0, 0);
            const daysUntil = Math.round((due.getTime() - today.getTime()) / (1000 * 3600 * 24));
            if (daysUntil <= 30) {
              upcomingVaccines.push({
                child,
                vaccineId: v.id,
                vaccineName: v.vaccineName,
                dueDate: v.dueDate,
                daysUntil,
                notes: v.notes,
              });
            }
          });
        });

        upcomingVaccines.sort((a, b) => a.daysUntil - b.daysUntil);

        if (upcomingVaccines.length === 0) return null;

        return (
          <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">💉</span>
                <h4 className="text-xs font-extrabold text-indigo-950">
                  Échéances vaccinales à venir ({upcomingVaccines.length})
                </h4>
              </div>
              {onNavigateToFamily && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigateToFamily();
                    setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent('doudous-foyer-tab', { detail: 'vaccines' })
                      );
                    }, 50);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  Carnet Vaccinal →
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {upcomingVaccines.map((item) => {
                const isOverdue = item.daysUntil < 0;
                const formatted = new Date(item.dueDate).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                });
                return (
                  <div
                    key={item.vaccineId}
                    className={`p-3 rounded-xl border bg-white flex items-center justify-between gap-2.5 ${
                      isOverdue
                        ? 'border-rose-300'
                        : item.daysUntil <= 7
                        ? 'border-amber-300'
                        : 'border-indigo-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-slate-900">
                          {item.child.icon} {item.child.member.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                            isOverdue
                              ? 'bg-rose-600 text-white'
                              : item.daysUntil === 0
                              ? 'bg-amber-500 text-slate-950'
                              : item.daysUntil <= 7
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {isOverdue
                            ? `En retard (${Math.abs(item.daysUntil)}j)`
                            : item.daysUntil === 0
                            ? "Aujourd'hui !"
                            : `J-${item.daysUntil} (${formatted})`}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-700 truncate mt-0.5">
                        {item.vaccineName}
                      </p>
                      {item.notes && (
                        <p className="text-[10px] text-slate-500 truncate">{item.notes}</p>
                      )}
                    </div>

                    {onToggleVaccineCompleted && (
                      <button
                        type="button"
                        onClick={() =>
                          onToggleVaccineCompleted(item.child.member.id, item.vaccineId)
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                        title="Marquer ce vaccin comme effectué"
                      >
                        ✓ Fait
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* SUB-TAB 1: MACHINES & ÉLECTROMÉNAGER */}
      {activeSubTab === 'appliances' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleAppliances.map((app) => {
              const programs = APPLIANCE_PROGRAMS[app.type] || [{ label: 'Standard', min: 60 }];
              const isRunning = app.status === 'running';
              const isWaiting = app.status === 'completed_waiting_action';

              return (
                <div
                  key={app.id}
                  className={`p-4 rounded-2xl border bg-white flex flex-col justify-between gap-3 ${
                    isWaiting
                      ? 'border-amber-400 bg-amber-50/30'
                      : isRunning
                      ? 'border-emerald-400 bg-emerald-50/20'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{getApplianceEmoji(app.type)}</span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{app.name}</h4>
                        <p className="text-xs text-slate-500">
                          {app.status === 'idle' && 'Prêt à démarrer'}
                          {isRunning && `En cours · ${app.program} (par ${app.startedBy})`}
                          {isWaiting && app.actionReminderText}
                        </p>
                      </div>
                    </div>

                    {isRunning && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3 animate-spin" />
                        {app.remainingMinutes} min
                      </span>
                    )}

                    {isWaiting && (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 text-xs font-extrabold shrink-0">
                        Terminé !
                      </span>
                    )}
                  </div>

                  {app.status === 'idle' && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {programs.map((prog, idx) => (
                        <button
                          key={idx}
                          onClick={() =>
                            onStartAppliance(app.id, prog.label, prog.min, selectedParent)
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          <span>
                            {prog.label} ({prog.min}m)
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {isRunning && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-500">
                        Alerte automatique en fin de cycle
                      </span>
                      <button
                        onClick={() => onFinishApplianceNow(app.id)}
                        className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Terminer maintenant
                      </button>
                    </div>
                  )}

                  {isWaiting && (
                    <button
                      onClick={() => onAcknowledgeAppliance(app.id, selectedParent)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>C'est fait (Étendu / Vidé par {selectedParent})</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Discreet helper if no children are configured yet */}
          {detectedChildren.length === 0 && onNavigateToFamily && (
            <div className="bg-white p-3.5 rounded-2xl border border-dashed border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-slate-600">
                  Ajoutez vos enfants dans <span className="font-bold text-slate-900">Foyer</span> pour débloquer leur suivi dédié.
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateToFamily}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
              >
                Configurer →
              </button>
            </div>
          )}
        </div>
      )}

      {/* DYNAMIC CHILD SUB-TAB: ADAPTED TO BABY (<12m), TODDLER (12-35m), OR SCHOOL CHILD (3y+) */}
      {activeChildProfile && (
        <div className="space-y-4">
          {/* Child Profile Header Banner */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl ${
                  activeChildProfile.member.avatarColor || 'bg-emerald-600'
                } text-white flex items-center justify-center font-black text-base shrink-0`}
              >
                {activeChildProfile.icon}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">
                    Suivi de {activeChildProfile.member.name}
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                    {activeChildProfile.ageLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
                    {activeChildProfile.category === 'baby'
                      ? '🍼 Profil Nourrisson / Bébé'
                      : activeChildProfile.category === 'toddler'
                      ? '🧸 Profil Bambin (1–3 ans)'
                      : '🎓 Profil Enfant & École'}
                  </span>
                </div>
                {activeChildProfile.member.allergies.length > 0 && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-0.5">
                    ⚠️ Allergies / Vigilances : {activeChildProfile.member.allergies.join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* Sub-navigation adapted to the child's age category */}
            {activeChildProfile.category === 'school_child' ? (
              <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSchoolSubView('homework')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    schoolSubView === 'homework'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📚 Devoirs & Leçons
                </button>
                <button
                  type="button"
                  onClick={() => setSchoolSubView('bag_schedule')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    schoolSubView === 'bag_schedule'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🎒 Cartable & Planning
                </button>
                <button
                  type="button"
                  onClick={() => setSchoolSubView('health')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    schoolSubView === 'health'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🩺 Santé & Posologie
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
                {activeChildProfile.category === 'baby' && (
                  <button
                    type="button"
                    onClick={() => setBabySubView('feeding')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      babySubView === 'feeding'
                        ? 'bg-pink-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🍼 Tétées & Lait
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBabySubView('health')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    babySubView === 'health'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🩺 Santé & Posologie
                </button>
                <button
                  type="button"
                  onClick={() => setBabySubView('bag')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    babySubView === 'bag'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🎒 Sac & Crèche
                </button>
                <button
                  type="button"
                  onClick={() => setBabySubView('diversification')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    babySubView === 'diversification'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🥕 Diversification
                </button>
              </div>
            )}
          </div>

          {/* ===================================================================== */}
          {/* CASE 1: SCHOOL-AGED CHILD (3 YEARS+) -> HOMEWORK, CARTABLE & HEALTH   */}
          {/* ===================================================================== */}
          {activeChildProfile.category === 'school_child' && (
            <>
              {/* SCHOOL VIEW 1: DEVOIRS & LEÇONS */}
              {schoolSubView === 'homework' && (
                <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-emerald-600" />
                        <span>Cahier de Devoirs & Leçons de {activeChildProfile.member.name}</span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Notez les devoirs, lectures, poésies ou mots à signer. Cochez dès que c'est fait !
                      </p>
                    </div>
                  </div>

                  {/* Add Homework Form */}
                  <form
                    onSubmit={(e) => handleAddHomework(e, activeChildProfile)}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2"
                  >
                    <select
                      value={hwSubject}
                      onChange={(e) => setHwSubject(e.target.value)}
                      className="sm:col-span-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                    >
                      {HOMEWORK_SUBJECTS.map((subj) => (
                        <option key={subj} value={subj}>
                          {subj}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      required
                      value={hwTask}
                      onChange={(e) => setHwTask(e.target.value)}
                      placeholder={`Ex: Lire p.14, apprendre la poésie, signer le cahier...`}
                      className="sm:col-span-5 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />

                    <select
                      value={hwDueDay}
                      onChange={(e) => setHwDueDay(e.target.value)}
                      className="sm:col-span-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700"
                    >
                      <option value="Pour demain">Pour demain</option>
                      <option value="Pour Lundi">Pour Lundi</option>
                      <option value="Pour Mardi">Pour Mardi</option>
                      <option value="Pour Jeudi">Pour Jeudi</option>
                      <option value="Pour Vendredi">Pour Vendredi</option>
                      <option value="Semaine prochaine">Semaine proch.</option>
                    </select>

                    <button
                      type="submit"
                      className="sm:col-span-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Ajouter</span>
                    </button>
                  </form>

                  {/* Homework List */}
                  {(homeworksByChild[activeChildProfile.member.id] || []).length === 0 ? (
                    <div className="text-center py-8 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                      <BookOpen className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-700">
                        Aucun devoir en attente pour {activeChildProfile.member.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Ajoutez les leçons de la semaine ci-dessus pour suivre leur avancement entre parents.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(homeworksByChild[activeChildProfile.member.id] || []).map((hw) => (
                        <div
                          key={hw.id}
                          onClick={() => handleToggleHomework(activeChildProfile, hw.id)}
                          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                            hw.done
                              ? 'bg-emerald-50/40 border-emerald-200 text-slate-400'
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                                hw.done
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {hw.done && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                                  {hw.subject}
                                </span>
                                <span className="text-[11px] font-bold text-emerald-700">
                                  📅 {hw.dueDay}
                                </span>
                              </div>
                              <p
                                className={`text-xs font-bold mt-1 ${
                                  hw.done ? 'line-through text-slate-400' : 'text-slate-900'
                                }`}
                              >
                                {hw.task}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteHomework(activeChildProfile.member.id, hw.id);
                            }}
                            className="p-1.5 text-slate-300 hover:text-rose-600 cursor-pointer"
                            title="Supprimer ce devoir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SCHOOL VIEW 2: CARTABLE DU SOIR & SEMAINIER CANTINE / ACTIVITÉS */}
              {schoolSubView === 'bag_schedule' && (
                <div className="space-y-4">
                  {/* Cartable Checklist */}
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          🎒 Check-list du Soir : Cartable de {activeChildProfile.member.name}
                        </h4>
                        <p className="text-xs text-slate-500">
                          À vérifier ensemble la veille au soir pour éviter la course du matin.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setBagChecksByChild((prev) => ({
                            ...prev,
                            [activeChildProfile.member.id]: {},
                          }))
                        }
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Réinitialiser</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {BAG_CHECKLISTS_BY_STAGE.school_child.map((item) => {
                        const checked =
                          !!bagChecksByChild[activeChildProfile.member.id]?.[item.id];
                        return (
                          <div
                            key={item.id}
                            onClick={() =>
                              setBagChecksByChild((prev) => ({
                                ...prev,
                                [activeChildProfile.member.id]: {
                                  ...(prev[activeChildProfile.member.id] || {}),
                                  [item.id]: !checked,
                                },
                              }))
                            }
                            className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer ${
                              checked
                                ? 'bg-emerald-50/50 border-emerald-200 text-slate-400'
                                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900'
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                                checked
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {checked && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <span className={`text-xs font-bold ${checked ? 'line-through' : ''}`}>
                              {item.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Weekly Canteen, Garderie & Extracurricular Schedule */}
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-emerald-600" />
                        <span>
                          Semainier Cantine, Garderie & Activités ({activeChildProfile.member.name})
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Repère rapide des jours de cantine, périscolaire et sport/musique de la semaine.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {SCHOOL_DAYS.map((day) => {
                        const sched = getSchoolDaySchedule(activeChildProfile.member.id, day);
                        return (
                          <div
                            key={day}
                            className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-slate-900">{day}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSchoolDaySchedule(activeChildProfile.member.id, day, {
                                      canteen: !sched.canteen,
                                    })
                                  }
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                                    sched.canteen
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-white border border-slate-200 text-slate-500'
                                  }`}
                                >
                                  🍽️ Cantine
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSchoolDaySchedule(activeChildProfile.member.id, day, {
                                      afterSchoolCare: !sched.afterSchoolCare,
                                    })
                                  }
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                                    sched.afterSchoolCare
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white border border-slate-200 text-slate-500'
                                  }`}
                                >
                                  🏫 Garderie
                                </button>
                              </div>
                            </div>
                            <input
                              type="text"
                              value={sched.activity}
                              onChange={(e) =>
                                updateSchoolDaySchedule(activeChildProfile.member.id, day, {
                                  activity: e.target.value,
                                })
                              }
                              placeholder="Activité / Sport (ex: Judo 17h, Piscine...)"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===================================================================== */}
          {/* CASE 2: BABY (< 12M) FEEDING & BREAST MILK                            */}
          {/* ===================================================================== */}
          {activeChildProfile.category === 'baby' && babySubView === 'feeding' && (
            <div className="space-y-4">
              {/* Quick Last Feeding / Breast Side Tracker for this Baby */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-pink-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      Dernière Tétée / Biberon de {activeChildProfile.member.name}
                    </h4>
                  </div>
                  {(() => {
                    const lastFeed =
                      feedingsByChild[activeChildProfile.member.id] || feedingsByChild.default;
                    if (!lastFeed) {
                      return (
                        <p className="text-xs text-slate-500 mt-1">
                          Touchez un bouton ci-dessous pour noter l'heure et le côté de la dernière tétée ou du dernier biberon.
                        </p>
                      );
                    }
                    return (
                      <p className="text-xs text-slate-700 mt-1">
                        Dernière prise :{' '}
                        <strong className="text-pink-700">
                          {lastFeed.type === 'left_breast'
                            ? '🤱 Sein Gauche'
                            : lastFeed.type === 'right_breast'
                            ? '🤱 Sein Droit'
                            : `🍼 Biberon (${lastFeed.volumeMl || 120} ml)`}
                        </strong>{' '}
                        · {formatFeedingTimeAgo(lastFeed.timestampIso)} par {lastFeed.loggedBy}
                        {lastFeed.type === 'left_breast' && (
                          <span className="ml-2 inline-block px-2 py-0.5 rounded-md bg-pink-50 text-pink-800 font-bold text-[11px]">
                            Prochaine : Sein Droit conseillé
                          </span>
                        )}
                        {lastFeed.type === 'right_breast' && (
                          <span className="ml-2 inline-block px-2 py-0.5 rounded-md bg-pink-50 text-pink-800 font-bold text-[11px]">
                            Prochaine : Sein Gauche conseillé
                          </span>
                        )}
                      </p>
                    );
                  })()}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleLogFeedingForChild(activeChildProfile, 'left_breast')}
                    className="px-3 py-2 rounded-xl text-xs font-bold border bg-pink-50 hover:bg-pink-100 text-pink-900 border-pink-200 cursor-pointer"
                  >
                    🤱 Sein Gauche
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLogFeedingForChild(activeChildProfile, 'right_breast')}
                    className="px-3 py-2 rounded-xl text-xs font-bold border bg-pink-50 hover:bg-pink-100 text-pink-900 border-pink-200 cursor-pointer"
                  >
                    🤱 Sein Droit
                  </button>
                  <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                    <input
                      type="number"
                      step={10}
                      min={30}
                      max={330}
                      value={bottleMlInput}
                      onChange={(e) => setBottleMlInput(Number(e.target.value) || 120)}
                      className="w-14 px-1.5 py-1.5 text-center text-xs font-bold bg-transparent focus:outline-none"
                      title="Volume du biberon en ml"
                    />
                    <button
                      type="button"
                      onClick={() => handleLogFeedingForChild(activeChildProfile, 'bottle')}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer"
                    >
                      🍼 Biberon (ml)
                    </button>
                  </div>
                </div>
              </div>

              {/* Breast Milk Stock */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Baby className="w-4 h-4 text-pink-600" />
                      <span>Stock de Lait Maternel ({activeChildProfile.member.name})</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ambiant : 4h max · Frigo (+4°C) : 48h max · Congélateur (-18°C) : 4 mois max
                    </p>
                  </div>

                  <button
                    onClick={() => setIsAddingMilk(true)}
                    className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Noter un tirage</span>
                  </button>
                </div>

                {activeMilkBatches.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 space-y-1">
                    <p className="text-xs font-semibold text-slate-700">
                      Aucun biberon ou sachet de lait maternel en stock
                    </p>
                    <p className="text-[11px]">
                      Enregistrez vos tirages pour suivre leur durée de conservation.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeMilkBatches.map((batch, index) => {
                      const status = formatExpiryCountdown(batch.expiresAt, batch.storageLocation);
                      const isFirstFifo = index === 0;

                      return (
                        <div
                          key={batch.id}
                          className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
                            isFirstFifo
                              ? 'bg-pink-50/40 border-pink-300'
                              : 'bg-slate-50/50 border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-slate-900">
                                  🍼 {batch.volumeMl} ml
                                </span>
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                                  {batch.storageLocation === 'ambient'
                                    ? '🌡️ Ambiant'
                                    : batch.storageLocation === 'fridge'
                                    ? '❄️ Frigo'
                                    : '🧊 Congél'}
                                </span>
                                {isFirstFifo && (
                                  <span className="text-[10px] font-bold bg-pink-600 text-white px-2 py-0.5 rounded-md">
                                    À donner en 1er
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-xs font-bold ${
                                  status.urgent ? 'text-rose-600' : 'text-slate-600'
                                }`}
                              >
                                {status.label}
                              </span>
                            </div>
                            {batch.notes && (
                              <p className="text-xs text-slate-600 mt-1">{batch.notes}</p>
                            )}
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                            {batch.storageLocation === 'freezer' && (
                              <button
                                onClick={() => onMoveBreastMilkToFridge(batch.id)}
                                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                              >
                                ❄️ Décongeler au frigo
                              </button>
                            )}
                            <button
                              onClick={() => onUseBreastMilk(batch.id)}
                              className="px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Utilisé</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* SHARED HEALTH & WEIGHT-BASED PARACETAMOL FOR THIS SPECIFIC CHILD      */}
          {/* ===================================================================== */}
          {((activeChildProfile.category !== 'school_child' && babySubView === 'health') ||
            (activeChildProfile.category === 'school_child' && schoolSubView === 'health')) && (
            <div className="space-y-4">
              {(() => {
                const record = getChildHealth(activeChildProfile);
                const isVitDDone = !!vitaminDChecks[activeChildProfile.member.id];
                const parsedWeight = parseFloat(
                  (record.weightKg || '').replace(',', '.').replace(/[^0-9.]/g, '')
                );
                const weightNum = !isNaN(parsedWeight) && parsedWeight > 2 ? parsedWeight : 10;
                const mgPerDose = Math.round(weightNum * 15);
                const lastDoseIso = lastMedDoses[activeChildProfile.member.id];

                let canGiveNow = true;
                let nextAllowedTimeStr = '';
                if (lastDoseIso) {
                  const hoursSince =
                    (Date.now() - new Date(lastDoseIso).getTime()) / (1000 * 3600);
                  canGiveNow = hoursSince >= 6;
                  const nextDate = new Date(new Date(lastDoseIso).getTime() + 6 * 3600 * 1000);
                  nextAllowedTimeStr = nextDate.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                }

                return (
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Stethoscope className="w-4 h-4 text-emerald-600" />
                          <span>
                            Santé, Croissance & Posologie de {activeChildProfile.member.name}
                          </span>
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Suivi personnalisé (Poids, Taille, Pointure, RDV Médecin & Pipette Paracétamol).
                        </p>
                      </div>

                      {activeChildProfile.totalMonths < 60 && (
                        <button
                          type="button"
                          onClick={() =>
                            setVitaminDChecks((prev) => ({
                              ...prev,
                              [activeChildProfile.member.id]: !isVitDDone,
                            }))
                          }
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                            isVitDDone
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          <span>{isVitDDone ? '✓' : '☀️'}</span>
                          <span>
                            Vitamine D du jour · {isVitDDone ? 'Donnée' : 'À donner'}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Growth Inputs for this Child */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                          Dernier poids (kg)
                        </label>
                        <input
                          type="text"
                          value={record.weightKg}
                          onChange={(e) =>
                            updateChildHealth(activeChildProfile, { weightKg: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                          Dernière taille (cm)
                        </label>
                        <input
                          type="text"
                          value={record.heightCm}
                          onChange={(e) =>
                            updateChildHealth(activeChildProfile, { heightCm: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                          Pointure / Taille vêtements
                        </label>
                        <input
                          type="text"
                          value={record.shoeSize}
                          placeholder="ex: Pointure 22 / 24m"
                          onChange={(e) =>
                            updateChildHealth(activeChildProfile, { shoeSize: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                          Prochain RDV Médecin / Vaccin
                        </label>
                        <input
                          type="text"
                          value={record.nextVaccineOrDoctor}
                          placeholder="ex: Pédiatre le 15/11..."
                          onChange={(e) =>
                            updateChildHealth(activeChildProfile, {
                              nextVaccineOrDoctor: e.target.value,
                            })
                          }
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    {/* Weight-Based Paracetamol Dosage & 6h Safety Interval for THIS Child */}
                    <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/30 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h5 className="text-xs font-bold text-slate-900">
                            💊 Repère Posologie Paracétamol ({activeChildProfile.member.name} ·{' '}
                            {weightNum} kg)
                          </h5>
                          <p className="text-[11px] text-slate-600">
                            15 mg/kg/prise toutes les 6h minimum (max 4 prises / 24h).
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-3 py-1 rounded-xl bg-rose-600 text-white text-xs font-black">
                            {weightNum <= 26
                              ? `Pipette : graduation ${weightNum} kg`
                              : `Dose : ${mgPerDose} mg / prise`}
                          </span>
                          <p className="text-[10px] text-rose-800 font-semibold mt-0.5">
                            Soit ≈ {mgPerDose} mg par prise
                          </p>
                        </div>
                      </div>

                      {lastDoseIso && (
                        <div
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                            canGiveNow
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-amber-50 border-amber-300 text-amber-950'
                          }`}
                        >
                          <div>
                            <p className="font-bold">
                              Dernière prise notée à{' '}
                              {new Date(lastDoseIso).toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                            <p className="text-[11px]">
                              {canGiveNow
                                ? '✓ Délai de 6h respecté'
                                : `⏳ Prochaine prise autorisée à partir de ${nextAllowedTimeStr}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setLastMedDoses((prev) => {
                                const copy = { ...prev };
                                delete copy[activeChildProfile.member.id];
                                return copy;
                              })
                            }
                            className="text-[11px] underline text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            Effacer
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const nowIso = new Date().toISOString();
                          setLastMedDoses((prev) => ({
                            ...prev,
                            [activeChildProfile.member.id]: nowIso,
                          }));
                          onSendNotification(
                            `💊 Prise notée pour ${activeChildProfile.member.name} (${weightNum} kg) par ${selectedParent}`,
                            'Sécurité : attendre au moins 6h avant la prochaine prise.',
                            selectedParent,
                            'breast_milk'
                          );
                        }}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5 text-rose-400" />
                        <span>Noter une prise maintenant (+ notifier conjoint)</span>
                      </button>
                    </div>

                    {/* Child's Scheduled Vaccines from Foyer */}
                    <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/30 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h5 className="text-xs font-bold text-slate-900">
                            💉 Carnet Vaccinal de {activeChildProfile.member.name} (
                            {(activeChildProfile.member.vaccines || []).length} enregistré
                            {(activeChildProfile.member.vaccines || []).length > 1 ? 's' : ''})
                          </h5>
                          <p className="text-[11px] text-slate-600">
                            Échéances synchronisées avec le module Suivi Vaccinal de l’onglet Foyer.
                          </p>
                        </div>
                        {onNavigateToFamily && (
                          <button
                            type="button"
                            onClick={onNavigateToFamily}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                          >
                            + Gérer dans Foyer
                          </button>
                        )}
                      </div>

                      {(activeChildProfile.member.vaccines || []).length === 0 ? (
                        <p className="text-xs text-slate-500 italic">
                          Aucun rappel vaccinal programmé pour {activeChildProfile.member.name}. Rendez-vous dans l’onglet Foyer pour ajouter ou pré-remplir ses prochaines échéances.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(activeChildProfile.member.vaccines || []).map((v) => (
                            <div
                              key={v.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                                v.completed
                                  ? 'bg-emerald-50/60 border-emerald-200 text-slate-500'
                                  : 'bg-white border-indigo-200 text-slate-900'
                              }`}
                            >
                              <div className="min-w-0">
                                <p
                                  className={`text-xs font-bold truncate ${
                                    v.completed ? 'line-through' : ''
                                  }`}
                                >
                                  {v.vaccineName}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  Échéance :{' '}
                                  {new Date(v.dueDate).toLocaleDateString('fr-FR', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </p>
                              </div>
                              {onToggleVaccineCompleted && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onToggleVaccineCompleted(activeChildProfile.member.id, v.id)
                                  }
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer ${
                                    v.completed
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-indigo-600 text-white'
                                  }`}
                                >
                                  {v.completed ? '✓ Fait' : 'Marquer fait'}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ===================================================================== */}
          {/* BABY / TODDLER BAG CHECKLIST FOR THIS SPECIFIC CHILD                  */}
          {/* ===================================================================== */}
          {activeChildProfile.category !== 'school_child' && babySubView === 'bag' && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    🎒 Check-list Sac de Sortie & Crèche de {activeChildProfile.member.name} (
                    {activeChildProfile.ageLabel})
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Liste adaptée automatiquement à l'âge de {activeChildProfile.member.name}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setBagChecksByChild((prev) => ({
                      ...prev,
                      [activeChildProfile.member.id]: {},
                    }))
                  }
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tout décocher (Nouveau départ)</span>
                </button>
              </div>

              <div className="space-y-2">
                {BAG_CHECKLISTS_BY_STAGE[activeChildProfile.category].map((item) => {
                  const checked =
                    !!bagChecksByChild[activeChildProfile.member.id]?.[item.id];
                  return (
                    <div
                      key={item.id}
                      onClick={() =>
                        setBagChecksByChild((prev) => ({
                          ...prev,
                          [activeChildProfile.member.id]: {
                            ...(prev[activeChildProfile.member.id] || {}),
                            [item.id]: !checked,
                          },
                        }))
                      }
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        checked
                          ? 'bg-emerald-50/50 border-emerald-200 text-slate-400'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                            checked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <span className={`text-xs font-bold ${checked ? 'line-through' : ''}`}>
                          {item.label}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0">
                        {item.category}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* BABY / TODDLER DIVERSIFICATION FOR THIS SPECIFIC CHILD                */}
          {/* ===================================================================== */}
          {activeChildProfile.category !== 'school_child' &&
            babySubView === 'diversification' && (
              <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
                {(() => {
                  const childReactions =
                    diversificationByChild[activeChildProfile.member.id] || {};
                  const testedCount = Object.values(childReactions).filter(
                    (v) => v !== 'untested'
                  ).length;

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Heart className="w-4 h-4 text-rose-500" />
                            <span>
                              Diversification de {activeChildProfile.member.name} ({testedCount}/
                              {DIVERSIFICATION_FOODS.length} testés)
                            </span>
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Touchez un aliment : À tester → ❤️ Adoré → 😐 Bof → ⚠️ Réaction
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {[
                            { id: 'all', label: 'Tous' },
                            { id: 'legumes', label: '🥕 Légumes' },
                            { id: 'fruits', label: '🍎 Fruits' },
                            { id: 'proteines', label: '🍗 Protéines' },
                            { id: 'allergenes', label: '🥜 Allergènes' },
                          ].map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => setActiveFoodGroup(g.id as any)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                                activeFoodGroup === g.id
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {g.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {DIVERSIFICATION_FOODS.filter(
                          (f) => activeFoodGroup === 'all' || f.group === activeFoodGroup
                        ).map((food) => {
                          const status = childReactions[food.id] || 'untested';
                          return (
                            <button
                              key={food.id}
                              type="button"
                              onClick={() =>
                                handleCycleChildFoodReaction(
                                  activeChildProfile.member.id,
                                  food.id
                                )
                              }
                              className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                status === 'loved'
                                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                  : status === 'neutral'
                                  ? 'bg-amber-50/70 border-amber-300 text-amber-950'
                                  : status === 'allergy'
                                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                                  : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold truncate">{food.name}</p>
                                <span className="text-[10px] opacity-75">
                                  Dès {food.minMonths} mois
                                </span>
                              </div>

                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ${
                                  status === 'loved'
                                    ? 'bg-emerald-600 text-white'
                                    : status === 'neutral'
                                    ? 'bg-amber-500 text-slate-950'
                                    : status === 'allergy'
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-500'
                                }`}
                              >
                                {status === 'loved'
                                  ? '❤️ Adoré'
                                  : status === 'neutral'
                                  ? '😐 Bof'
                                  : status === 'allergy'
                                  ? '⚠️ Réaction'
                                  : 'À tester'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
        </div>
      )}

      {/* SUB-TAB: TÂCHES DU QUOTIDIEN */}
      {activeSubTab === 'chores' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BellRing className="w-4 h-4 text-emerald-600" />
                <span>Tâches du Quotidien & Rappels Push</span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Ajoutez vos tâches avec une heure de rappel optionnelle pour recevoir une notification Push automatique.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateChore} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              required
              value={newChoreTitle}
              onChange={(e) => setNewChoreTitle(e.target.value)}
              placeholder="Ajouter une tâche (ex: Sortir les poubelles, préparer le biberon du soir...)"
              className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex flex-wrap sm:flex-nowrap gap-2">
              <select
                value={newChoreCategory}
                onChange={(e) => setNewChoreCategory(e.target.value as any)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              >
                <option value="laundry">🧺 Linge</option>
                <option value="kitchen">🍽️ Cuisine</option>
                <option value="cleaning">🧹 Ménage</option>
                <option value="trash">🗑️ Poubelles</option>
                {detectedChildren.length > 0 && <option value="baby">👶 Enfants</option>}
              </select>
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="time"
                  value={newChoreReminderTime}
                  onChange={(e) => setNewChoreReminderTime(e.target.value)}
                  title="Heure de notification Push (optionnel)"
                  className="bg-transparent text-xs text-slate-700 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0"
              >
                Ajouter
              </button>
            </div>
          </form>

          {chores.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <p className="text-sm font-semibold text-slate-700">Aucune tâche enregistrée</p>
              <p className="text-xs mt-1">
                Ajoutez vos petites routines du quotidien à partager entre parents avec alerte Push.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {chores.map((chore) => (
                <div
                  key={chore.id}
                  className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => onToggleChore(chore.id, selectedParent)}
                      className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 cursor-pointer ${
                        chore.completedToday
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {chore.completedToday && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p
                          className={`text-xs font-bold ${
                            chore.completedToday ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {chore.title}
                        </p>
                        {chore.reminderTime && !chore.completedToday && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                            <BellRing className="w-2.5 h-2.5" />
                            Push {chore.reminderTime}
                          </span>
                        )}
                      </div>
                      {chore.completedToday && chore.lastDoneBy && (
                        <span className="text-[10px] text-emerald-600 font-semibold">
                          ✓ Fait par {chore.lastDoneBy}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!chore.completedToday && onSendChorePush && (
                      <button
                        type="button"
                        onClick={() => onSendChorePush(chore)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        title="Envoyer une notification Push immédiate pour cette tâche"
                      >
                        <BellRing className="w-3 h-3 text-emerald-600" />
                        <span>Push</span>
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteChore(chore.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick Ping Between Parents */}
          <form
            onSubmit={handleSendQuickPing}
            className="pt-3 border-t border-slate-100 flex items-center gap-2"
          >
            <input
              type="text"
              value={quickPingText}
              onChange={(e) => setQuickPingText(e.target.value)}
              placeholder="Message / Rappel flash au foyer (ex: Peux-tu passer à la pharmacie ?)"
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Notifier</span>
            </button>
          </form>
        </div>
      )}

      {/* Modal: Nouveau Tirage de Lait Maternel */}
      {isAddingMilk && activeChildProfile && (
        <div
          onClick={() => setIsAddingMilk(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-slide-up"
          >
            <div className="p-4 bg-pink-600 text-white flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold truncate">
                Noter un tirage de lait ({activeChildProfile.member.name})
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingMilk(false)}
                className="px-2.5 py-1 rounded-xl bg-pink-700 hover:bg-pink-800 text-white text-xs font-bold shrink-0 cursor-pointer"
              >
                ✕ Fermer
              </button>
            </div>

            <form
              onSubmit={(e) => handleCreateMilkBatch(e, activeChildProfile.member.name)}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quantité (ml)
                </label>
                <input
                  type="number"
                  min="10"
                  max="500"
                  step="5"
                  required
                  value={milkVolume}
                  onChange={(e) => setMilkVolume(Number(e.target.value))}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Conservation
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ambient', label: '🌡️ Ambiant (4h)' },
                    { id: 'fridge', label: '❄️ Frigo (48h)' },
                    { id: 'freezer', label: '🧊 Congél (4m)' },
                  ].map((loc) => (
                    <button
                      type="button"
                      key={loc.id}
                      onClick={() => setMilkStorage(loc.id as any)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border cursor-pointer ${
                        milkStorage === loc.id
                          ? 'bg-pink-600 text-white border-pink-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {loc.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Note (optionnel)
                </label>
                <input
                  type="text"
                  value={milkNotes}
                  onChange={(e) => setMilkNotes(e.target.value)}
                  placeholder="Ex: Tirage du matin..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingMilk(false)}
                  className="flex-1 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-pink-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
