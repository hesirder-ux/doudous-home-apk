import { DriveBrandCode, FamilyPreferences, FoodCategory, Recipe } from '../types';

export interface HouseholdPortionSummary {
  /** Nombre d'adultes utilisé pour calibrer les recettes de la semaine (sans compter les enfants comme des adultes) */
  totalPeople: number;
  adultsCount: number;
  childrenCount: number;
  babiesCount: number;
  /** Nombre de parts adultes cible utilisé pour calibrer les recettes et la liste de courses */
  targetServings: number;
  label: string;
}

/**
 * Normalise une chaîne d'ingrédient en français (convertit œ -> oe, æ -> ae, retire les accents et la ponctuation).
 */
export function normalizeIngredientText(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcule le nombre d'adultes et d'enfants du foyer.
 * IMPORTANT : Ne compte JAMAIS les enfants ou bébés dans les adultes pour préparer les recettes de la semaine.
 */
export function getHouseholdPortionSummary(
  preferences?: FamilyPreferences | null
): HouseholdPortionSummary {
  const members = preferences?.members || [];

  if (members.length > 0) {
    let parentMembersCount = 0;
    let children = 0;
    let babies = 0;

    const now = new Date();
    members.forEach((m) => {
      if (m.role === 'parent') {
        parentMembersCount += 1;
      } else {
        let months = (m.age || 0) * 12;
        if (m.birthDate) {
          const b = new Date(m.birthDate);
          months = Math.max(
            0,
            (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
          );
        }
        if (months < 36 || m.role === 'baby' || m.role === 'toddler') {
          babies += 1;
        } else {
          children += 1;
        }
      }
    });

    // Le nombre d'adultes ne doit jamais inclure les enfants/bébés.
    // Si l'utilisateur a ajusté manuellement `adultsCount`, on l'utilise ; sinon on prend le nombre de parents déclarés (par défaut 2 si aucun parent saisi).
    const baseAdults = parentMembersCount > 0 ? parentMembersCount : 2;
    const effectiveAdults = Math.max(
      1,
      typeof preferences?.adultsCount === 'number' && preferences.adultsCount > 0
        ? preferences.adultsCount
        : baseAdults
    );

    const parts: string[] = [
      `${effectiveAdults} adulte${effectiveAdults > 1 ? 's' : ''}`,
    ];
    if (children > 0) parts.push(`${children} enfant${children > 1 ? 's' : ''}`);
    if (babies > 0) parts.push(`${babies} bébé${babies > 1 ? 's' : ''}`);

    return {
      totalPeople: effectiveAdults,
      adultsCount: effectiveAdults,
      childrenCount: children,
      babiesCount: babies,
      targetServings: effectiveAdults,
      label: parts.join(' · '),
    };
  }

  const fallbackAdults = Math.max(
    1,
    preferences?.adultsCount || preferences?.householdSize || 2
  );
  return {
    totalPeople: fallbackAdults,
    adultsCount: fallbackAdults,
    childrenCount: 0,
    babiesCount: 0,
    targetServings: fallbackAdults,
    label: `${fallbackAdults} adulte${fallbackAdults > 1 ? 's' : ''}`,
  };
}

/**
 * Adapte une quantité d'ingrédient (ex: "400g", "2 pavés", "20cl")
 * du nombre de parts de la recette (`fromServings`) vers le nombre d'adultes du foyer (`toServings`).
 */
export function scaleIngredientAmount(
  amountStr: string,
  fromServings: number,
  toServings: number
): string {
  if (!amountStr) return '1 pièce';
  const baseServings = Math.max(1, fromServings || 4);
  const target = Math.max(1, toServings || baseServings);

  const ratio = target / baseServings;
  if (Math.abs(ratio - 1) < 0.05) {
    return amountStr;
  }

  // Gère les fractions type "1/2 pièce"
  const fractionMatch = amountStr.trim().match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/);
  if (fractionMatch) {
    const num = parseFloat(fractionMatch[1]);
    const den = parseFloat(fractionMatch[2]);
    if (den > 0) {
      const val = (num / den) * ratio;
      const unitRest = fractionMatch[3].replace(/\(.*?\)/g, '').trim() || 'pièce';
      const rounded = Math.max(0.5, Math.round(val * 2) / 2);
      return `${String(rounded).replace('.', ',')} ${unitRest}`.trim();
    }
  }

  // Regex pour capturer le premier nombre (entier ou décimal) au début de la chaîne
  const match = amountStr.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!match) {
    return amountStr;
  }

  const rawValue = parseFloat(match[1].replace(',', '.'));
  if (isNaN(rawValue) || rawValue <= 0) {
    return amountStr;
  }

  const rest = match[2].trim();
  const restLower = rest.toLowerCase();
  const scaled = rawValue * ratio;

  // Grammes ou millilitres : arrondi propre à 5 ou 10 près
  if (/^(g|gr|grammes?|ml)\b/i.test(restLower)) {
    const cleanUnit = /^ml\b/i.test(restLower) ? 'ml' : 'g';
    const rounded =
      scaled >= 100
        ? Math.round(scaled / 10) * 10
        : Math.max(5, Math.round(scaled / 5) * 5);
    return `${rounded} ${cleanUnit}`;
  }

  // Centilitres ou litres ou kg
  if (/^(cl|dl|l|litres?|kg)\b/i.test(restLower)) {
    const rounded = Math.round(scaled * 10) / 10;
    const cleanUnit = rest.split('(')[0].trim();
    return `${String(rounded).replace('.', ',')} ${cleanUnit}`;
  }

  // Cuillères (c.à.s, c.à.c, pincée, noisette)
  if (/^(c\.à\.|cuill|pinc|noisette)/i.test(restLower)) {
    // Si une noisette contient un poids entre parenthèses ex: "1 noisette (5g)", on convertit directement en g
    const parenGrams = rest.match(/\(\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
    if (parenGrams) {
      const gVal = parseFloat(parenGrams[1].replace(',', '.')) * ratio;
      return `${Math.max(5, Math.round(gVal / 5) * 5)} g`;
    }
    const rounded = Math.max(0.5, Math.round(scaled * 2) / 2);
    return `${String(rounded).replace('.5', ',5')} ${rest}`;
  }

  // Unités discrètes à acheter en magasin (œufs, pavés, filets, boîtes, tranches, pièces)
  const discretePieces = Math.max(1, Math.ceil(scaled - 0.1));
  const scaledRest = rest.replace(
    /\(\s*(\d+(?:[.,]\d+)?)\s*(g|gr|ml|cl|kg|l)\b[^)]*\)/i,
    (_full, numStr, unitStr) => {
      const innerVal = parseFloat(numStr.replace(',', '.'));
      if (isNaN(innerVal)) return _full;
      const innerScaled = innerVal * ratio;
      const uLower = unitStr.toLowerCase();
      if (uLower === 'g' || uLower === 'gr' || uLower === 'ml') {
        return `(${Math.max(10, Math.round(innerScaled / 10) * 10)}${uLower})`;
      }
      return `(${Math.round(innerScaled * 10) / 10}${uLower})`;
    }
  );
  return `${discretePieces} ${scaledRest}`.trim();
}

interface ParsedMeasure {
  kind: 'weight_g' | 'volume_ml' | 'pieces' | 'spoons' | 'other';
  value: number;
  unitLabel: string;
}

function parseSingleMeasure(unitStr: string): ParsedMeasure {
  const s = (unitStr || '').trim();
  if (!s) return { kind: 'pieces', value: 1, unitLabel: 'pièce(s)' };

  // Si la chaîne est du type "1 noisette (5g)" ou "25g (portion...)"
  const onlyParenWeight = s.match(/^\d+\s*(?:noisettes?|noix|portions?|morceaux?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(g|gr|kg)\b/i);
  if (onlyParenWeight) {
    const v = parseFloat(onlyParenWeight[1].replace(',', '.'));
    const u = onlyParenWeight[2].toLowerCase();
    return {
      kind: 'weight_g',
      value: u === 'kg' ? v * 1000 : v,
      unitLabel: 'g',
    };
  }

  // Fraction au début ex: "1/2 pièce"
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/);
  if (frac) {
    const v = parseFloat(frac[1]) / Math.max(1, parseFloat(frac[2]));
    return { kind: 'pieces', value: v, unitLabel: 'pièce(s)' };
  }

  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) {
    return { kind: 'other', value: 1, unitLabel: s };
  }

  const val = parseFloat(m[1].replace(',', '.'));
  if (isNaN(val) || val <= 0) {
    return { kind: 'other', value: 1, unitLabel: s };
  }

  // Nettoie les commentaires entre parenthèses pour comparer les unités proprement
  const rawRest = m[2].trim();
  const cleanRest = rawRest.replace(/\(.*?\)/g, '').trim().toLowerCase();

  if (/^(g|gr|grammes?)\b/.test(cleanRest)) {
    return { kind: 'weight_g', value: val, unitLabel: 'g' };
  }
  if (/^(kg|kilos?|kilogrammes?)\b/.test(cleanRest)) {
    return { kind: 'weight_g', value: val * 1000, unitLabel: 'g' };
  }
  if (/^(ml|millilitres?)\b/.test(cleanRest)) {
    return { kind: 'volume_ml', value: val, unitLabel: 'ml' };
  }
  if (/^(cl|centilitres?)\b/.test(cleanRest)) {
    return { kind: 'volume_ml', value: val * 10, unitLabel: 'cl' };
  }
  if (/^(dl|decilitres?)\b/.test(cleanRest)) {
    return { kind: 'volume_ml', value: val * 100, unitLabel: 'cl' };
  }
  if (/^(l|litres?)\b/.test(cleanRest)) {
    return { kind: 'volume_ml', value: val * 1000, unitLabel: 'L' };
  }
  if (/^(c\.à\.s|cas|cuill[eè]res?\s+[aà]\s+soupe|c\.à\.c|cac|cuill[eè]res?\s+[aà]\s+caf[eé])/.test(cleanRest)) {
    return { kind: 'spoons', value: val, unitLabel: cleanRest.includes('caf') || cleanRest.includes('c.à.c') ? 'c.à.c' : 'c.à.s' };
  }

  // Unités discrètes (pièces, tranches, pavés, boîtes, sachets, briques, rouleaux, etc.)
  const baseUnitWord =
    cleanRest
      .replace(/^(grandes?|petites?|belles?|beaux|gros|grosses?)\s+/i, '')
      .trim() || 'pièce(s)';

  return {
    kind: 'pieces',
    value: val,
    unitLabel: baseUnitWord,
  };
}

