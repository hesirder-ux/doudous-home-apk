/**
 * FICHIER UNIQUE DE CONFIGURATION DES SÉLECTEURS CSS E.LECLERC DRIVE
 * ------------------------------------------------------------------
 * Tous les sélecteurs DOM du site E.Leclerc Drive (`leclercdrive.fr` et `fdXX-courses.leclercdrive.fr`)
 * sont isolés ici. Si E.Leclerc modifie ses classes HTML (WCRS), il suffit de mettre à jour ce fichier.
 */

export interface LeclercSelectorsConfig {
  /** Sélecteurs indiquant que l'utilisateur est bien entré dans un Drive (catalogue /magasin-xxx) */
  storeCatalogUrlPattern: string;
  /** Bouton "Choisir ce drive" sur la page régionale d'un magasin */
  chooseStoreButton: string;
  /** Indicateur ou bouton de connexion compte client */
  loginButtonOrIndicator: string;

  /** Bouton loupe sur mobile qui déplie la barre de recherche si elle est repliée */
  mobileSearchToggle: string;
  /** Champ texte de recherche produit */
  searchInput: string;
  /** Bouton de validation de la recherche */
  searchSubmitButton: string;

  /** Conteneur d'une carte produit dans la grille des résultats de recherche */
  productCard: string;
  /** Attributs HTML possibles contenant l'identifiant unique (SKU/ID) du produit */
  productIdAttributes: string[];
  /** Titre / libellé complet du produit dans la carte */
  productTitle: string;
  /** Prix affiché du produit */
  productPrice: string;
  /** Prix au kilo / au litre (format) */
  productUnitPrice: string;
  /** Image miniature du produit */
  productImage: string;

  /** Bouton "+" pour ajouter 1 unité du produit au panier (ou incrémenter la quantité) */
  addToCartPlusButton: string;
  /** Élément ou classe indiquant que le produit est indisponible / en rupture de stock */
  outOfStockIndicator: string;
  /** Badge affichant la quantité actuelle de cet article déjà dans le panier */
  currentQuantityInCartBadge: string;

  /** Bouton d'accès au panier (pour que l'utilisateur valide lui-même à la fin) */
  openCartButton: string;

  /** Temporisations humaines (en millisecondes) pour respecter le serveur sans jamais brusquer DataDome */
  timing: {
    /** Pause minimale entre deux clics ou actions (1.1s) */
    minActionDelayMs: number;
    /** Pause maximale entre deux clics ou actions (1.9s) */
    maxActionDelayMs: number;
    /** Délai d'attente après soumission d'une recherche pour laisser le DOM s'afficher */
    searchResultsWaitMs: number;
  };
}

export const DEFAULT_LECLERC_SELECTORS: LeclercSelectorsConfig = {
  storeCatalogUrlPattern: '/magasin-',
  chooseStoreButton:
    'a[href*="/magasin-"], a.btn-drive, a[class*="choisir"], button[class*="choisir"]',
  loginButtonOrIndicator:
    '[id*=" LienConnexion"], [class*="connexion"], a[href*="connexion"], [data-testid*="login"]',

  mobileSearchToggle:
    '[id*="OuvrirRecherche"], [class*="search-toggle"], [aria-label*="Rechercher"], [title*="Rechercher"]',
  searchInput:
    'input[name*="TexteRecherche"], input[id*="TexteRecherche"], input[id*="txtRecherche"], input[type="search"], input[placeholder*="besoin"], input[placeholder*="Rechercher"], input[placeholder*="chercher"]',
  searchSubmitButton:
    '[id*="btnRecherche"], form button[type="submit"], form input[type="submit"], a[id*="Recherche"]',

  productCard:
    'li.liWCRS310_Product, div.divWCRS310_Product, article[class*="Product"], [data-testid*="product-card"], .product-item, .WCRS310_Product',
  productIdAttributes: [
    'data-id-produit',
    'data-product-id',
    'data-sku',
    'data-code',
    'id',
  ],
  productTitle:
    '.pWCRS310_Desc, a.aWCRS310_Product, [class*="WCRS310_Desc"], [class*="product-title"], [class*="ProductTitle"], h2, h3',
  productPrice:
    '.pWCRS310_PrixUnitaire, [class*="PrixUnitaire"], [class*="price-main"], [class*="ProductPrice"]',
  productUnitPrice:
    '.pWCRS310_PrixMesure, [class*="PrixMesure"], [class*="price-unit"]',
  productImage: 'img.imgWCRS310_Product, img[src*="opaline"], img',

  addToCartPlusButton:
    '.divWCRS310_BoutonPlus, [id*="btnPlus"], [class*="BoutonPlus"], button[title*="Ajouter"], a[title*="Ajouter"], button[class*="ajout"], a[class*="ajout"], [data-testid*="add-to-cart"]',
  outOfStockIndicator:
    '.divWCRS310_Indispo, [class*="Indispo"], [class*="rupture"], [class*="out-of-stock"], .produit-indisponible',
  currentQuantityInCartBadge:
    'input[class*="Quantite"], .spanWCRS310_Quantite, [class*="WCRS310_Qte"]',

  openCartButton:
    'a[href*="panier"], [id*="Panier"], [class*="HeaderPanier"], [data-testid*="cart"]',

  timing: {
    minActionDelayMs: 1100,
    maxActionDelayMs: 1900,
    searchResultsWaitMs: 1400,
  },
};

const CUSTOM_SELECTORS_STORAGE_KEY = 'doudous_leclerc_selectors_v1';

export function loadLeclercSelectors(): LeclercSelectorsConfig {
  try {
    const raw = localStorage.getItem(CUSTOM_SELECTORS_STORAGE_KEY);
    if (!raw) return DEFAULT_LECLERC_SELECTORS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_LECLERC_SELECTORS,
      ...parsed,
      timing: {
        ...DEFAULT_LECLERC_SELECTORS.timing,
        ...(parsed.timing || {}),
      },
    };
  } catch {
    return DEFAULT_LECLERC_SELECTORS;
  }
}

export function saveLeclercSelectors(config: LeclercSelectorsConfig): void {
  try {
    localStorage.setItem(CUSTOM_SELECTORS_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

export function resetLeclercSelectors(): LeclercSelectorsConfig {
  try {
    localStorage.removeItem(CUSTOM_SELECTORS_STORAGE_KEY);
  } catch {
    // ignore
  }
  return DEFAULT_LECLERC_SELECTORS;
}
