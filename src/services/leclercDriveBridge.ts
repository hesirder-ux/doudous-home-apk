import {
  LeclercSelectorsConfig,
  loadLeclercSelectors,
} from '../config/leclercSelectors';
import { buildOptimizedDriveQuery } from '../utils/portionScaler';

export interface SavedProductMapping {
  itemKey: string;
  itemDisplayName: string;
  productId: string;
  exactTitle: string;
  priceLabel?: string;
  updatedAt: string;
}

export interface LeclercAutomationItem {
  id: string;
  itemKey: string;
  name: string;
  searchQuery: string;
  quantity: number;
  unit: string;
}

export interface LeclercRecapEntry {
  name: string;
  matchedTitle?: string;
  quantity: number;
  unit: string;
  reason?: string;
}

export interface LeclercRecapReport {
  finishedAt: string;
  added: LeclercRecapEntry[];
  outOfStock: LeclercRecapEntry[];
  notFound: LeclercRecapEntry[];
}

const MAPPINGS_STORAGE_KEY = 'doudous_leclerc_product_mappings_v1';
const LAST_RECAP_STORAGE_KEY = 'doudous_leclerc_last_recap_v1';

export function normalizeMappingKey(rawName: string): string {
  return (rawName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function loadSavedProductMappings(): Record<string, SavedProductMapping> {
  try {
    const raw = localStorage.getItem(MAPPINGS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export function saveProductMapping(mapping: SavedProductMapping): Record<string, SavedProductMapping> {
  const current = loadSavedProductMappings();
  const next = {
    ...current,
    [mapping.itemKey]: mapping,
  };
  try {
    localStorage.setItem(MAPPINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function deleteProductMapping(itemKey: string): Record<string, SavedProductMapping> {
  const current = loadSavedProductMappings();
  const next = { ...current };
  delete next[itemKey];
  try {
    localStorage.setItem(MAPPINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function loadLastLeclercRecap(): LeclercRecapReport | null {
  try {
    const raw = localStorage.getItem(LAST_RECAP_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLastLeclercRecap(report: LeclercRecapReport): void {
  try {
    localStorage.setItem(LAST_RECAP_STORAGE_KEY, JSON.stringify(report));
  } catch {
    // ignore
  }
}

/**
 * Détecte si l'application s'exécute dans un conteneur Capacitor Android avec le plugin InAppBrowser.
 */
export function isCapacitorInAppBrowserAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return Boolean(
    (w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform()) ||
      (w.cordova && w.cordova.InAppBrowser)
  );
}

/**
 * Prépare la liste des articles non cochés pour l'automate E.Leclerc Drive.
 */
export function prepareAutomationItems(
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unit?: string;
    checked?: boolean;
  }>,
  driveSpecs?: Record<string, string>
): LeclercAutomationItem[] {
  const unchecked = items.filter((i) => !i.checked);
  const source = unchecked.length > 0 ? unchecked : items;
  return source.map((item) => {
    const qInfo = buildOptimizedDriveQuery(item.name, driveSpecs);
    const itemKey = normalizeMappingKey(qInfo.cleanName || item.name);
    const rawQty = Math.max(1, Math.round(Number(item.quantity) || 1));
    return {
      id: item.id,
      itemKey,
      name: qInfo.cleanName || item.name,
      searchQuery: qInfo.fullQuery,
      quantity: rawQty,
      unit: item.unit || 'pièce(s)',
    };
  });
}

/**
 * Génère le script JavaScript autonome pour piloter E.Leclerc Drive :
 * - Fonctionne SANS APK directement dans Chrome Android grâce au mode « Onglet Pilote Same-Origin » (`window.open` sur le même domaine `fdXX-courses.leclercdrive.fr`), ce qui permet au script de survivre à tous les rechargements de page lors des recherches produits sans jamais être effacé !
 * - Fonctionne aussi avec Capacitor `InAppBrowser.executeScript` si empaqueté en APK.
 * - Zéro `fetch`, zéro proxy, zéro `iframe` (respecte `X-Frame-Options: DENY` et DataDome).
 * - Utilise exclusivement les sélecteurs isolés dans `src/config/leclercSelectors.ts`.
 * - Pause aléatoire de 1 à 2 secondes (`1100–1900 ms`) entre chaque action.
 * - Écran de choix si plusieurs produits correspondent + mémorisation `article → produit` dans `localStorage`.
 * - Récapitulatif final (`Ajoutés / En rupture / Introuvables`) sans validation automatique de la commande.
 */
export function buildLeclercAutomationScript(
  rawItems: Array<{
    id: string;
    name: string;
    quantity: number;
    unit?: string;
    checked?: boolean;
  }>,
  driveSpecs?: Record<string, string>,
  customSelectors?: LeclercSelectorsConfig,
  forceRestart: boolean = false
): {
  rawScript: string;
  spaceFreeBookmarklet: string;
  spaceFreeRunner: string;
  itemsCount: number;
} {
  const selectors = customSelectors || loadLeclercSelectors();
  const preparedItems = prepareAutomationItems(rawItems, driveSpecs);
  const savedMappings = loadSavedProductMappings();

  const serializedItems = JSON.stringify(preparedItems);
  const serializedSelectors = JSON.stringify(selectors);
  const serializedMappings = JSON.stringify(savedMappings);

  const scriptBody = `(function(){
  var S = ${serializedSelectors};
  var INITIAL_ITEMS = ${serializedItems};
  var INITIAL_MAPPINGS = ${serializedMappings};
  var FORCE_RESTART = ${forceRestart ? 'true' : 'false'};

  var STATE_KEY = 'doudous_leclerc_session_state_v3';
  var MAPPINGS_KEY = 'doudous_leclerc_product_mappings_v1';

  // Fenêtre pilote Same-Origin (permet de survivre aux rechargements de page dans Chrome Mobile sans APK !)
  var pilotWin = window.__doudousPilotWin || null;

  function getWin() {
    try {
      if (pilotWin && !pilotWin.closed && pilotWin.document) {
        return pilotWin;
      }
    } catch (e) {}
    return window;
  }

  function getDoc() {
    return getWin().document;
  }

  function loadMappings() {
    try {
      var local = JSON.parse(localStorage.getItem(MAPPINGS_KEY) || '{}');
      return Object.assign({}, INITIAL_MAPPINGS, local);
    } catch (e) {
      return INITIAL_MAPPINGS;
    }
  }

  function saveMapping(itemKey, itemDisplayName, productId, exactTitle, priceLabel) {
    var m = loadMappings();
    m[itemKey] = {
      itemKey: itemKey,
      itemDisplayName: itemDisplayName,
      productId: productId || '',
      exactTitle: exactTitle || '',
      priceLabel: priceLabel || '',
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(MAPPINGS_KEY, JSON.stringify(m));
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cordova_iab) {
        window.webkit.messageHandlers.cordova_iab.postMessage(JSON.stringify({ type: 'MAPPING_SAVED', payload: m[itemKey] }));
      }
    } catch (e) {}
    return m;
  }

  function createFreshState() {
    return {
      items: INITIAL_ITEMS,
      idx: 0,
      phase: 'IDLE',
      paused: false,
      report: {
        finishedAt: '',
        added: [],
        outOfStock: [],
        notFound: []
      }
    };
  }

  function loadState() {
    if (FORCE_RESTART) {
      var fresh = createFreshState();
      saveState(fresh);
      return fresh;
    }
    try {
      var raw = sessionStorage.getItem(STATE_KEY) || localStorage.getItem(STATE_KEY);
      if (!raw) {
        var init = createFreshState();
        saveState(init);
        return init;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
        var init2 = createFreshState();
        saveState(init2);
        return init2;
      }
      return parsed;
    } catch (e) {
      return createFreshState();
    }
  }

  function saveState(st) {
    try {
      var s = JSON.stringify(st);
      sessionStorage.setItem(STATE_KEY, s);
      localStorage.setItem(STATE_KEY, s);
    } catch (e) {}
  }

  var state = loadState();

  function randomHumanDelay() {
    var min = (S.timing && S.timing.minActionDelayMs) || 1100;
    var max = (S.timing && S.timing.maxActionDelayMs) || 1900;
    return Math.floor(min + Math.random() * (max - min));
  }

  function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  function isStoreSelected() {
    var w = getWin();
    var d = getDoc();
    if (w.location.pathname.indexOf(S.storeCatalogUrlPattern) !== -1) return true;
    if (d.querySelector(S.searchInput)) return true;
    return false;
  }

  function extractCardData(cardEl, index) {
    var id = '';
    for (var i = 0; i < S.productIdAttributes.length; i++) {
      var attr = cardEl.getAttribute(S.productIdAttributes[i]);
      if (attr) { id = attr; break; }
    }
    var titleEl = cardEl.querySelector(S.productTitle);
    var title = titleEl ? (titleEl.textContent || '').replace(/\\s+/g, ' ').trim() : ('Produit #' + (index + 1));
    var priceEl = cardEl.querySelector(S.productPrice);
    var price = priceEl ? (priceEl.textContent || '').replace(/\\s+/g, ' ').trim() : '';
    var unitPriceEl = cardEl.querySelector(S.productUnitPrice);
    var unitPrice = unitPriceEl ? (unitPriceEl.textContent || '').replace(/\\s+/g, ' ').trim() : '';
    var imgEl = cardEl.querySelector(S.productImage);
    var imgSrc = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '') : '';
    var plusBtn = cardEl.querySelector(S.addToCartPlusButton);
    var outOfStockEl = cardEl.querySelector(S.outOfStockIndicator);
    var isOutOfStock = Boolean(outOfStockEl) || !plusBtn;
    return {
      index: index,
      cardEl: cardEl,
      productId: id,
      title: title,
      price: price,
      unitPrice: unitPrice,
      imgSrc: imgSrc,
      plusBtn: plusBtn,
      isOutOfStock: isOutOfStock
    };
  }

  function ensureOverlayRoot() {
    var d = getDoc();
    var existing = d.getElementById('doudous-leclerc-iab-root');
    if (existing) return existing;
    var root = d.createElement('div');
    root.id = 'doudous-leclerc-iab-root';
    root.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;max-width:500px;margin:0 auto;z-index:2147483647;font-family:system-ui,-apple-system,sans-serif;';
    if (d.body) {
      d.body.appendChild(root);
    }
    return root;
  }

  function renderParentControllerNotice() {
    if (!pilotWin || pilotWin.closed) return;
    var existing = document.getElementById('doudous-parent-controller-bar');
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'doudous-parent-controller-bar';
      existing.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;max-width:500px;margin:0 auto;z-index:2147483647;background:#0f172a;color:#fff;padding:14px 16px;border-radius:18px;border:2px solid #3b82f6;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 20px 45px rgba(0,0,0,0.75);';
      document.body.appendChild(existing);
    }
    existing.innerHTML =
      '<div style="font-size:12px;font-weight:800;color:#60a5fa;margin-bottom:4px;">🤖 Onglet Contrôleur Actif (' + Math.min(state.idx + 1, state.items.length) + '/' + state.items.length + ')</div>' +
      '<div style="font-size:11px;color:#e2e8f0;line-height:1.4;">Le remplissage automatique se déroule dans le second onglet Leclerc Drive. <strong>Ne fermez pas cet onglet</strong> tant que la liste n’est pas terminée.</div>';
  }

  function renderBanner(statusText, subText, showStartBtn) {
    renderParentControllerNotice();
    var d = getDoc();
    var root = ensureOverlayRoot();
    var total = state.items.length;
    var curIdx = Math.min(state.idx + 1, total);
    var curItem = state.items[state.idx];
    root.innerHTML =
      '<div style="background:#0f172a;color:#fff;padding:14px 16px;border-radius:18px;box-shadow:0 20px 45px rgba(0,0,0,0.75);border:2px solid #10b981;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<span style="font-size:11px;font-weight:800;color:#34d399;text-transform:uppercase;letter-spacing:0.04em;">🛒 Pilote E.Leclerc Drive (' + curIdx + '/' + total + ')</span>' +
          '<div style="display:flex;gap:6px;">' +
            '<button id="dl-iab-reset" style="background:#1e293b;color:#cbd5e1;border:none;border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer;">↺ Repartir à 1</button>' +
            '<button id="dl-iab-close" style="background:transparent;color:#94a3b8;border:none;font-size:13px;cursor:pointer;">✕</button>' +
          '</div>' +
        '</div>' +
        (curItem ? '<div style="font-size:14px;font-weight:800;color:#fff;margin-bottom:2px;">Article : ' + curItem.name + ' <span style="color:#34d399;">(×' + curItem.quantity + ')</span></div>' : '') +
        '<div style="font-size:12px;color:#e2e8f0;margin-bottom:4px;">' + statusText + '</div>' +
        (subText ? '<div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">' + subText + '</div>' : '') +
        (showStartBtn ? '<button id="dl-iab-start" style="width:100%;background:#10b981;color:#022c22;border:none;border-radius:12px;padding:12px;font-weight:900;font-size:13px;cursor:pointer;margin-top:4px;">▶ Démarrer le remplissage automatique (' + total + ' articles)</button>' : '') +
      '</div>';

    var closeBtn = d.getElementById('dl-iab-close');
    if (closeBtn) closeBtn.onclick = function() { root.remove(); };
    var resetBtn = d.getElementById('dl-iab-reset');
    if (resetBtn) resetBtn.onclick = function() {
      state = createFreshState();
      state.phase = 'SEARCH_ITEM';
      saveState(state);
      runStep();
    };
    var startBtn = d.getElementById('dl-iab-start');
    if (startBtn) startBtn.onclick = function() {
      // Si on est sur un navigateur mobile standard (sans APK Capacitor), on ouvre une fenêtre fille Same-Origin
      // pour que la boucle de cet onglet mère ne soit jamais interrompue quand une recherche recharge la page !
      var isCordovaIab = Boolean(window.cordova && window.cordova.InAppBrowser);
      if (!isCordovaIab && (!pilotWin || pilotWin.closed)) {
        try {
          var opened = window.open(location.href, 'doudous_leclerc_pilot');
          if (opened) {
            pilotWin = opened;
            window.__doudousPilotWin = opened;
          }
        } catch (e) {}
      }
      state.paused = false;
      state.phase = 'SEARCH_ITEM';
      saveState(state);
      setTimeout(function() { runStep(); }, 900);
    };
  }

  function renderChoiceModal(item, candidates, onSelectCandidate, onSkipItem) {
    var d = getDoc();
    var root = ensureOverlayRoot();
    var listHtml = candidates.slice(0, 8).map(function(c, i) {
      return (
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:#1e293b;padding:10px;border-radius:12px;border:1px solid #334155;margin-bottom:8px;">' +
          (c.imgSrc ? '<img src="' + c.imgSrc + '" style="width:44px;height:44px;object-fit:contain;background:#fff;border-radius:8px;flex-shrink:0;" />' : '') +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12px;font-weight:700;color:#fff;line-height:1.3;">' + c.title + '</div>' +
            '<div style="font-size:11px;color:#34d399;font-weight:800;margin-top:2px;">' + (c.price || '') + (c.unitPrice ? ' <span style="color:#94a3b8;font-weight:400;">(' + c.unitPrice + ')</span>' : '') + '</div>' +
            (c.isOutOfStock ? '<span style="display:inline-block;margin-top:2px;font-size:10px;color:#fda4af;font-weight:700;">⚠️ En rupture</span>' : '') +
          '</div>' +
          '<button data-cand-idx="' + i + '" class="dl-cand-pick" style="background:' + (c.isOutOfStock ? '#475569' : '#10b981') + ';color:' + (c.isOutOfStock ? '#cbd5e1' : '#022c22') + ';border:none;border-radius:10px;padding:8px 11px;font-size:11px;font-weight:900;cursor:pointer;flex-shrink:0;">' +
            (c.isOutOfStock ? 'Rupture' : 'Choisir') +
          '</button>' +
        '</div>'
      );
    }).join('');

    root.innerHTML =
      '<div style="background:#0f172a;color:#fff;padding:16px;border-radius:20px;box-shadow:0 25px 50px rgba(0,0,0,0.85);border:2px solid #f59e0b;max-height:82dvh;display:flex;flex-direction:column;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<span style="font-size:11px;font-weight:800;color:#fbbf24;text-transform:uppercase;">🤔 Plusieurs produits trouvés (' + (state.idx + 1) + '/' + state.items.length + ')</span>' +
          '<button id="dl-choice-skip" style="background:#334155;color:#e2e8f0;border:none;border-radius:8px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;">Passer cet article →</button>' +
        '</div>' +
        '<div style="font-size:14px;font-weight:800;margin-bottom:2px;">Quel produit choisir pour « ' + item.name + ' » (×' + item.quantity + ') ?</div>' +
        '<div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">Votre choix sera mémorisé automatiquement pour vos prochaines listes de courses.</div>' +
        '<div style="overflow-y:auto;flex:1;padding-right:2px;">' + listHtml + '</div>' +
      '</div>';

    var skipBtn = d.getElementById('dl-choice-skip');
    if (skipBtn) skipBtn.onclick = function() { onSkipItem(); };

    var btns = root.querySelectorAll('.dl-cand-pick');
    for (var b = 0; b < btns.length; b++) {
      btns[b].onclick = function(ev) {
        var idx = parseInt(ev.currentTarget.getAttribute('data-cand-idx'), 10);
        onSelectCandidate(candidates[idx]);
      };
    }
  }

  function renderFinalRecap() {
    var d = getDoc();
    var root = ensureOverlayRoot();
    var r = state.report;
    try {
      localStorage.setItem('doudous_leclerc_last_recap_v1', JSON.stringify(r));
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cordova_iab) {
        window.webkit.messageHandlers.cordova_iab.postMessage(JSON.stringify({ type: 'RECAP_FINISHED', payload: r }));
      }
    } catch (e) {}

    var addedHtml = r.added.map(function(a) {
      return '<li style="margin-bottom:3px;">✅ <strong>' + a.name + '</strong> (×' + a.quantity + ') → <span style="color:#cbd5e1;">' + (a.matchedTitle || '') + '</span></li>';
    }).join('');
    var oosHtml = r.outOfStock.map(function(a) {
      return '<li style="margin-bottom:3px;">⚠️ <strong>' + a.name + '</strong> (×' + a.quantity + ') — En rupture (' + (a.matchedTitle || '') + ')</li>';
    }).join('');
    var nfHtml = r.notFound.map(function(a) {
      return '<li style="margin-bottom:3px;">❌ <strong>' + a.name + '</strong> (×' + a.quantity + ') — Aucun résultat</li>';
    }).join('');

    root.innerHTML =
      '<div style="background:#0f172a;color:#fff;padding:16px;border-radius:20px;box-shadow:0 25px 50px rgba(0,0,0,0.85);border:2px solid #10b981;max-height:82dvh;display:flex;flex-direction:column;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<strong style="font-size:14px;color:#34d399;">🏁 Récapitulatif Panier E.Leclerc Drive</strong>' +
          '<button id="dl-recap-close" style="background:transparent;color:#94a3b8;border:none;font-size:13px;cursor:pointer;">✕ Fermer</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;text-align:center;">' +
          '<div style="background:#064e3b;padding:8px;border-radius:10px;"><div style="font-size:16px;font-weight:900;color:#34d399;">' + r.added.length + '</div><div style="font-size:10px;color:#a7f3d0;">Ajoutés</div></div>' +
          '<div style="background:#78350f;padding:8px;border-radius:10px;"><div style="font-size:16px;font-weight:900;color:#fbbf24;">' + r.outOfStock.length + '</div><div style="font-size:10px;color:#fde68a;">En rupture</div></div>' +
          '<div style="background:#881337;padding:8px;border-radius:10px;"><div style="font-size:16px;font-weight:900;color:#fda4af;">' + r.notFound.length + '</div><div style="font-size:10px;color:#fecdd3;">Introuvables</div></div>' +
        '</div>' +
        '<div style="overflow-y:auto;flex:1;font-size:11px;line-height:1.4;background:#1e293b;padding:10px;border-radius:12px;margin-bottom:10px;">' +
          '<ul style="list-style:none;padding:0;margin:0;">' +
            (addedHtml || '') +
            (oosHtml || '') +
            (nfHtml || '') +
          '</ul>' +
        '</div>' +
        '<div style="font-size:11px;color:#94a3b8;margin-bottom:8px;text-align:center;">Sécurité : la commande n’est jamais validée ni payée automatiquement. Vérifiez et validez votre panier vous-même.</div>' +
        '<button id="dl-open-cart" style="width:100%;background:#10b981;color:#022c22;border:none;border-radius:12px;padding:11px;font-weight:900;font-size:13px;cursor:pointer;">🛒 Voir et valider mon panier sur le site</button>' +
      '</div>';

    var closeBtn = d.getElementById('dl-recap-close');
    if (closeBtn) closeBtn.onclick = function() { root.remove(); };
    var cartBtn = d.getElementById('dl-open-cart');
    if (cartBtn) cartBtn.onclick = function() {
      var siteCart = d.querySelector(S.openCartButton);
      if (siteCart) siteCart.click();
      root.remove();
    };
  }

  async function waitForPilotPageReadyAfterSearch() {
    await sleep(950);
    var elapsed = 950;
    while (elapsed < 8500) {
      try {
        var d = getDoc();
        if (d && d.readyState === 'complete' && d.body) {
          if (!d.__doudousSearchMarker || elapsed >= 2200) {
            break;
          }
        }
      } catch (e) {}
      await sleep(450);
      elapsed += 450;
    }
    await sleep(500);
  }

  async function addCandidateToCartWithHumanDelay(item, candidate) {
    if (candidate.isOutOfStock || !candidate.plusBtn) {
      state.report.outOfStock.push({
        name: item.name,
        matchedTitle: candidate.title,
        quantity: item.quantity,
        unit: item.unit,
        reason: 'En rupture de stock'
      });
      renderBanner('⚠️ Produit en rupture : ' + candidate.title, 'Passage à l’article suivant dans 1.5s...', false);
      await sleep(randomHumanDelay());
      advanceToNextItem();
      return;
    }

    var qty = Math.max(1, item.quantity || 1);
    for (var q = 0; q < qty; q++) {
      renderBanner(
        '➕ Ajout au panier (' + (q + 1) + '/' + qty + ') : ' + candidate.title,
        'Pause humaine de 1 à 2 s entre chaque action...',
        false
      );
      try {
        candidate.cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {}
      var btn = candidate.cardEl.querySelector(S.addToCartPlusButton) || candidate.plusBtn;
      if (btn) {
        btn.click();
      }
      await sleep(randomHumanDelay());
    }

    state.report.added.push({
      name: item.name,
      matchedTitle: candidate.title,
      quantity: qty,
      unit: item.unit
    });
    advanceToNextItem();
  }

  function advanceToNextItem() {
    state.idx = state.idx + 1;
    state.phase = 'SEARCH_ITEM';
    saveState(state);
    runStep();
  }

  async function runStep() {
    if (state.idx >= state.items.length) {
      state.phase = 'COMPLETED';
      state.report.finishedAt = new Date().toISOString();
      saveState(state);
      renderFinalRecap();
      return;
    }

    if (!isStoreSelected()) {
      renderBanner(
        '👋 Connectez-vous une fois et choisissez votre Drive (« Choisir ce drive »)',
        'Dès que vous êtes dans les rayons de votre magasin, appuyez sur le bouton vert ci-dessous.',
        true
      );
      return;
    }

    if (state.phase === 'IDLE') {
      renderBanner(
        'Prêt à remplir votre panier Leclerc Drive automatiquement.',
        'Appuyez sur le bouton vert ci-dessous pour lancer la recherche et l’ajout des articles.',
        true
      );
      return;
    }

    var currentItem = state.items[state.idx];
    var d = getDoc();

    if (state.phase === 'SEARCH_ITEM') {
      renderBanner(
        '🔍 Recherche de « ' + currentItem.searchQuery + ' »...',
        'Pause de 1 à 2 s avant recherche...',
        false
      );
      await sleep(randomHumanDelay());

      d = getDoc();
      var inp = d.querySelector(S.searchInput);
      if (!inp) {
        var toggle = d.querySelector(S.mobileSearchToggle);
        if (toggle) {
          try { toggle.click(); } catch (e) {}
          await sleep(450);
          inp = d.querySelector(S.searchInput);
        }
      }

      if (!inp) {
        renderBanner(
          '⚠️ Barre de recherche introuvable sur cette page.',
          'Assurez-vous d’être dans les rayons de votre Drive puis appuyez sur Démarrer.',
          true
        );
        return;
      }

      state.phase = 'EVALUATE_RESULTS';
      saveState(state);

      d.__doudousSearchMarker = true;
      inp.focus();
      inp.value = currentItem.searchQuery;
      inp.dispatchEvent(new Event('focus', { bubbles: true }));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));

      var submitBtn = (inp.closest('form') && inp.closest('form').querySelector('button, input[type="submit"]')) || d.querySelector(S.searchSubmitButton);
      if (submitBtn) {
        submitBtn.click();
      } else if (inp.form) {
        inp.form.submit();
      }

      // Attend que la nouvelle page (ou l'AJAX) ait fini de charger dans pilotWin (ou dans l'onglet courant)
      await waitForPilotPageReadyAfterSearch();
      if (state.phase === 'EVALUATE_RESULTS') {
        evaluateCurrentSearchResults();
      }
      return;
    }

    if (state.phase === 'EVALUATE_RESULTS') {
      await sleep(600);
      evaluateCurrentSearchResults();
    }
  }

  async function evaluateCurrentSearchResults() {
    var currentItem = state.items[state.idx];
    if (!currentItem) return;

    var d = getDoc();
    var cardNodes = d.querySelectorAll(S.productCard);
    var candidates = [];
    for (var i = 0; i < cardNodes.length; i++) {
      candidates.push(extractCardData(cardNodes[i], i));
    }

    if (candidates.length === 0) {
      state.report.notFound.push({
        name: currentItem.name,
        quantity: currentItem.quantity,
        unit: currentItem.unit,
        reason: 'Aucun produit trouvé pour « ' + currentItem.searchQuery + ' »'
      });
      renderBanner('❌ Introuvable : « ' + currentItem.searchQuery + ' »', 'Passage au suivant dans 1.5s...', false);
      await sleep(randomHumanDelay());
      advanceToNextItem();
      return;
    }

    var mappings = loadMappings();
    var remembered = mappings[currentItem.itemKey];
    if (remembered) {
      var matched = null;
      for (var j = 0; j < candidates.length; j++) {
        var c = candidates[j];
        if (
          (remembered.productId && c.productId && c.productId === remembered.productId) ||
          (remembered.exactTitle && c.title.toLowerCase() === remembered.exactTitle.toLowerCase())
        ) {
          matched = c;
          break;
        }
      }
      if (matched) {
        renderBanner('🧠 Produit habituel reconnu : ' + matched.title, 'Ajout automatique...', false);
        await sleep(randomHumanDelay());
        await addCandidateToCartWithHumanDelay(currentItem, matched);
        return;
      }
    }

    if (candidates.length === 1) {
      var single = candidates[0];
      saveMapping(currentItem.itemKey, currentItem.name, single.productId, single.title, single.price);
      await addCandidateToCartWithHumanDelay(currentItem, single);
      return;
    }

    renderChoiceModal(
      currentItem,
      candidates,
      async function(chosenCandidate) {
        saveMapping(
          currentItem.itemKey,
          currentItem.name,
          chosenCandidate.productId,
          chosenCandidate.title,
          chosenCandidate.price
        );
        await addCandidateToCartWithHumanDelay(currentItem, chosenCandidate);
      },
      async function() {
        state.report.notFound.push({
          name: currentItem.name,
          quantity: currentItem.quantity,
          unit: currentItem.unit,
          reason: 'Ignoré manuellement lors du choix multiple'
        });
        advanceToNextItem();
      }
    );
  }

  runStep();
})();`;

  const compact = scriptBody.replace(/\n\s*/g, ' ');
  const utf8Bytes = encodeURIComponent(compact).replace(
    /%([0-9A-F]{2})/g,
    (_, p1) => String.fromCharCode(parseInt(p1, 16))
  );
  const base64Payload =
    typeof btoa === 'function'
      ? btoa(utf8Bytes)
      : Buffer.from(compact, 'utf-8').toString('base64');
  const spaceFreeRunner = `eval(decodeURIComponent(escape(atob('${base64Payload}'))));void(0);`;

  return {
    rawScript: scriptBody,
    spaceFreeRunner,
    spaceFreeBookmarklet: `javascript:${spaceFreeRunner}`,
    itemsCount: preparedItems.length,
  };
}

/**
 * Lance l'automatisation via le plugin Capacitor/Cordova `InAppBrowser` sur Android (si APK installé).
 */
export function launchCapacitorLeclercInAppBrowser(
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unit?: string;
    checked?: boolean;
  }>,
  storeUrl: string,
  driveSpecs?: Record<string, string>,
  callbacks?: {
    onMappingSaved?: (mapping: SavedProductMapping) => void;
    onRecapReady?: (report: LeclercRecapReport) => void;
    onFallbackWeb?: () => void;
  }
): boolean {
  const w = typeof window !== 'undefined' ? (window as any) : null;
  const iab = w?.cordova?.InAppBrowser;

  if (!iab || typeof iab.open !== 'function') {
    if (callbacks?.onFallbackWeb) {
      callbacks.onFallbackWeb();
    }
    return false;
  }

  const targetUrl =
    storeUrl && storeUrl.includes('leclercdrive.fr')
      ? storeUrl
      : 'https://www.leclercdrive.fr/region-bretagne/vitre/drive-vitre.aspx';

  const browserRef = iab.open(
    targetUrl,
    '_blank',
    'location=yes,clearcache=no,clearsessioncache=no,zoom=no,hardwareback=yes,toolbarcolor=#0f172a,navigationbuttoncolor=#34d399,closebuttoncaption=Fermer'
  );

  let isFirstInjection = true;

  browserRef.addEventListener('loadstop', () => {
    const scriptInfo = buildLeclercAutomationScript(
      items,
      driveSpecs,
      loadLeclercSelectors(),
      isFirstInjection
    );
    isFirstInjection = false;
    browserRef.executeScript({ code: scriptInfo.rawScript });
  });

  browserRef.addEventListener('message', (event: any) => {
    try {
      const data = typeof event?.data === 'string' ? JSON.parse(event.data) : event?.data;
      if (data?.type === 'MAPPING_SAVED' && data.payload) {
        saveProductMapping(data.payload);
        callbacks?.onMappingSaved?.(data.payload);
      } else if (data?.type === 'RECAP_FINISHED' && data.payload) {
        saveLastLeclercRecap(data.payload);
        callbacks?.onRecapReady?.(data.payload);
      }
    } catch {
      // ignore malformed messages
    }
  });

  return true;
}