function formatMeasure(measure: ParsedMeasure): string {
  if (measure.kind === 'weight_g') {
    if (measure.value >= 1000 && measure.value % 100 === 0) {
      return `${String(measure.value / 1000).replace('.', ',')} kg`;
    }
    return `${Math.round(measure.value)} g`;
  }
  if (measure.kind === 'volume_ml') {
    if (measure.value >= 1000) {
      return `${String(Math.round((measure.value / 1000) * 10) / 10).replace('.', ',')} L`;
    }
    if (measure.value >= 10 && measure.value % 10 === 0) {
      return `${Math.round(measure.value / 10)} cl`;
    }
    return `${Math.round(measure.value)} ml`;
  }
  if (measure.kind === 'pieces') {
    const rounded = Math.ceil(measure.value - 0.05);
    const label = measure.unitLabel || 'pièce(s)';
    if (
      rounded > 1 &&
      !label.endsWith('s') &&
      !label.endsWith('x') &&
      !label.includes('(')
    ) {
      return `${rounded} ${label}s`;
    }
    return `${rounded} ${label}`;
  }
  if (measure.kind === 'spoons') {
    const rounded = Math.round(measure.value * 2) / 2;
    return `${String(rounded).replace('.', ',')} ${measure.unitLabel}`;
  }
  return measure.unitLabel;
}

/**
 * Additionne intelligemment deux quantités d'un même ingrédient pour la liste de courses
 * sans créer de doublons (ex: "40g" + "15g" + "1 noisette (5g)" -> "60 g", ou "2 pièces" + "4 pièces" -> "6 pièces").
 */
export function combineIngredientAmounts(existingUnit: string, additionalUnit: string): string {
  const existingChunks = (existingUnit || '1 pièce')
    .split('+')
    .map((c) => c.trim())
    .filter(Boolean);
  const newChunks = (additionalUnit || '1 pièce')
    .split('+')
    .map((c) => c.trim())
    .filter(Boolean);

  const allParsed = [...existingChunks, ...newChunks].map(parseSingleMeasure);

  let totalWeightG = 0;
  let totalVolumeMl = 0;
  let totalPieces = 0;
  let pieceLabel = 'pièce(s)';
  let totalSpoons = 0;
  let spoonLabel = 'c.à.s';
  const others: string[] = [];

  allParsed.forEach((p) => {
    if (p.kind === 'weight_g') {
      totalWeightG += p.value;
    } else if (p.kind === 'volume_ml') {
      totalVolumeMl += p.value;
    } else if (p.kind === 'pieces') {
      totalPieces += p.value;
      if (
        p.unitLabel &&
        p.unitLabel !== 'pièce' &&
        p.unitLabel !== 'pièces' &&
        p.unitLabel !== 'pièce(s)'
      ) {
        pieceLabel = p.unitLabel;
      }
    } else if (p.kind === 'spoons') {
      // Si on a déjà un poids en grammes (ex: beurre ou huile), 1 c.à.s = 15g, 1 c.à.c = 5g
      totalSpoons += p.value;
      spoonLabel = p.unitLabel;
    } else if (p.unitLabel && !others.includes(p.unitLabel)) {
      others.push(p.unitLabel);
    }
  });

  // Si on a à la fois du poids (g) et des cuillères, on convertit les cuillères en grammes pour n'avoir qu'une seule quantité propre
  if (totalWeightG > 0 && totalSpoons > 0) {
    totalWeightG += totalSpoons * (spoonLabel === 'c.à.c' ? 5 : 15);
    totalSpoons = 0;
  }

  // Si on a à la fois du volume (ml/cl) et des cuillères, on convertit les cuillères en ml
  if (totalVolumeMl > 0 && totalSpoons > 0) {
    totalVolumeMl += totalSpoons * (spoonLabel === 'c.à.c' ? 5 : 15);
    totalSpoons = 0;
  }

  const formattedParts: string[] = [];
  if (totalWeightG > 0) {
    formattedParts.push(formatMeasure({ kind: 'weight_g', value: totalWeightG, unitLabel: 'g' }));
  }
  if (totalVolumeMl > 0) {
    formattedParts.push(formatMeasure({ kind: 'volume_ml', value: totalVolumeMl, unitLabel: 'ml' }));
  }
  if (totalPieces > 0) {
    formattedParts.push(
      formatMeasure({ kind: 'pieces', value: totalPieces, unitLabel: pieceLabel })
    );
  }
  if (totalSpoons > 0) {
    formattedParts.push(
      formatMeasure({ kind: 'spoons', value: totalSpoons, unitLabel: spoonLabel })
    );
  }
  formattedParts.push(...others);

  return formattedParts.join(' + ') || '1 pièce';
}

/**
 * Classe automatiquement et avec une grande précision un produit ou ingrédient dans le bon rayon de supermarché.
 */
export function inferIngredientCategory(ingredientName: string): FoodCategory {
  const n = normalizeIngredientText(ingredientName);
  if (!n) return 'pantry';

  // 1. BÉBÉ, LAIT INFANTILE & COUCHES
  if (
    /\b(couche|couches|lingette|lingettes|biberon|tetine|lait infantile|lait 1er age|lait 2e age|lait de croissance|petit pot|serum physiologique|liniment|coton bebe|bebe)\b/.test(
      n
    )
  ) {
    return 'baby_care';
  }

  // 2. MÉNAGE, LESSIVE & ENTRETIEN MAISON
  if (
    /\b(lessive|adoucissant|liquide vaisselle|tablette|lave vaisselle|eponge|eponges|essuie tout|sopalin|papier toilette|sac poubelle|sacs poubelle|javel|nettoyant|detartrant|vinaigre menager|produit sol|bloc wc|desodorisant|film alimentaire|papier cuisson|aluminium)\b/.test(
      n
    )
  ) {
    return 'household';
  }

  // 3. HYGIÈNE & SALLE DE BAIN
  if (
    /\b(gel douche|shampoing|shampooing|savon|dentifrice|brosse a dents|deodorant|coton tige|mouchoir|mouchoirs|creme lavante|essuie mains)\b/.test(
      n
    )
  ) {
    return 'hygiene';
  }

  // 4. SURGELÉS
  if (/\b(surgele|surgeles|surgelee|surgelees|glace|sorbet|frites surgelees)\b/.test(n)) {
    return 'frozen';
  }

  // 5. BOISSONS
  if (
    /\b(eau minerale|eau de source|pack d eau|bouteille d eau|jus d|jus de|soda|cola|limonade|cafe|tisane|infusion|the vert|the noir|biere|cidre)\b/.test(
      n
    )
  ) {
    return 'beverages';
  }

  // 6. CAS PARTICULIERS D'ÉPICERIE SÈCHE / CONSERVES (à vérifier AVANT crèmerie, viande ou légumes !)
  // Ex: "Tagliatelles aux œufs", "Lait de coco", "Coulis de tomate", "Beurre de cacahuète", "Thon en boîte", "Maïs en boîte"
  if (
    /\b(tagliatelle|tagliatelles|spaghetti|spaghettis|coquillette|coquillettes|penne|fusilli|macaroni|lasagne|lasagnes|nouille|nouilles|vermicelle|pates|riz|semoule|couscous|quinoa|boulgour|ble|ebl|lentille|lentilles|pois chiche|pois chiches|haricot rouge|haricots rouges|haricot blanc|haricots blancs|flocon|flocons|avoine|muesli|cereales)\b/.test(
      n
    )
  ) {
    return 'pantry';
  }

  if (
    /\b(lait de coco|creme de coco|noix de coco|beurre de cacahuete|beurre d arachide|pate a tartiner|coulis de tomate|coulis de tomates|sauce tomate|tomates pelees|tomates concassees|concentre de tomate|thon en boite|sardine en boite|sardines en boite|mais en boite|mais doux|en boite|en conserve|conserve|compote|compotes)\b/.test(
      n
    )
  ) {
    return 'pantry';
  }

  if (
    /\b(farine|sucre|cassonade|maizena|fecule|levure|chocolat|cacao|miel|confiture|sirop d erable|biscuit|biscuits|gateau|cracotte|biscotte|huile|vinaigre|moutarde|mayonnaise|ketchup|sauce soja|cornichon|cornichons|olive|olives|capres|bouillon|cube|curry|paprika|cumin|cannelle|muscade|herbes de provence|epice|epices|poivre|sel|vanille|amande|amandes|noisette|noisettes|noix de cajou|pistache|pignon|raisin sec|raisins secs)\b/.test(
      n
    )
  ) {
    // Attention: "1 noisette (5g)" de beurre a "beurre" dans le nom
    if (!n.includes('beurre')) {
      return 'pantry';
    }
  }

  // 7. BOULANGERIE & PAINS
  if (
    /\b(pain|baguette|brioche|pain de mie|pain burger|tortilla|tortillas|wrap|wraps|croissant|pain au chocolat|viennoiserie|crouton|croutons|pita|naan|galette de ble)\b/.test(
      n
    )
  ) {
    return 'bakery';
  }

  // 8. BOUCHERIE, VOLAILLE, CHARCUTERIE & POISSONNERIE
  if (
    /\b(poulet|dinde|volaille|canard|pintade|boeuf|steak|viande|veau|porc|filet mignon|echine|agneau|gigot|mouton|lapin|jambon|lardon|lardons|bacon|saucisse|saucisses|knack|knacks|merguez|chipolata|chorizo|saucisson|rillettes|boudin|andouillette|foie|saumon|cabillaud|colin|lieu|merlu|truite|dorade|daurade|sole|thon|sardine|maquereau|poisson|crevette|crevettes|gambas|moule|moules|saint jacques|calamar|encornet|crabe|surimi|escalope|escalopes|pave de|roti)\b/.test(
      n
    )
  ) {
    return 'meat_fish';
  }

  // 9. FRAIS, CRÈMERIE, BEURRE, OEUFS & PÂTES FRAÎCHES
  if (
    /\b(oeuf|oeufs|lait|creme|beurre|fromage|emmental|comte|gruyere|mozzarella|parmesan|chevre|feta|ricotta|mascarpone|roquefort|bleu|camembert|brie|reblochon|raclette|cantal|mimolette|st moret|saint moret|kiri|boursin|philadelphia|vache qui rit|babybel|yaourt|yaourts|skyr|petit suisse|petits suisses|fromage blanc|faisselle|kefir|pate feuilletee|pate brisee|pate sablee|pate a pizza|gnocchi|gnocchis|ravioli|raviolis|tortellini|quenelle)\b/.test(
      n
    )
  ) {
    return 'dairy';
  }

  // 10. LÉGUMES & HERBES FRAÎCHES (vérifié AVANT fruits pour que "pomme de terre" soit toujours un légume)
  if (
    /\b(pomme de terre|pommes de terre|patate|patates|carotte|carottes|courgette|courgettes|poireau|poireaux|oignon|oignons|echalote|echalotes|ail|epinard|epinards|brocoli|brocolis|potimarron|potiron|courge|butternut|tomate|tomates|haricot vert|haricots verts|champignon|champignons|salade|laitue|mache|roquette|endive|endives|poivron|poivrons|aubergine|aubergines|concombre|concombres|chou|choux|petits pois|pois gourmand|celeri|fenouil|betterave|navet|radis|asperge|asperges|artichaut|avocat|avocats|persil|basilic|coriandre|ciboulette|menthe|thym|romarin|aneth|gingembre|legume|legumes|crudites)\b/.test(
      n
    )
  ) {
    return 'vegetables';
  }

  // 11. FRUITS FRAIS
  if (
    /\b(banane|bananes|pomme|pommes|gala|golden|pink lady|poire|poires|fraise|fraises|framboise|framboises|myrtille|myrtilles|mure|mures|cassis|groseille|cerise|cerises|citron|citrons|orange|oranges|clementine|clementines|mandarine|mandarines|pamplemousse|agrume|agrumes|kiwi|kiwis|mangue|mangues|ananas|peche|peches|nectarine|brugnon|abricot|abricots|prune|prunes|mirabelle|raisin|raisins|melon|pasteque|figue|figues|grenade|litchi|passion|papaye|kaki|datte|dattes|pruneau|pruneaux|fruit|fruits)\b/.test(
      n
    )
  ) {
    return 'fruits';
  }

  return 'pantry';
}

export interface CanonicalShoppingIngredient {
  /** Clé unique canonique pour fusionner tous les doublons (ex: "oeufs", "beurre", "carottes") */
  key: string;
  /** Nom d'affichage propre et homogène dans la liste de courses */
  displayName: string;
  /** Rayon / Catégorie exacte */
  category: FoodCategory;
}

const CANONICAL_GROCERY_RULES: Array<{
  match: (norm: string) => boolean;
  key: string;
  displayName: string;
  category: FoodCategory;
}> = [
  // --- PÂTES, RIZ, FÉCULENTS & CONSERVES (avant œufs/beurre/tomate/lait) ---
  {
    match: (n) => /\b(tagliatelle|tagliatelles)\b/.test(n),
    key: 'tagliatelles',
    displayName: 'Tagliatelles',
    category: 'pantry',
  },
  {
    match: (n) => /\b(coquillette|coquillettes)\b/.test(n),
    key: 'pates',
    displayName: 'Pâtes (Coquillettes / Spaghettis)',
    category: 'pantry',
  },
  {
    match: (n) => /\b(spaghetti|spaghettis|penne|fusilli|macaroni|pates)\b/.test(n),
    key: 'pates',
    displayName: 'Pâtes',
    category: 'pantry',
  },
  {
    match: (n) => /\b(gnocchi|gnocchis)\b/.test(n),
    key: 'gnocchis',
    displayName: 'Gnocchis à poêler',
    category: 'dairy',
  },
  {
    match: (n) => /\b(riz)\b/.test(n),
    key: 'riz',
    displayName: 'Riz basmati',
    category: 'pantry',
  },
  {
    match: (n) => /\b(quinoa)\b/.test(n),
    key: 'quinoa',
    displayName: 'Quinoa',
    category: 'pantry',
  },
  {
    match: (n) => /\b(semoule|couscous)\b/.test(n),
    key: 'semoule',
    displayName: 'Semoule',
    category: 'pantry',
  },
  {
    match: (n) => /\b(lentille|lentilles)\b/.test(n),
    key: 'lentilles',
    displayName: 'Lentilles corail',
    category: 'pantry',
  },
  {
    match: (n) => /\b(lait de coco|creme de coco)\b/.test(n),
    key: 'lait_de_coco',
    displayName: 'Lait de coco',
    category: 'pantry',
  },
  {
    match: (n) =>
      /\b(coulis de tomate|coulis de tomates|sauce tomate|tomates pelees|tomates concassees|concentre de tomate)\b/.test(
        n
      ) || n.includes('coulis'),
    key: 'coulis_tomate',
    displayName: 'Coulis de tomate',
    category: 'pantry',
  },
  {
    match: (n) => /\b(mais)\b/.test(n),
    key: 'mais_boite',
    displayName: 'Maïs doux en boîte',
    category: 'pantry',
  },
  {
    match: (n) => /\b(thon)\b/.test(n) && /\b(boite|conserve|miettes)\b/.test(n),
    key: 'thon_boite',
    displayName: 'Thon en boîte',
    category: 'pantry',
  },
  {
    match: (n) => /\b(pate feuilletee)\b/.test(n),
    key: 'pate_feuilletee',
    displayName: 'Pâte feuilletée',
    category: 'dairy',
  },
  {
    match: (n) => /\b(pate brisee)\b/.test(n),
    key: 'pate_brisee',
    displayName: 'Pâte brisée',
    category: 'dairy',
  },
  {
    match: (n) => /\b(tortilla|tortillas|wrap|wraps|galette de ble)\b/.test(n),
    key: 'tortillas',
    displayName: 'Tortillas de blé (Wraps)',
    category: 'bakery',
  },
  {
    match: (n) => /\b(pain de mie)\b/.test(n),
    key: 'pain_de_mie',
    displayName: 'Pain de mie',
    category: 'bakery',
  },
  {
    match: (n) => /\b(farine)\b/.test(n),
    key: 'farine',
    displayName: 'Farine de blé',
    category: 'pantry',
  },
  {
    match: (n) => /\b(flocon|flocons|avoine)\b/.test(n),
    key: 'flocons_avoine',
    displayName: 'Flocons d’avoine',
    category: 'pantry',
  },
  {
    match: (n) => /\b(huile d olive|huile olive)\b/.test(n),
    key: 'huile_olive',
    displayName: 'Huile d’olive',
    category: 'pantry',
  },

  // --- CRÈMERIE, BEURRE, OEUFS, LAIT & FROMAGES ---
  {
    match: (n) => /\b(oeuf|oeufs)\b/.test(n),
    key: 'oeufs',
    displayName: 'Œufs frais',
    category: 'dairy',
  },
  {
    match: (n) =>
      /\b(beurre)\b/.test(n) &&
      !n.includes('cacahuete') &&
      !n.includes('arachide') &&
      !n.includes('pate '),
    key: 'beurre',
    displayName: 'Beurre doux',
    category: 'dairy',
  },
  {
    match: (n) =>
      /\b(lait)\b/.test(n) &&
      !n.includes('coco') &&
      !n.includes('infantile') &&
      !n.includes('1er age') &&
      !n.includes('2e age') &&
      !n.includes('croissance') &&
      !n.includes('maternel'),
    key: 'lait',
    displayName: 'Lait demi-écrémé',
    category: 'dairy',
  },
  {
    match: (n) => /\b(creme fraiche|creme liquide|creme entiere|creme legere|creme)\b/.test(n),
    key: 'creme_fraiche',
    displayName: 'Crème fraîche',
    category: 'dairy',
  },
  {
    match: (n) => /\b(emmental|gruyere|fromage rape|comte rape)\b/.test(n),
    key: 'emmental_rape',
    displayName: 'Emmental râpé',
    category: 'dairy',
  },
  {
    match: (n) => /\b(mozzarella)\b/.test(n),
    key: 'mozzarella',
    displayName: 'Mozzarella',
    category: 'dairy',
  },
  {
    match: (n) => /\b(fromage frais|st moret|saint moret|kiri|boursin|philadelphia)\b/.test(n),
    key: 'fromage_frais',
    displayName: 'Fromage frais',
    category: 'dairy',
  },
  {
    match: (n) => /\b(yaourt|yaourts)\b/.test(n),
    key: 'yaourts',
    displayName: 'Yaourts nature',
    category: 'dairy',
  },

  // --- VIANDES, VOLAILLES, CHARCUTERIE & POISSONS ---
  {
    match: (n) => /\b(saumon)\b/.test(n),
    key: 'saumon',
    displayName: 'Pavé de saumon',
    category: 'meat_fish',
  },
  {
    match: (n) => /\b(cabillaud|colin|merlu|lieu|poisson blanc)\b/.test(n),
    key: 'cabillaud',
    displayName: 'Filet de cabillaud / colin',
    category: 'meat_fish',
  },
  {
    match: (n) => /\b(poulet)\b/.test(n) && !n.includes('jambon'),
    key: 'poulet',
    displayName: 'Filets de poulet',
    category: 'meat_fish',
  },
  {
    match: (n) => /\b(dinde)\b/.test(n),
    key: 'dinde',
    displayName: 'Escalopes de dinde',
    category: 'meat_fish',
  },
  {
    match: (n) => /\b(boeuf|steak hache|viande hachee)\b/.test(n),
    key: 'boeuf_hache',
    displayName: 'Bœuf haché',
    category: 'meat_fish',
  },
  {
    match: (n) => /\b(jambon)\b/.test(n),
    key: 'jambon_blanc',
    displayName: 'Jambon blanc',
    category: 'meat_fish',
  },
  {
    match: (n) => /\b(lardon|lardons|bacon)\b/.test(n),
    key: 'lardons',
    displayName: 'Lardons',
    category: 'meat_fish',
  },

  // --- FRUITS & LÉGUMES ---
  {
    match: (n) => /\b(pomme de terre|pommes de terre|patate|patates)\b/.test(n) && !n.includes('douce'),
    key: 'pommes_de_terre',
    displayName: 'Pommes de terre',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(patate douce|patates douces)\b/.test(n),
    key: 'patates_douces',
    displayName: 'Patates douces',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(carotte|carottes)\b/.test(n),
    key: 'carottes',
    displayName: 'Carottes',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(courgette|courgettes)\b/.test(n),
    key: 'courgettes',
    displayName: 'Courgettes',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(epinard|epinards)\b/.test(n),
    key: 'epinards',
    displayName: 'Épinards frais',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(petits pois)\b/.test(n),
    key: 'petits_pois',
    displayName: 'Petits pois',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(haricot vert|haricots verts)\b/.test(n),
    key: 'haricots_verts',
    displayName: 'Haricots verts',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(brocoli|brocolis)\b/.test(n),
    key: 'brocoli',
    displayName: 'Brocoli',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(champignon|champignons)\b/.test(n),
    key: 'champignons',
    displayName: 'Champignons de Paris',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(poivron|poivrons)\b/.test(n),
    key: 'poivrons',
    displayName: 'Poivrons',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(oignon|oignons)\b/.test(n),
    key: 'oignons',
    displayName: 'Oignons',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(ail)\b/.test(n),
    key: 'ail',
    displayName: 'Ail',
    category: 'vegetables',
  },
  {
    match: (n) => /\b(tomate|tomates)\b/.test(n),
    key: 'tomates',
    displayName: 'Tomates',
    category: 'vegetables',
  },
  {
    match: (n) =>
      /\b(pomme|pommes|gala|golden|pink lady)\b/.test(n) &&
      !n.includes('terre') &&
      !n.includes('compote') &&
      !n.includes('jus'),
    key: 'pommes',
    displayName: 'Pommes',
    category: 'fruits',
  },
  {
    match: (n) => /\b(banane|bananes)\b/.test(n),
    key: 'bananes',
    displayName: 'Bananes',
    category: 'fruits',
  },
];

/**
 * Retourne la clé canonique, le nom unifié et la bonne catégorie de rayon pour n'importe quel ingrédient.
 * Empêche tous les doublons du type "Œufs frais plein air" vs "Œufs frais" vs "Oeufs" ou "Beurre doux de Bretagne" vs "Beurre".
 */
export function getCanonicalShoppingIngredient(rawName: string): CanonicalShoppingIngredient {
  const norm = normalizeIngredientText(rawName);
  for (const rule of CANONICAL_GROCERY_RULES) {
    if (rule.match(norm)) {
      return {
        key: rule.key,
        displayName: rule.displayName,
        category: rule.category,
      };
    }
  }

  // Nettoyage générique des qualificatifs pour éviter les doublons sur les autres produits
  const stripped = norm
    .replace(
      /\b(bio|frais|fraiche|fraiches|plein air|de bretagne|des sables|pur beurre|pasteurise|pasteurisee|vierge extra|tricolore|doux|douce|entier|entiere)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  const singularKey = (stripped || norm)
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w))
    .join('_');

  const trimmedOriginal = (rawName || 'Article').trim();
  const displayName =
    trimmedOriginal.charAt(0).toUpperCase() + trimmedOriginal.slice(1);

  return {
    key: singularKey || norm || 'article',
    displayName,
    category: inferIngredientCategory(rawName),
  };
}

/**
 * Vérifie si une recette contient un aliment proscrit par le foyer (`excludedFoods`) ou interdit par ses allergies/régimes.
 */
export function doesRecipeContainExcludedFood(
  recipe: Recipe,
  preferences?: FamilyPreferences | null
): { excluded: boolean; matchedFood?: string } {
  if (!recipe || !preferences) return { excluded: false };

  const excludedFoods = preferences.excludedFoods || [];
  const restrictions = preferences.dietaryRestrictions || [];
  const memberAllergies = (preferences.members || []).flatMap((m) => m.allergies || []);

  const recipeText = normalizeIngredientText(
    `${recipe.title} ${(recipe.ingredients || []).map((i) => i.name).join(' ')}`
  );

  // 1. Vérification des aliments proscrits (hors allergies)
  for (const rawBanned of excludedFoods) {
    const bannedNorm = normalizeIngredientText(rawBanned);
    if (!bannedNorm) continue;

    // Si le libellé proscrit contient "/" (ex: "Porc / Lardons" ou "Crevettes / Fruits de mer"), on teste chaque sous-terme
    const subTerms = rawBanned
      .split(/[/,]/)
      .map((s) => normalizeIngredientText(s))
      .filter((s) => s.length >= 2);

    for (const term of subTerms.length > 0 ? subTerms : [bannedNorm]) {
      const singular = term.length > 3 ? term.replace(/[sx]$/, '') : term;
      const regex = new RegExp(`\\b${singular}[sx]?\\b`, 'i');
      if (regex.test(recipeText) || recipeText.includes(term)) {
        // Exception : si "pomme" est proscrit, ne pas bloquer "pomme de terre"
        if (
          (singular === 'pomme' || term === 'pommes') &&
          recipeText.includes('pomme de terre') &&
          !recipeText.replace(/pommes? de terre/g, '').includes('pomme')
        ) {
          continue;
        }
        // Exception : si "lait" est proscrit, vérifier s'il s'agit de lait de coco ou inversement
        return { excluded: true, matchedFood: rawBanned };
      }
    }
  }

  // 2. Vérification des régimes et allergies principales
  const allRestrictions = [...restrictions, ...memberAllergies].map(normalizeIngredientText);
  for (const r of allRestrictions) {
    if (
      (r.includes('sans porc') || r.includes('halal') || r.includes('casher')) &&
      /\b(porc|jambon|lardon|lardons|bacon|chorizo|saucisson|chipolata)\b/.test(recipeText)
    ) {
      return { excluded: true, matchedFood: 'Porc / Charcuterie' };
    }
    if (r.includes('sans boeuf') && /\b(boeuf|steak)\b/.test(recipeText)) {
      return { excluded: true, matchedFood: 'Bœuf' };
    }
    if (
      r.includes('vegetarien') &&
      /\b(poulet|dinde|boeuf|steak|veau|porc|jambon|lardon|lardons|bacon|saumon|cabillaud|colin|thon|poisson|crevette|viande)\b/.test(
        recipeText
      )
    ) {
      return { excluded: true, matchedFood: 'Viande / Poisson' };
    }
    if (r.includes('poisson') && /\b(saumon|cabillaud|colin|thon|poisson|truite|merlu)\b/.test(recipeText)) {
      return { excluded: true, matchedFood: 'Poisson' };
    }
    if (r.includes('oeuf') && /\b(oeuf|oeufs)\b/.test(recipeText)) {
      return { excluded: true, matchedFood: 'Œufs' };
    }
    if (r.includes('arachide') && /\b(arachide|cacahuete)\b/.test(recipeText)) {
      return { excluded: true, matchedFood: 'Arachides' };
    }
  }

  return { excluded: false };
}

interface MarketPriceEntry {
  keywords: RegExp;
  /** Prix moyen en supermarché français (€ / kg ou € / L) */
  pricePerKgOrL: number;
  /** Prix moyen d'une unité / pièce / boîte quand exprimé en unités discrètes */
  pricePerPiece: number;
  /** Prix minimum réaliste pour une petite dose de recette */
  minPrice?: number;
}

/**
 * Référentiel de prix moyens constatés en grande surface française
 * (E.Leclerc / Carrefour / Intermarché - relevés moyens France).
 */
const FRENCH_SUPERMARKET_PRICES: MarketPriceEntry[] = [
  // --- CRÈMERIE, LAIT, BEURRE, OEUFS ---
  {
    keywords: /\b(beurre)\b/,
    pricePerKgOrL: 9.8,
    pricePerPiece: 2.45,
    minPrice: 0.25,
  },
  {
    keywords: /\b(lait de coco)\b/,
    pricePerKgOrL: 3.4,
    pricePerPiece: 1.35,
    minPrice: 0.45,
  },
  {
    keywords: /\b(lait)\b/,
    pricePerKgOrL: 1.15,
    pricePerPiece: 1.15,
    minPrice: 0.35,
  },
  {
    keywords: /\b(oeuf|oeufs)\b/,
    pricePerKgOrL: 5.5,
    pricePerPiece: 0.32,
    minPrice: 0.32,
  },
  {
    keywords: /\b(creme fraiche|creme liquide|creme)\b/,
    pricePerKgOrL: 4.5,
    pricePerPiece: 1.15,
    minPrice: 0.35,
  },
  {
    keywords: /\b(mozzarella)\b/,
    pricePerKgOrL: 9.6,
    pricePerPiece: 1.25,
    minPrice: 0.6,
  },
  {
    keywords: /\b(chevre)\b/,
    pricePerKgOrL: 10.5,
    pricePerPiece: 1.85,
    minPrice: 0.7,
  },
  {
    keywords: /\b(emmental|comte|gruyere|parmesan|fromage|feta|ricotta|mascarpone)\b/,
    pricePerKgOrL: 11.5,
    pricePerPiece: 1.65,
    minPrice: 0.5,
  },
  {
    keywords: /\b(yaourt|fromage blanc|petit suisse|compote)\b/,
    pricePerKgOrL: 2.8,
    pricePerPiece: 0.45,
    minPrice: 0.45,
  },

  // --- FRUITS & LÉGUMES ---
  {
    keywords: /\b(pomme de terre|pommes de terre|patate)\b/,
    pricePerKgOrL: 1.75,
    pricePerPiece: 0.25,
    minPrice: 0.4,
  },
  {
    keywords: /\b(pomme|pommes|gala|golden|pink lady)\b/,
    pricePerKgOrL: 2.5,
    pricePerPiece: 0.4,
    minPrice: 0.4,
  },
  {
    keywords: /\b(banane|bananes)\b/,
    pricePerKgOrL: 1.99,
    pricePerPiece: 0.3,
    minPrice: 0.3,
  },
  {
    keywords: /\b(citron|orange|clementine|poire|kiwi|pamplemousse)\b/,
    pricePerKgOrL: 2.9,
    pricePerPiece: 0.45,
    minPrice: 0.4,
  },
  {
    keywords: /\b(avocat|mangue|fraise|framboise|myrtille)\b/,
    pricePerKgOrL: 6.5,
    pricePerPiece: 1.2,
    minPrice: 0.9,
  },
  {
    keywords: /\b(carotte|carottes)\b/,
    pricePerKgOrL: 1.6,
    pricePerPiece: 0.22,
    minPrice: 0.35,
  },
  {
    keywords: /\b(oignon|oignons|echalote|echalotes)\b/,
    pricePerKgOrL: 2.2,
    pricePerPiece: 0.22,
    minPrice: 0.2,
  },
  {
    keywords: /\b(ail)\b/,
    pricePerKgOrL: 7.5,
    pricePerPiece: 0.15,
    minPrice: 0.15,
  },
  {
    keywords: /\b(poireau|poireaux|courgette|courgettes|aubergine|concombre|poivron)\b/,
    pricePerKgOrL: 2.6,
    pricePerPiece: 0.65,
    minPrice: 0.5,
  },
  {
    keywords: /\b(potimarron|butternut|courge|brocoli|chou)\b/,
    pricePerKgOrL: 2.5,
    pricePerPiece: 1.85,
    minPrice: 0.9,
  },
  {
    keywords: /\b(champignon|champignons|epinard|epinards|haricot vert|haricots verts|petits pois|salade|tomate|tomates)\b/,
    pricePerKgOrL: 3.2,
    pricePerPiece: 0.5,
    minPrice: 0.5,
  },

  // --- VIANDE, VOLAILLE, CHARCUTERIE & POISSON ---
  {
    keywords: /\b(saumon|cabillaud|thon frais|truite|crevette|crevettes|poisson)\b/,
    pricePerKgOrL: 18.5,
    pricePerPiece: 2.6,
    minPrice: 1.8,
  },
  {
    keywords: /\b(thon)\b/,
    pricePerKgOrL: 11.5,
    pricePerPiece: 1.65,
    minPrice: 1.2,
  },
  {
    keywords: /\b(poulet|dinde|volaille)\b/,
    pricePerKgOrL: 11.5,
    pricePerPiece: 1.85,
    minPrice: 1.5,
  },
  {
    keywords: /\b(boeuf|steak|viande hachee|veau|porc|filet mignon|saucisse)\b/,
    pricePerKgOrL: 12.5,
    pricePerPiece: 1.65,
    minPrice: 1.5,
  },
  {
    keywords: /\b(jambon)\b/,
    pricePerKgOrL: 12.0,
    pricePerPiece: 0.6,
    minPrice: 0.6,
  },
  {
    keywords: /\b(lardon|lardons|bacon|chorizo)\b/,
    pricePerKgOrL: 9.5,
    pricePerPiece: 1.9,
    minPrice: 0.95,
  },

  // --- ÉPICERIE, PÂTES, RIZ, CONSERVES, BOULANGERIE ---
  {
    keywords: /\b(pate brisee|pate feuilletee|pate a pizza)\b/,
    pricePerKgOrL: 5.5,
    pricePerPiece: 1.25,
    minPrice: 1.1,
  },
  {
    keywords: /\b(coquillette|coquillettes|spaghetti|pates|tagliatelle|penne|lasagne|riz|semoule|quinoa|boulgour|ble)\b/,
    pricePerKgOrL: 1.95,
    pricePerPiece: 1.25,
    minPrice: 0.35,
  },
  {
    keywords: /\b(avoine|flocon|flocons|muesli|cereales)\b/,
    pricePerKgOrL: 2.6,
    pricePerPiece: 1.3,
    minPrice: 0.3,
  },
  {
    keywords: /\b(lentille|lentilles|pois chiche|pois chiches|haricot rouge|haricots rouges|mais)\b/,
    pricePerKgOrL: 3.1,
    pricePerPiece: 1.15,
    minPrice: 0.5,
  },
  {
    keywords: /\b(coulis|sauce tomate|tomates pelees|concentre de tomate)\b/,
    pricePerKgOrL: 2.8,
    pricePerPiece: 1.15,
    minPrice: 0.45,
  },
  {
    keywords: /\b(farine|sucre|maizena|fecule)\b/,
    pricePerKgOrL: 1.4,
    pricePerPiece: 1.2,
    minPrice: 0.2,
  },
  {
    keywords: /\b(chocolat)\b/,
    pricePerKgOrL: 11.5,
    pricePerPiece: 2.3,
    minPrice: 0.6,
  },
  {
    keywords: /\b(miel|sirop|confiture|pate a tartiner)\b/,
    pricePerKgOrL: 9.5,
    pricePerPiece: 2.8,
    minPrice: 0.25,
  },
  {
    keywords: /\b(pain|baguette|brioche|pain de mie|tortilla)\b/,
    pricePerKgOrL: 4.2,
    pricePerPiece: 1.2,
    minPrice: 0.9,
  },
  {
    keywords: /\b(huile|vinaigre|sauce soja|moutarde|mayonnaise|ketchup)\b/,
    pricePerKgOrL: 6.5,
    pricePerPiece: 1.9,
    minPrice: 0.2,
  },
  {
    keywords: /\b(bouillon|cube|curry|cannelle|paprika|cumin|herbes|epice|poivre|sel|levure|vanille|noix de muscade)\b/,
    pricePerKgOrL: 15.0,
    pricePerPiece: 0.25,
    minPrice: 0.15,
  },
];

/**
 * Calcule le prix réaliste d'une portion unique d'un ingrédient (ex: "80 g", "2 pièces", "1 boîte (400g)").
 */
function estimateSingleChunkPrice(
  entry: MarketPriceEntry,
  chunkStr: string
): number {
  const s = chunkStr.trim().toLowerCase();
  if (!s) return entry.pricePerPiece;

  const parenMatch = s.match(/^(\d+(?:[.,]\d+)?)?\s*[^(]*\(\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|dl|l)\b/i);
  if (parenMatch) {
    const outerCount = parenMatch[1] ? parseFloat(parenMatch[1].replace(',', '.')) : 1;
    const innerVal = parseFloat(parenMatch[2].replace(',', '.'));
    const innerUnit = parenMatch[3].toLowerCase();
    let kgOrL = innerVal;
    if (innerUnit === 'g' || innerUnit === 'gr' || innerUnit === 'ml') kgOrL = innerVal / 1000;
    else if (innerUnit === 'cl') kgOrL = innerVal / 100;
    else if (innerUnit === 'dl') kgOrL = innerVal / 10;
    const totalKgOrL = outerCount > 1 && kgOrL < 0.25 ? outerCount * kgOrL : kgOrL;
    return Math.max(entry.minPrice ?? 0.2, totalKgOrL * entry.pricePerKgOrL);
  }

  const numMatch = s.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!numMatch) {
    return entry.pricePerPiece;
  }

  const val = parseFloat(numMatch[1].replace(',', '.'));
  if (isNaN(val) || val <= 0) return entry.pricePerPiece;

  const unitRest = numMatch[2].trim();

  if (/^(g|gr|grammes?|ml|millilitres?)\b/i.test(unitRest)) {
    const kgOrL = val / 1000;
    return Math.max(entry.minPrice ?? 0.2, kgOrL * entry.pricePerKgOrL);
  }

  if (/^(cl|centilitres?)\b/i.test(unitRest)) {
    const kgOrL = val / 100;
    return Math.max(entry.minPrice ?? 0.2, kgOrL * entry.pricePerKgOrL);
  }

  if (/^(dl|decilitres?)\b/i.test(unitRest)) {
    const kgOrL = val / 10;
    return Math.max(entry.minPrice ?? 0.2, kgOrL * entry.pricePerKgOrL);
  }

  if (/^(kg|kilos?|kilogrammes?|l|litres?)\b/i.test(unitRest)) {
    return Math.max(entry.minPrice ?? 0.3, val * entry.pricePerKgOrL);
  }

  if (/^(c\.à\.s|cas|cuill[eè]res?\s+[aà]\s+soupe)/i.test(unitRest)) {
    const kgOrL = (val * 15) / 1000;
    return Math.max(entry.minPrice ?? 0.15, kgOrL * entry.pricePerKgOrL);
  }

  if (/^(c\.à\.c|cac|cuill[eè]res?\s+[aà]\s+caf[eé]|pinc[eé]e?s?|gousses?)/i.test(unitRest)) {
    const kgOrL = (val * 5) / 1000;
    return Math.max(entry.minPrice ?? 0.15, kgOrL * entry.pricePerKgOrL);
  }

  return Math.max(entry.minPrice ?? 0.25, val * entry.pricePerPiece);
}

/**
 * Estime le prix réaliste en supermarché français d'un ingrédient selon son nom et sa quantité totale.
 */
export function estimateIngredientPrice(
  ingredientName: string,
  amountStr: string = '1 pièce'
): number {
  const normName = normalizeIngredientText(ingredientName);

  const matchedEntry = FRENCH_SUPERMARKET_PRICES.find((entry) =>
    entry.keywords.test(normName)
  ) || {
    keywords: /.*/,
    pricePerKgOrL: 4.5,
    pricePerPiece: 1.4,
    minPrice: 0.4,
  };

  const chunks = (amountStr || '1 pièce').split('+').map((c) => c.trim()).filter(Boolean);
  const rawTotal = chunks.reduce(
    (sum, chunk) => sum + estimateSingleChunkPrice(matchedEntry, chunk),
    0
  );

  return Math.max(0.15, Math.round(rawTotal * 20) / 20);
}

/**
 * Répare les prix, corrige automatiquement les catégories erronées (ex: œufs ou bœuf mis en épicerie)
 * et fusionne les doublons existants dans la liste de courses.
 */
export function sanitizeShoppingItemsPrices<
  T extends {
    id?: string;
    name: string;
    category?: FoodCategory;
    quantity?: number;
    unit: string;
    estimatedPrice: number;
    checked?: boolean;
    source?: string;
    notes?: string;
  }
>(items: T[]): T[] {
  if (!Array.isArray(items)) return [];

  const mergedResult: T[] = [];
  const uncheckedIndexByKey = new Map<string, number>();

  for (const rawItem of items) {
    const canonical = getCanonicalShoppingIngredient(rawItem.name);
    // Corrige automatiquement la catégorie si l'aliment provenait d'une recette ou était mal classé en épicerie/autre
    const correctedCategory =
      rawItem.source === 'meal_plan' ||
      !rawItem.category ||
      rawItem.category === 'pantry' ||
      rawItem.category === 'other'
        ? canonical.category
        : rawItem.category;

    const cleanName =
      rawItem.source === 'meal_plan' ? canonical.displayName : rawItem.name;

    const realistic = estimateIngredientPrice(cleanName, rawItem.unit);
    const isBiasedPlaceholder =
      rawItem.source === 'meal_plan' ||
      Math.abs((rawItem.estimatedPrice || 0) - 11.7) < 0.15 ||
      Math.abs((rawItem.estimatedPrice || 0) - 1.7) < 0.06 ||
      Math.abs((rawItem.estimatedPrice || 0) - 2.1) < 0.06 ||
      (rawItem.estimatedPrice > realistic * 2.5 && rawItem.source !== 'manual');

    const normalizedItem: T = {
      ...rawItem,
      name: cleanName,
      category: correctedCategory,
      estimatedPrice: isBiasedPlaceholder ? realistic : rawItem.estimatedPrice,
    };

    if (!normalizedItem.checked) {
      const existingIdx = uncheckedIndexByKey.get(canonical.key);
      if (existingIdx !== undefined) {
        const existing = mergedResult[existingIdx];
        const combinedUnit = combineIngredientAmounts(existing.unit, normalizedItem.unit);
        mergedResult[existingIdx] = {
          ...existing,
          name: canonical.displayName,
          category: canonical.category,
          quantity: 1,
          unit: combinedUnit,
          estimatedPrice: estimateIngredientPrice(canonical.displayName, combinedUnit),
          notes:
            normalizedItem.notes && !existing.notes?.includes(normalizedItem.notes)
              ? `${existing.notes ? `${existing.notes} + ` : ''}${normalizedItem.notes}`
              : existing.notes,
        };
        continue;
      }
      uncheckedIndexByKey.set(canonical.key, mergedResult.length);
    }

    mergedResult.push(normalizedItem);
  }

  return mergedResult;
}

export interface RecipeCostBreakdown {
  /** Coût total du plat calibré pour les adultes du foyer */
  totalForHousehold: number;
  /** Coût par adulte pour ce repas */
  costPerPerson: number;
  /** Nombre d'adultes utilisé pour le calcul */
  servingsUsed: number;
  /** Détail du prix de chaque ingrédient calibré */
  ingredientsBreakdown: Array<{
    name: string;
    scaledAmount: string;
    price: number;
  }>;
}

/**
 * Calcule le coût réel d'une recette en additionnant le prix supermarché de chacun de ses ingrédients,
 * calibré pour le nombre d'adultes du foyer (`targetServings`).
 */
export function getRecipeCostBreakdown(
  recipe: Recipe | null | undefined,
  targetServings?: number
): RecipeCostBreakdown {
  if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    return {
      totalForHousehold: 0,
      costPerPerson: 0,
      servingsUsed: Math.max(1, targetServings || 2),
      ingredientsBreakdown: [],
    };
  }

  const baseServings = Math.max(1, recipe.servings || 4);
  const servingsUsed = Math.max(1, targetServings || baseServings);

  const ingredientsBreakdown = recipe.ingredients.map((ing) => {
    const scaledAmount = scaleIngredientAmount(
      ing.amount || '1 pièce',
      baseServings,
      servingsUsed
    );
    const price = estimateIngredientPrice(ing.name, scaledAmount);
    return {
      name: ing.name,
      scaledAmount,
      price,
    };
  });

  const rawTotal = ingredientsBreakdown.reduce((sum, item) => sum + item.price, 0);
  const totalForHousehold = Math.round(rawTotal * 20) / 20;
  const costPerPerson = Math.round((totalForHousehold / servingsUsed) * 100) / 100;

  return {
    totalForHousehold,
    costPerPerson,
    servingsUsed,
    ingredientsBreakdown,
  };
}

/**
 * Recalcule `estimatedCost` et `costPerServing` d'une recette (ou liste de recettes)
 * à partir de la somme réelle de ses ingrédients aux tarifs supermarché.
 */
export function recalculateRecipeWithRealPrices(recipe: Recipe): Recipe {
  const baseServings = Math.max(1, recipe.servings || 4);
  const breakdown = getRecipeCostBreakdown(recipe, baseServings);
  if (breakdown.totalForHousehold <= 0) return recipe;
  return {
    ...recipe,
    estimatedCost: breakdown.totalForHousehold,
    costPerServing: breakdown.costPerPerson,
  };
}

export function recalculateRecipesListWithRealPrices(recipes: Recipe[]): Recipe[] {
  if (!Array.isArray(recipes)) return [];
  return recipes.map(recalculateRecipeWithRealPrices);
}

/**
 * Catalogue des enseignes Drive françaises avec URL de recherche calibrée par produit.
 */
export const DRIVE_BRANDS_CATALOG: Record<
  DriveBrandCode,
  {
    code: DriveBrandCode;
    name: string;
    shortName: string;
    homeUrl: string;
    buildSearchUrl: (query: string) => string;
  }
> = {
  leclerc: {
    code: 'leclerc',
    name: 'E.Leclerc Drive',
    shortName: 'Leclerc Drive',
    homeUrl: 'https://www.leclercdrive.fr',
    buildSearchUrl: (query: string) =>
      `https://www.leclercdrive.fr/recherche.aspx?TexteRecherche=${encodeURIComponent(query.trim())}`,
  },
  carrefour: {
    code: 'carrefour',
    name: 'Carrefour Drive',
    shortName: 'Carrefour',
    homeUrl: 'https://www.carrefour.fr/courses-en-ligne',
    buildSearchUrl: (query: string) =>
      `https://www.carrefour.fr/s?q=${encodeURIComponent(query.trim())}`,
  },
  intermarche: {
    code: 'intermarche',
    name: 'Intermarché Drive',
    shortName: 'Intermarché',
    homeUrl: 'https://www.intermarche.com',
    buildSearchUrl: (query: string) =>
      `https://www.intermarche.com/recherche/${encodeURIComponent(query.trim())}`,
  },
  super_u: {
    code: 'super_u',
    name: 'Courses U Drive',
    shortName: 'Courses U',
    homeUrl: 'https://www.coursesu.com',
    buildSearchUrl: (query: string) =>
      `https://www.coursesu.com/search?q=${encodeURIComponent(query.trim())}`,
  },
  auchan: {
    code: 'auchan',
    name: 'Auchan Drive',
    shortName: 'Auchan',
    homeUrl: 'https://www.auchan.fr',
    buildSearchUrl: (query: string) =>
      `https://www.auchan.fr/recherche?text=${encodeURIComponent(query.trim())}`,
  },
  chronodrive: {
    code: 'chronodrive',
    name: 'Chronodrive',
    shortName: 'Chronodrive',
    homeUrl: 'https://www.chronodrive.com',
    buildSearchUrl: (query: string) =>
      `https://www.chronodrive.com/search/${encodeURIComponent(query.trim())}`,
  },
};

/**
 * Suggestions rapides de formats Drive (E.Leclerc Marque Repère, Bio Village, conditionnements)
 * adaptées à l'ingrédient pour cibler le bon article dès la première recherche.
 */
const SPECIFIC_DRIVE_FORMAT_SUGGESTIONS: Record<string, string[]> = {
  oeufs: [
    'Plein air boîte x12',
    'Plein air boîte x6',
    'Bio Village x6',
    'Bio Village x12',
    'Marque Repère x12',
  ],
  lait: [
    'Demi-écrémé pack 6x1L',
    'Demi-écrémé Bio pack 6x1L',
    'Bouteille 1L demi-écrémé',
    'Entier bouteille 1L',
    'Sans lactose Matin Léger',
  ],
  beurre: [
    'Doux plaquette 250g',
    'Demi-sel plaquette 250g',
    'Tendre à tartiner 250g',
    'Bio Village doux 250g',
    'Marque Repère 250g',
  ],
  creme_fraiche: [
    'Épaisse 30% pot 20cl',
    'Épaisse pot familial 50cl',
    'Liquide entière 3x20cl',
    'Légère 15% 20cl',
    'Marque Repère',
  ],
  emmental_rape: [
    'Sachet 200g râpé',
    'Lot 3x200g Marque Repère',
    'Format familial 500g',
    'Bio Village 150g',
    'Comté râpé 150g',
  ],
  mozzarella: [
    'Boule 125g Marque Repère',
    'Lot 2x125g',
    'Spéciale cuisine / râpée',
    'Bio Village 125g',
  ],
  fromage_frais: [
    'Nature pot 150g',
    'Format familial 300g',
    'Carré frais x8',
    'Marque Repère',
  ],
  poulet: [
    'Filets barquette x4 (500g)',
    'Filets Label Rouge',
    'Aiguillettes 400g',
    'Bio Village',
    'Marque Repère',
  ],
  boeuf_hache: [
    'Steaks hachés 5% MG x4',
    'Pur bœuf 5% barquette 350g',
    'Surgelé pur bœuf x10',
    'Origine France',
  ],
  jambon_blanc: [
    'Sans couenne 4 tranches',
    'Sans nitrites 4 tranches',
    'Format familial 6 tranches',
    'Bio Village 4 tranches',
    'Marque Repère',
  ],
  saumon: [
    '2 pavés frais sans arêtes',
    '4 pavés format familial',
    'Pavés surgelés x4',
    'Bio / Écosse',
  ],
  cabillaud: [
    '2 dos de cabillaud frais',
    'Filets sans arêtes 400g',
    'Dos surgelés x4',
    'Marque Repère',
  ],
  pates: [
    'Coquillettes paquet 500g',
    'Spaghettis paquet 500g',
    'Format familial 1kg',
    'Cuisson rapide 3 min',
    'Turini Marque Repère',
  ],
  tagliatelles: [
    'Fraîches aux œufs 350g',
    'Sèches paquet 500g',
    'Marque Repère',
    'Bio Village',
  ],
  riz: [
    'Basmati paquet 500g',
    'Basmati format 1kg',
    'Sachets cuisson 4x125g',
    'Complet Bio 500g',
    'Marque Repère',
  ],
  gnocchis: [
    'À poêler sachet 300g',
    'Format familial 600g',
    'Marque Repère',
  ],
  coulis_tomate: [
    'Purée de tomate brique 500g',
    'Lot 3x200g Marque Repère',
    'Coulis Bio Village',
    'Pulpe fine en dés 400g',
  ],
  carottes: [
    'Sachet 1kg France',
    'Bio Village 1kg',
    'Vrac 500g',
    'Râpées prêtes à l’emploi',
  ],
  pommes_de_terre: [
    'Filet 1.5kg vapeur/gratin',
    'Grenailles sachet 750g',
    'Filet 2.5kg familial',
    'Bio Village 1kg',
  ],
  pommes: [
    'Gala sachet 1kg',
    'Golden sachet 1.5kg',
    'Bio Village 4 pièces',
    'Origine France',
  ],
  bananes: [
    'Régime 5-6 pièces',
    'Bio équitable x5',
    'Origine Antilles',
  ],
  pain_de_mie: [
    'Nature grandes tranches',
    'Complet sans croûte',
    'Épi d’Or Marque Repère',
    'Bio Village',
  ],
  tortillas: [
    'Blé souples x8 grandes',
    'Blé complet x6',
    'Marque Repère x8',
  ],
};

export function getSmartDriveFormatSuggestions(
  productName: string,
  category?: FoodCategory
): string[] {
  const canonical = getCanonicalShoppingIngredient(productName);
  if (SPECIFIC_DRIVE_FORMAT_SUGGESTIONS[canonical.key]) {
    return SPECIFIC_DRIVE_FORMAT_SUGGESTIONS[canonical.key];
  }
  const cat = category || canonical.category;
  switch (cat) {
    case 'vegetables':
    case 'fruits':
      return ['Origine France', 'Sachet 1kg', 'Vrac 500g', 'Bio Village'];
    case 'dairy':
      return ['Marque Repère', 'Bio Village', 'Format familial', 'Pack x4'];
    case 'meat_fish':
      return ['Barquette familiale', 'Origine France', 'Label Rouge', 'Marque Repère'];
    case 'bakery':
      return ['Tranché', 'Complet', 'Marque Repère', 'Bio Village'];
    case 'baby_care':
      return ['Mots d’Enfants Leclerc', 'Maxi Pack', 'Hypoallergénique', 'Bio'];
    case 'household':
    case 'hygiene':
      return ['Grand format Éco', 'Marque Repère', 'Éco-recharge', 'Hypoallergénique'];
    case 'frozen':
      return ['Sachet 1kg', 'Marque Repère', 'Bio Village', 'Portions'];
    default:
      return ['Marque Repère', 'Format familial', 'Bio Village', 'Paquet 500g'];
  }
}

/**
 * Construit le terme de recherche optimisé pour E.Leclerc Drive / supermarché
 * en combinant le nom canonique propre et la précision Drive mémorisée par l'utilisateur.
 */
export function buildOptimizedDriveQuery(
  rawItemName: string,
  driveSpecs?: Record<string, string>
): {
  canonicalKey: string;
  cleanName: string;
  savedSpec: string;
  fullQuery: string;
} {
  const canonical = getCanonicalShoppingIngredient(rawItemName);
  const savedSpec = (driveSpecs && driveSpecs[canonical.key] ? driveSpecs[canonical.key] : '').trim();
  const baseName = canonical.displayName
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const fullQuery = savedSpec ? `${baseName} ${savedSpec}`.trim() : baseName;
  return {
    canonicalKey: canonical.key,
    cleanName: canonical.displayName,
    savedSpec,
    fullQuery,
  };
}

export const DRIVE_ANDROID_PACKAGES: Record<DriveBrandCode, string> = {
  leclerc: 'com.infomil.leclercdrive',
  carrefour: 'com.carrefour.fid.android',
  intermarche: 'com.intermarche.mobile.courses',
  super_u: 'com.systemeu.coursesu',
  auchan: 'fr.auchan.android.application',
  chronodrive: 'com.chronodrive.android',
};

export const LECLERC_DRIVE_STORE_PRESETS: Array<{
  label: string;
  postalCode: string;
  city: string;
  url: string;
}> = [
  {
    label: 'E.Leclerc Drive Vitré (35500)',
    postalCode: '35500',
    city: 'Vitré',
    url: 'https://www.leclercdrive.fr/region-bretagne/vitre/drive-vitre.aspx',
  },
  {
    label: 'E.Leclerc Drive Rennes - St Grégoire (35760)',
    postalCode: '35760',
    city: 'Saint-Grégoire',
    url: 'https://www.leclercdrive.fr/region-bretagne/rennes-saint-gregoire/drive-rennes-saint-gregoire.aspx',
  },
  {
    label: 'E.Leclerc Drive Rennes - Cleunay (35000)',
    postalCode: '35000',
    city: 'Rennes',
    url: 'https://www.leclercdrive.fr/region-bretagne/rennes/drive-rennes-cleunay.aspx',
  },
  {
    label: 'E.Leclerc Drive Châteaugiron (35410)',
    postalCode: '35410',
    city: 'Châteaugiron',
    url: 'https://www.leclercdrive.fr/region-bretagne/chateaugiron/drive-chateaugiron.aspx',
  },
  {
    label: 'E.Leclerc Drive Fougères (35300)',
    postalCode: '35300',
    city: 'Fougères',
    url: 'https://www.leclercdrive.fr/region-bretagne/fougeres/drive-fougeres.aspx',
  },
  {
    label: 'E.Leclerc Drive Laval (53000)',
    postalCode: '53000',
    city: 'Laval',
    url: 'https://www.leclercdrive.fr/region-pays-de-la-loire/laval/drive-laval.aspx',
  },
];

/**
 * Extrait l'URL racine du magasin E.Leclerc Drive à partir d'un nom de ville (ex: "Vitré", "35500")
 * ou de n'importe quel lien collé par l'utilisateur.
 */
export function normalizeLeclercStoreUrl(rawInput?: string): string {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return '';

  // 1. Check first if the user pasted a full or partial URL containing /magasin-XXXX
  if (trimmed.includes('leclercdrive') || trimmed.includes('/magasin-')) {
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : trimmed.startsWith('/magasin-')
        ? `https://www.leclercdrive.fr${trimmed}`
        : `https://${trimmed}`;
      const url = new URL(withProtocol);
      if (url.hostname.toLowerCase().includes('leclercdrive')) {
        const magMatch = url.pathname.match(/(\/magasin-[^/]+)/i);
        if (magMatch) {
          return `${url.origin}${magMatch[1]}`.replace(/\.aspx$/i, '');
        }
        if (/\/region-[^/]+\/[^/]+/i.test(url.pathname)) {
          return `${url.origin}${url.pathname}`;
        }
      }
    } catch {
      // continue to city/postal code matching
    }
  }

  const lower = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (lower.includes('vitre') || lower.includes('35500')) {
    return 'https://www.leclercdrive.fr/region-bretagne/vitre/drive-vitre.aspx';
  }
  for (const preset of LECLERC_DRIVE_STORE_PRESETS) {
    const presetCity = preset.city
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (lower === preset.postalCode || lower === presetCity) {
      return preset.url;
    }
  }

  return '';
}

/**
 * Construit un lien vers la passerelle top-level `/api/drive/launch` permettant de sortir
 * de l'iframe sandboxée (avec target="_blank") et de déclencher l'ouverture native de l'application
 * Android `com.infomil.leclercdrive` ou du magasin `leclercdrive.fr`.
 */
export function buildAndroidDriveAppIntentUrl(
  brandCode: DriveBrandCode = 'leclerc',
  targetWebUrl?: string,
  query?: string,
  qtyLabel?: string,
  serializedCartItems?: string
): string {
  const cleanQ = (query || '').trim();
  const fallback =
    targetWebUrl && targetWebUrl.includes('leclercdrive.fr')
      ? targetWebUrl
      : brandCode === 'leclerc'
      ? 'https://www.leclercdrive.fr/region-bretagne/vitre/drive-vitre.aspx'
      : DRIVE_BRANDS_CATALOG[brandCode]?.homeUrl || 'https://www.leclercdrive.fr';

  const params = new URLSearchParams();
  params.set('brand', brandCode);
  if (cleanQ) params.set('q', cleanQ);
  if (qtyLabel) params.set('qty', qtyLabel);
  if (serializedCartItems) params.set('panier', serializedCartItems);
  params.set('web', fallback);
  return `/api/drive/launch?${params.toString()}`;
}

/**
 * Construit l'URL du panier E.Leclerc Drive en concaténant les spécifications produits (`driveProductSpecs`)
 * et les quantités des articles non cochés (`!item.checked`), tout en préparant les mots-clés propres
 * individuels (sans quantités parasites) pour le presse-papiers du clavier mobile.
 */
export function buildLeclercCartOrderUrl(
  items: Array<{
    id?: string;
    name: string;
    quantity: number;
    unit?: string;
    checked?: boolean;
  }>,
  driveSpecs?: Record<string, string>,
  leclercStoreUrl?: string
): {
  cartUrl: string;
  launcherBridgeUrl: string;
  concatenatedSpecsAndQuantities: string;
  firstCleanQuery: string;
  cleanIndividualQueries: string[];
  uncheckedCount: number;
} {
  const unchecked = items.filter((item) => !item.checked);
  const targetItems = unchecked.length > 0 ? unchecked : items;

  const formattedEntries = targetItems.map((item) => {
    const qInfo = buildOptimizedDriveQuery(item.name, driveSpecs);
    const specText = (
      driveSpecs?.[qInfo.canonicalKey] ||
      driveSpecs?.[item.name] ||
      qInfo.savedSpec ||
      ''
    ).trim();
    const productWithSpec = specText
      ? `${qInfo.cleanName} ${specText}`.trim()
      : qInfo.fullQuery;
    const qtyNum = Math.max(1, Number(item.quantity) || 1);
    const unitStr = (item.unit || '').trim();
    const qtyFormatted = /^\d/.test(unitStr)
      ? qtyNum > 1
        ? `${qtyNum} × ${unitStr}`
        : unitStr
      : unitStr && !/^pi[eè]ce/i.test(unitStr)
      ? `${qtyNum} ${unitStr}`
      : `x${qtyNum}`;
    return {
      query: productWithSpec,
      qty: qtyFormatted,
      rawQty: qtyNum,
      combined: `${productWithSpec} (${qtyFormatted})`,
    };
  });

  const concatenatedSpecsAndQuantities = formattedEntries
    .map((e) => e.combined)
    .join(', ');

  const cleanIndividualQueries = formattedEntries.map((e) => e.query);
  const firstCleanQuery = cleanIndividualQueries[0] || '';

  const cleanStore = normalizeLeclercStoreUrl(leclercStoreUrl);
  const isCatalogMagasinUrl = Boolean(cleanStore && cleanStore.includes('/magasin-'));
  const baseStore = isCatalogMagasinUrl
    ? `${cleanStore.replace(/\.aspx$/i, '')}/recherche.aspx`
    : cleanStore || 'https://www.leclercdrive.fr/region-bretagne/vitre/drive-vitre.aspx';

  // Important: drive-vitre.aspx redirects to PageDerreur.aspx if unknown ?query params are sent to the server; use # hash on presentation pages
  const separator = isCatalogMagasinUrl ? (baseStore.includes('?') ? '&' : '?') : '#';
  const cartUrl = `${baseStore}${separator}TexteRecherche=${encodeURIComponent(
    firstCleanQuery
  )}&panier=${encodeURIComponent(concatenatedSpecsAndQuantities)}`;

  const compactJson = JSON.stringify(
    formattedEntries.map((e) => ({ q: e.query, qty: e.qty }))
  );
  const launcherBridgeUrl = buildAndroidDriveAppIntentUrl(
    'leclerc',
    cartUrl,
    firstCleanQuery,
    formattedEntries[0]?.qty || '',
    compactJson
  );

  return {
    cartUrl,
    launcherBridgeUrl,
    concatenatedSpecsAndQuantities,
    firstCleanQuery,
    cleanIndividualQueries,
    uncheckedCount: unchecked.length,
  };
}

/**
 * Construit le lien le plus direct possible vers l'application Leclerc DRIVE (`com.infomil.leclercdrive`)
 * ou le magasin `leclercdrive.fr` (sans jamais rediriger vers le portail général www.e.leclerc).
 */
export function buildDirectDriveItemUrl(
  rawItemName: string,
  brandCode: DriveBrandCode = 'leclerc',
  driveSpecs?: Record<string, string>,
  driveProductUrls?: Record<string, string>,
  leclercStoreUrl?: string,
  qtyLabel?: string
): {
  url: string;
  androidAppIntentUrl: string;
  isDirectProductUrl: boolean;
  isCustomStoreUrl: boolean;
  queryInfo: ReturnType<typeof buildOptimizedDriveQuery>;
} {
  const queryInfo = buildOptimizedDriveQuery(rawItemName, driveSpecs);
  const directSavedUrl = (driveProductUrls?.[queryInfo.canonicalKey] || '').trim();

  if (directSavedUrl && /^https?:\/\//i.test(directSavedUrl)) {
    return {
      url: directSavedUrl,
      androidAppIntentUrl: buildAndroidDriveAppIntentUrl(
        brandCode,
        directSavedUrl,
        queryInfo.fullQuery,
        qtyLabel
      ),
      isDirectProductUrl: true,
      isCustomStoreUrl: false,
      queryInfo,
    };
  }

  if (brandCode === 'leclerc') {
    const cleanStore = normalizeLeclercStoreUrl(leclercStoreUrl);
    if (cleanStore && cleanStore.includes('/magasin-')) {
      const storeSearchUrl = `${cleanStore.replace(/\.aspx$/i, '')}/recherche.aspx?TexteRecherche=${encodeURIComponent(
        queryInfo.fullQuery.trim()
      )}`;
      return {
        url: storeSearchUrl,
        androidAppIntentUrl: buildAndroidDriveAppIntentUrl(
          brandCode,
          storeSearchUrl,
          queryInfo.fullQuery,
          qtyLabel
        ),
        isDirectProductUrl: false,
        isCustomStoreUrl: true,
        queryInfo,
      };
    }
    const baseStore =
      cleanStore || 'https://www.leclercdrive.fr/region-bretagne/vitre/drive-vitre.aspx';
    const storeUrlWithSearch = `${baseStore}#TexteRecherche=${encodeURIComponent(
      queryInfo.fullQuery.trim()
    )}`;
    return {
      url: storeUrlWithSearch,
      androidAppIntentUrl: buildAndroidDriveAppIntentUrl(
        brandCode,
        storeUrlWithSearch,
        queryInfo.fullQuery,
        qtyLabel
      ),
      isDirectProductUrl: false,
      isCustomStoreUrl: Boolean(cleanStore),
      queryInfo,
    };
  }

  const brand = DRIVE_BRANDS_CATALOG[brandCode] || DRIVE_BRANDS_CATALOG.leclerc;
  const searchUrl = brand.buildSearchUrl(queryInfo.fullQuery);
  return {
    url: searchUrl,
    androidAppIntentUrl: buildAndroidDriveAppIntentUrl(
      brandCode,
      searchUrl,
      queryInfo.fullQuery,
      qtyLabel
    ),
    isDirectProductUrl: false,
    isCustomStoreUrl: false,
    queryInfo,
  };
}

/**
 * Formate la liste de courses pour un partage direct vers le téléphone (Notes iOS, Google Keep, WhatsApp, Courses E.Leclerc).
 */
export function formatShoppingListForLeclercExport(
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    checked?: boolean;
  }>,
  driveSpecs?: Record<string, string>,
  brandName: string = 'E.Leclerc Drive'
): string {
  const activeItems = items.filter((i) => !i.checked);
  const sourceList = activeItems.length > 0 ? activeItems : items;
  const lines = sourceList.map((item) => {
    const qInfo = buildOptimizedDriveQuery(item.name, driveSpecs);
    const qtyLabel = /^\d/.test((item.unit || '').trim())
      ? item.quantity > 1
        ? `${item.quantity} × (${item.unit})`
        : item.unit
      : `${item.quantity} ${item.unit}`;
    return `☐ ${qInfo.fullQuery} — ${qtyLabel}`;
  });
  return `🛒 Liste ${brandName} (${sourceList.length} articles)\n\n${lines.join('\n')}`;
}

/**
 * Génère un contenu CSV (séparateur point-virgule compatible Excel / extensions Drive)
 * à partir de la liste de courses actuelle.
 */
export function formatShoppingListAsCsv(
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    category?: string;
    checked?: boolean;
  }>,
  driveSpecs?: Record<string, string>
): string {
  const activeItems = items.filter((i) => !i.checked);
  const sourceList = activeItems.length > 0 ? activeItems : items;
  const header = 'Recherche_Leclerc_Drive;Produit;Quantite;Unite;Format_Prefere;Statut';
  const rows = sourceList.map((item) => {
    const qInfo = buildOptimizedDriveQuery(item.name, driveSpecs);
    const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    return [
      esc(qInfo.fullQuery),
      esc(item.name),
      String(item.quantity || 1),
      esc(item.unit || 'pièce(s)'),
      esc(qInfo.savedSpec || ''),
      item.checked ? 'Pris' : 'A_acheter',
    ].join(';');
  });
  return `\uFEFF${header}\n${rows.join('\n')}`;
}

/**
 * Génère un Robot Auto-Panier autonome qui injecte la liste de courses directement DANS le site mobile E.Leclerc Drive (`leclercdrive.fr`).
 * Fonctionne 100% sur téléphone sans iframe (car leclercdrive.fr bloque les iframes via X-Frame-Options: DENY)
 * et sans forger d'URL .aspx/recherche.aspx qui provoquerait PageDerreur.aspx.
 */
export function buildLeclercInPageAssistantScript(
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    checked?: boolean;
  }>,
  driveSpecs?: Record<string, string>
): {
  bookmarkletHref: string;
  rawScript: string;
  itemsCount: number;
} {
  const unchecked = items.filter((i) => !i.checked);
  const targetList = (unchecked.length > 0 ? unchecked : items).map((item) => {
    const q = buildOptimizedDriveQuery(item.name, driveSpecs);
    const unitStr = (item.unit || '').trim();
    const qty = /^\d/.test(unitStr)
      ? item.quantity > 1
        ? `${item.quantity}x (${unitStr})`
        : unitStr
      : `${item.quantity} ${unitStr}`;
    return {
      q: q.fullQuery,
      n: item.name,
      u: qty,
      c: Math.max(1, Math.round(item.quantity || 1)),
    };
  });

  const serialized = JSON.stringify(targetList);

  const rawScript = `(function(){
var L=${serialized};
try{localStorage.setItem('doudous_leclerc_list',JSON.stringify(L));}catch(e){}
var idx=parseInt(localStorage.getItem('doudous_leclerc_idx')||'0',10);
if(isNaN(idx)||idx<0||idx>=L.length)idx=0;
var statusMsg='';
var old=document.getElementById('doudous-leclerc-bar');
if(old)old.remove();
var bar=document.createElement('div');
bar.id='doudous-leclerc-bar';
bar.style.cssText='position:fixed;bottom:12px;right:12px;left:12px;max-width:480px;margin:0 auto;z-index:2147483647;background:#0f172a;color:#fff;padding:14px 16px;border-radius:18px;box-shadow:0 20px 40px rgba(0,0,0,0.65);font-family:system-ui,-apple-system,sans-serif;border:2px solid #2563eb;';
function findSearchInput(){
  return document.querySelector('input[name*="TexteRecherche"],input[id*="TexteRecherche"],input[id*="txtRecherche"],input[type="search"],input[placeholder*="besoin"],input[placeholder*="Rechercher"],input[placeholder*="chercher"],input[class*="Recherche"],input[class*="search"]');
}
function fillSearchInput(query,submitNow){
  try{if(navigator.clipboard)navigator.clipboard.writeText(query);}catch(e){}
  var inp=findSearchInput();
  if(!inp){
    var toggle=document.querySelector('[id*="OuvrirRecherche"],[class*="search-toggle"],[aria-label*="Rechercher"],[title*="Rechercher"]');
    if(toggle){try{toggle.click();}catch(e){}}
    inp=findSearchInput();
  }
  if(inp){
    try{inp.scrollIntoView({behavior:'smooth',block:'center'});}catch(e){}
    inp.focus();
    inp.value=query;
    inp.dispatchEvent(new Event('focus',{bubbles:true}));
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    inp.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));
    inp.dispatchEvent(new KeyboardEvent('keyup',{key:'a',bubbles:true}));
    inp.dispatchEvent(new Event('change',{bubbles:true}));
    if(submitNow){
      var btn=inp.closest('form')?inp.closest('form').querySelector('button,input[type="submit"],a[id*="Recherche"]'):document.querySelector('[id*="btnRecherche"],button[type="submit"]');
      if(btn){btn.click();return true;}
      if(inp.form){inp.form.submit();return true;}
    }
    statusMsg='✓ « '+query+' » écrit dans la barre de recherche en haut (et copié) !';
    render();
    return true;
  }
  var chooseBtn=document.querySelector('a[href*="/magasin-"],a.btn-drive,a[class*="choisir"]');
  if(chooseBtn){
    statusMsg='👉 Ouverture des rayons du magasin... Relancez le favori Robot une fois dans les rayons !';
    render();
    setTimeout(function(){chooseBtn.click();},350);
    return false;
  }
  statusMsg='📋 « '+query+' » copié ! Collez-le dans la barre de recherche Leclerc.';
  render();
  return false;
}
function autoAddFirst(){
  var addBtn=document.querySelector('.divWCRS310_BoutonPlus,[id*="btnPlus"],[class*="BoutonPlus"],button[class*="ajout"],a[class*="ajout"],button[title*="Ajouter"],.btn-ajouter,[data-testid*="add"]');
  if(addBtn){addBtn.click();return true;}
  return false;
}
function render(){
  if(idx>=L.length){
    bar.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><strong style="color:#34d399;font-size:13px;">✓ Liste terminée ('+L.length+'/'+L.length+') !</strong><button id="dl-reset" style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-weight:700;font-size:11px;">Recommencer</button><button id="dl-close" style="background:#334155;color:#fff;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;font-weight:700;font-size:11px;">Fermer</button></div>';
    document.getElementById('dl-reset').onclick=function(){idx=0;localStorage.setItem('doudous_leclerc_idx','0');render();fillSearchInput(L[0].q,false);};
    document.getElementById('dl-close').onclick=function(){bar.remove();};
    return;
  }
  var cur=L[idx];
  var hasInp=Boolean(findSearchInput());
  bar.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:11px;color:#93c5fd;font-weight:700;"><span>🛒 ASSISTANT PANIER LECLERC ('+(idx+1)+'/'+L.length+')</span><div><button id="dl-prev" style="background:#1e293b;color:#cbd5e1;border:none;border-radius:6px;padding:2px 7px;margin-right:4px;cursor:pointer;font-size:11px;">◀</button><button id="dl-close" style="background:transparent;color:#94a3b8;border:none;cursor:pointer;font-size:12px;">✕</button></div></div>'+
  '<div style="font-size:15px;font-weight:800;margin-bottom:2px;">'+cur.q+'</div>'+
  '<div style="font-size:12px;color:#cbd5e1;margin-bottom:8px;">Quantité : <strong style="color:#34d399;">'+cur.u+'</strong></div>'+
  (statusMsg?'<div style="font-size:11px;color:#fde047;background:rgba(254,240,138,0.12);padding:5px 8px;border-radius:8px;margin-bottom:8px;">'+statusMsg+'</div>':'')+
  (!hasInp?'<button id="dl-enter-store" style="width:100%;margin-bottom:6px;background:#d97706;color:#fff;border:none;border-radius:10px;padding:10px;font-weight:800;font-size:12px;cursor:pointer;">👉 1. Entrer d’abord dans les rayons (« Choisir ce drive »)</button>':'')+
  '<div style="display:flex;gap:6px;flex-wrap:wrap;">'+
  '<button id="dl-fill" style="flex:1;background:#2563eb;color:#fff;border:none;border-radius:10px;padding:10px 8px;font-weight:800;font-size:12px;cursor:pointer;">🔍 Écrire dans la recherche</button>'+
  '<button id="dl-add-next" style="flex:1;background:#059669;color:#fff;border:none;border-radius:10px;padding:10px 8px;font-weight:800;font-size:12px;cursor:pointer;">+ Panier & Suivant →</button>'+
  '<button id="dl-next" style="background:#334155;color:#fff;border:none;border-radius:10px;padding:10px 10px;font-weight:700;font-size:12px;cursor:pointer;">Suivant →</button>'+
  '</div>';
  document.getElementById('dl-close').onclick=function(){bar.remove();};
  document.getElementById('dl-prev').onclick=function(){if(idx>0){idx--;localStorage.setItem('doudous_leclerc_idx',String(idx));statusMsg='';render();fillSearchInput(L[idx].q,false);}};
  var enterBtn=document.getElementById('dl-enter-store');
  if(enterBtn){
    enterBtn.onclick=function(){
      var chooseBtn=document.querySelector('a[href*="/magasin-"],a.btn-drive,a[class*="choisir"]');
      if(chooseBtn)chooseBtn.click();
    };
  }
  document.getElementById('dl-fill').onclick=function(){fillSearchInput(cur.q,false);};
  document.getElementById('dl-next').onclick=function(){
    idx++;
    localStorage.setItem('doudous_leclerc_idx',String(idx));
    statusMsg='';
    render();
    if(idx<L.length)fillSearchInput(L[idx].q,false);
  };
  document.getElementById('dl-add-next').onclick=function(){
    var added=autoAddFirst();
    idx++;
    localStorage.setItem('doudous_leclerc_idx',String(idx));
    statusMsg=added?'✓ Produit ajouté au panier ! Passage au suivant :':'✓ Passage au produit suivant :';
    render();
    if(idx<L.length)setTimeout(function(){fillSearchInput(L[idx].q,false);},250);
  };
}
document.body.appendChild(bar);
render();
if(findSearchInput()&&idx<L.length){fillSearchInput(L[idx].q,false);}
})();`;

  const compact = rawScript.replace(/\n\s*/g, '');
  const utf8Bytes = encodeURIComponent(compact).replace(
    /%([0-9A-F]{2})/g,
    (_, p1) => String.fromCharCode(parseInt(p1, 16))
  );
  const base64Payload =
    typeof btoa === 'function'
      ? btoa(utf8Bytes)
      : Buffer.from(compact, 'utf-8').toString('base64');
  // 100% space-free & special-char-free JS expression so Chrome Android's address bar never treats spaces as a Google Search
  const spaceFreeRunner = `eval(decodeURIComponent(escape(atob('${base64Payload}'))));void(0);`;
  return {
    bookmarkletHref: `javascript:${spaceFreeRunner}`,
    rawScript: spaceFreeRunner,
    itemsCount: targetList.length,
  };
}



