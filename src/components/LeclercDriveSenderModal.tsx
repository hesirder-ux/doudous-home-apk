import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingItem } from '../types';
import {
  LeclercSelectorsConfig,
  loadLeclercSelectors,
  saveLeclercSelectors,
  resetLeclercSelectors,
} from '../config/leclercSelectors';
import {
  buildLeclercAutomationScript,
  deleteProductMapping,
  isCapacitorInAppBrowserAvailable,
  launchCapacitorLeclercInAppBrowser,
  LeclercRecapReport,
  loadLastLeclercRecap,
  loadSavedProductMappings,
  SavedProductMapping,
} from '../services/leclercDriveBridge';
import {
  Copy,
  ExternalLink,
  RotateCcw,
  Settings,
  Smartphone,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

interface LeclercDriveSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ShoppingItem[];
  driveSpecs?: Record<string, string>;
  storeUrl?: string;
}

export const LeclercDriveSenderModal: React.FC<LeclercDriveSenderModalProps> = ({
  isOpen,
  onClose,
  items,
  driveSpecs,
  storeUrl,
}) => {
  const [activeTab, setActiveTab] = useState<'launch' | 'mappings' | 'selectors' | 'recap'>('launch');
  const [selectors, setSelectors] = useState<LeclercSelectorsConfig>(() => loadLeclercSelectors());
  const [mappings, setMappings] = useState<Record<string, SavedProductMapping>>(() =>
    loadSavedProductMappings()
  );
  const [lastRecap, setLastRecap] = useState<LeclercRecapReport | null>(() =>
    loadLastLeclercRecap()
  );
  const [toast, setToast] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState<string>(() => {
    try {
      return localStorage.getItem('doudou_gh_token') || '';
    } catch {
      return '';
    }
  });
  const [repoName, setRepoName] = useState<string>('doudous-home-apk');
  const [isExportingGithub, setIsExportingGithub] = useState<boolean>(false);
  const [githubResult, setGithubResult] = useState<{
    repoUrl: string;
    actionsUrl: string;
    filesCount: number;
  } | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);

  const handleMobileGithubExport = async () => {
    if (!githubToken.trim()) {
      setGithubError('Collez d’abord votre jeton GitHub (étape 1 ci-dessous).');
      return;
    }
    setIsExportingGithub(true);
    setGithubError(null);
    setGithubResult(null);
    try {
      try {
        localStorage.setItem('doudou_gh_token', githubToken.trim());
      } catch {
        // ignore
      }
      const resp = await fetch('/api/github/export-apk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubToken: githubToken.trim(),
          repoName: repoName.trim() || 'doudous-home-apk',
          isPrivate: false,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setGithubError(data.error || 'Erreur lors de l’export vers GitHub.');
      } else {
        setGithubResult({
          repoUrl: data.repoUrl,
          actionsUrl: data.actionsUrl,
          filesCount: data.filesCount,
        });
        showToast('🎉 Code envoyé sur GitHub ! Compilation du fichier .APK lancée !');
      }
    } catch (err: any) {
      setGithubError(err?.message || 'Impossible de contacter le serveur.');
    } finally {
      setIsExportingGithub(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectors(loadLeclercSelectors());
      setMappings(loadSavedProductMappings());
      setLastRecap(loadLastLeclercRecap());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isNativeCapacitor = isCapacitorInAppBrowserAvailable();
  const scriptBundle = buildLeclercAutomationScript(items, driveSpecs, selectors, true);
  const targetStoreUrl =
    storeUrl && storeUrl.includes('leclercdrive.fr')
      ? storeUrl
      : 'https://www.leclercdrive.fr/region-bretagne/vitre/drive-vitre.aspx';

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const handleLaunchInAppBrowser = () => {
    const launched = launchCapacitorLeclercInAppBrowser(items, targetStoreUrl, driveSpecs, {
      onMappingSaved: () => {
        setMappings(loadSavedProductMappings());
      },
      onRecapReady: (report) => {
        setLastRecap(report);
        setActiveTab('recap');
      },
      onFallbackWeb: () => {
        showToast(
          'ℹ️ Utilisez le mode Sans APK ci-dessous pour piloter Leclerc Drive directement depuis Chrome sur votre téléphone !'
        );
      },
    });
    if (launched) {
      showToast('🚀 Ouverture de Leclerc Drive dans Capacitor InAppBrowser...');
    }
  };

  const handleSaveSelectors = (e: React.FormEvent) => {
    e.preventDefault();
    saveLeclercSelectors(selectors);
    showToast('✓ Sélecteurs CSS E.Leclerc Drive enregistrés !');
  };

  const handleResetSelectors = () => {
    const def = resetLeclercSelectors();
    setSelectors(def);
    showToast('↺ Sélecteurs CSS remis par défaut.');
  };

  const handleDeleteMapping = (key: string) => {
    const updated = deleteProductMapping(key);
    setMappings(updated);
    showToast('🗑️ Correspondance produit supprimée.');
  };

  const mappingList = Object.values(mappings);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
                  Pilote Automatique E.Leclerc Drive · 100 % sur Téléphone
                </span>
                <h3 className="text-sm sm:text-base font-extrabold truncate">
                  Envoyer vers Leclerc Drive ({scriptBundle.itemsCount} article
                  {scriptBundle.itemsCount > 1 ? 's' : ''})
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
              <span>Fermer</span>
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="grid grid-cols-4 gap-1 bg-slate-800 p-1 rounded-xl text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('launch')}
              className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'launch' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              1. Lancer / APK
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mappings')}
              className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'mappings'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              2. Choix ({mappingList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('selectors')}
              className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'selectors'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              3. Sélecteurs CSS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recap')}
              className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'recap'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              4. Récap Panier
            </button>
          </div>
        </div>

        {/* Toast Feedback */}
        {toast && (
          <div className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold shrink-0">
            {toast}
          </div>
        )}

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs text-slate-700">
          {activeTab === 'launch' && (
            <div className="space-y-4">
              {/* NEW: 1-CLICK MOBILE GITHUB EXPORT & CLOUD APK BUILDER */}
              <div className="p-4 rounded-2xl bg-indigo-950 text-white border border-indigo-400/40 space-y-3 shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-indigo-300 shrink-0" />
                    <h4 className="text-sm font-extrabold text-white">
                      ☁️ Exporter sur GitHub & Compiler mon .APK depuis mon téléphone
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-extrabold shrink-0">
                    Sans PC
                  </span>
                </div>

                <p className="text-indigo-200 leading-relaxed text-[11px]">
                  Sur téléphone, le bouton d’export d’AI Studio est caché. Utilisez ce module intégré pour envoyer tout le code (avec Capacitor + <code className="text-white">InAppBrowser</code>) directement sur votre compte GitHub et lancer la compilation automatique du fichier <strong>.APK Android</strong> :
                </p>

                <div className="space-y-2 bg-indigo-900/60 p-3 rounded-xl border border-indigo-800">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-indigo-200">
                      Étape 1 : Créez une clé GitHub (cochée automatiquement)
                    </span>
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=DoudousHomeAPK"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-extrabold text-[11px] inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Ouvrir GitHub Token (repo + workflow) →</span>
                    </a>
                  </div>
                  <p className="text-[10px] text-indigo-300">
                    Sur la page GitHub qui s’ouvre, descendez tout en bas, appuyez sur le bouton vert <strong>« Generate token »</strong>, puis copiez le code qui commence par <code className="text-amber-300">ghp_...</code>
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-indigo-200 mb-1">
                        Étape 2 : Collez votre clé GitHub (ghp_...)
                      </label>
                      <input
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-indigo-700 text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-200 mb-1">
                        Nom du dépôt
                      </label>
                      <input
                        type="text"
                        value={repoName}
                        onChange={(e) => setRepoName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-indigo-700 text-white font-mono text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isExportingGithub}
                    onClick={handleMobileGithubExport}
                    className="w-full min-h-[46px] mt-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>
                      {isExportingGithub
                        ? 'Envoi des fichiers sur GitHub en cours...'
                        : '🚀 Étape 3 : Exporter sur GitHub & Compiler mon .APK'}
                    </span>
                  </button>

                  {githubError && (
                    <div className="p-2.5 rounded-xl bg-rose-950/90 border border-rose-500/60 text-rose-200 text-[11px] font-bold">
                      ⚠️ {githubError}
                    </div>
                  )}

                  {githubResult && (
                    <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-400 text-emerald-100 space-y-2 text-[11px]">
                      <div className="font-extrabold text-emerald-300">
                        ✅ Export réussi ({githubResult.filesCount} fichiers envoyés) ! La compilation Android APK a démarré :
                      </div>
                      <p>
                        Appuyez sur le bouton ci-dessous, attendez ~3 minutes que le point devienne vert 🟢, puis téléchargez <strong>doudous-home-android-apk</strong> en bas de la page :
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={githubResult.actionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-xl bg-emerald-400 text-slate-950 font-extrabold inline-flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>Ouvrir GitHub Actions & Télécharger mon APK →</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* PRIMARY WORKFLOW WITHOUT APK: Chrome Mobile Same-Origin Pilot Window */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white border border-emerald-500/50 space-y-3.5 shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                    <h4 className="text-sm font-extrabold text-white">
                      📱 Comment faire SANS APK (100 % depuis Chrome sur votre téléphone)
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-extrabold shrink-0">
                    Prêt tout de suite
                  </span>
                </div>

                <p className="text-slate-300 leading-relaxed">
                  Pas besoin d’installer d’APK ! J’ai intégré un <strong>Mode « Onglet Pilote »</strong> directement dans le script : dès que vous cliquez sur{' '}
                  <strong className="text-emerald-400">« ▶ Démarrer le remplissage automatique »</strong> sur{' '}
                  <em>leclercdrive.fr</em>, le script ouvre un second onglet Leclerc sur le même domaine et <strong>reste en vie en arrière-plan</strong> pour piloter automatiquement toutes les recherches produits, afficher l’écran de choix multiple, mémoriser vos produits et afficher le récapitulatif final !
                </p>

                {/* Step 1: Copy buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(scriptBundle.spaceFreeBookmarklet);
                        showToast(
                          '⭐ Script complet (avec javascript: et sans espace) copié pour Favori mobile !'
                        );
                      } catch {
                        // ignore
                      }
                    }}
                    className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>1A. Copier pour Favori ⭐ (avec « javascript: »)</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(scriptBundle.spaceFreeRunner);
                        showToast(
                          '📋 Script SANS ESPACE copié (à coller après avoir tapé javascript: dans la barre d’adresse) !'
                        );
                      } catch {
                        // ignore
                      }
                    }}
                    className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>1B. Copier sans « javascript: » (barre d’adresse)</span>
                  </button>
                </div>

                {/* Step 2: Open Leclerc Drive */}
                <a
                  href={targetStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(scriptBundle.spaceFreeBookmarklet);
                    } catch {
                      // ignore
                    }
                    showToast('🛒 Ouverture de votre Drive + Script copié !');
                  }}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  <span>2. Ouvrir mon magasin sur leclercdrive.fr →</span>
                </a>

                {/* 3 simple instructions on the phone */}
                <div className="p-3 rounded-xl bg-slate-800/90 border border-slate-700 text-[11px] text-slate-200 space-y-1.5 leading-relaxed">
                  <div className="font-extrabold text-emerald-300">
                    ⚡ Les 3 gestes sur votre téléphone (sans aucun APK) :
                  </div>
                  <div>
                    <strong>1. Mettez à jour votre Favori ⭐ « Robot » :</strong> Copiez le bouton <strong>1A</strong> et collez-le comme adresse URL de votre favori <strong>⭐ Robot</strong> dans Chrome.
                  </div>
                  <div>
                    <strong>2. Entrez dans votre Drive :</strong> Sur <em>leclercdrive.fr</em>, connectez-vous et appuyez sur <strong>« Choisir ce drive »</strong> pour être dans les rayons de votre magasin.
                  </div>
                  <div>
                    <strong>3. Lancez ⭐ Robot UNE SEULE FOIS :</strong> Tapez <strong className="text-amber-300">Robot</strong> dans la barre d’adresse en haut et touchez la ligne <strong>⭐ Robot</strong>. Appuyez ensuite sur le bouton vert <strong>« ▶ Démarrer le remplissage automatique »</strong> : il gère toute la liste jusqu’au récapitulatif final !
                  </div>
                </div>
              </div>

              {/* Optional Native Capacitor Button if running inside APK */}
              {isNativeCapacitor && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-700 shrink-0" />
                    <h4 className="text-xs font-extrabold text-emerald-950">
                      Mode APK Capacitor Détecté (InAppBrowser.executeScript)
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleLaunchInAppBrowser}
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Lancer via InAppBrowser natif ({scriptBundle.itemsCount} articles)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'mappings' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Correspondances mémorisées (Article → Produit E.Leclerc)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Lorsqu’une recherche renvoie plusieurs produits, votre choix est mémorisé pour
                    être ajouté automatiquement lors des prochaines listes.
                  </p>
                </div>
              </div>

              {mappingList.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-slate-500">
                  Aucune correspondance mémorisée pour le moment. Elles s’ajouteront automatiquement
                  dès que vous choisirez un produit sur l’écran de choix Leclerc Drive.
                </div>
              ) : (
                <div className="space-y-2">
                  {mappingList.map((m) => (
                    <div
                      key={m.itemKey}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold text-emerald-700 block">
                          Article : « {m.itemDisplayName} »
                        </span>
                        <p className="text-xs font-extrabold text-slate-900 truncate">
                          → {m.exactTitle}{' '}
                          {m.priceLabel ? (
                            <span className="text-slate-500 font-normal">({m.priceLabel})</span>
                          ) : null}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMapping(m.itemKey)}
                        className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer shrink-0"
                        title="Oublier ce choix"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'selectors' && (
            <form onSubmit={handleSaveSelectors} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Settings className="w-4 h-4 text-blue-600" />
                    <span>Configuration isolée des sélecteurs CSS (src/config/leclercSelectors.ts)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Si E.Leclerc Drive modifie son code HTML, mettez à jour ces sélecteurs sans
                    toucher au reste de l’application.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetSelectors}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Par défaut</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Champ de recherche (searchInput)
                  </label>
                  <input
                    type="text"
                    value={selectors.searchInput}
                    onChange={(e) => setSelectors({ ...selectors, searchInput: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Bouton validation recherche (searchSubmitButton)
                  </label>
                  <input
                    type="text"
                    value={selectors.searchSubmitButton}
                    onChange={(e) =>
                      setSelectors({ ...selectors, searchSubmitButton: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Carte produit (productCard)
                  </label>
                  <input
                    type="text"
                    value={selectors.productCard}
                    onChange={(e) => setSelectors({ ...selectors, productCard: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Titre du produit (productTitle)
                  </label>
                  <input
                    type="text"
                    value={selectors.productTitle}
                    onChange={(e) => setSelectors({ ...selectors, productTitle: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Bouton « + » Ajout Panier (addToCartPlusButton)
                  </label>
                  <input
                    type="text"
                    value={selectors.addToCartPlusButton}
                    onChange={(e) =>
                      setSelectors({ ...selectors, addToCartPlusButton: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Indicateur Rupture (outOfStockIndicator)
                  </label>
                  <input
                    type="text"
                    value={selectors.outOfStockIndicator}
                    onChange={(e) =>
                      setSelectors({ ...selectors, outOfStockIndicator: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Pause min entre actions (ms)
                  </label>
                  <input
                    type="number"
                    min={800}
                    max={5000}
                    value={selectors.timing.minActionDelayMs}
                    onChange={(e) =>
                      setSelectors({
                        ...selectors,
                        timing: { ...selectors.timing, minActionDelayMs: Number(e.target.value) },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Pause max entre actions (ms)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    max={8000}
                    value={selectors.timing.maxActionDelayMs}
                    onChange={(e) =>
                      setSelectors({
                        ...selectors,
                        timing: { ...selectors.timing, maxActionDelayMs: Number(e.target.value) },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs cursor-pointer"
              >
                Enregistrer les sélecteurs CSS
              </button>
            </form>
          )}

          {activeTab === 'recap' && (
            <div className="space-y-3">
              <h4 className="text-sm font-extrabold text-slate-900">
                Dernier récapitulatif de remplissage du panier
              </h4>
              {!lastRecap ? (
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-slate-500">
                  Aucun récapitulatif enregistré pour le moment. À la fin du remplissage sur Leclerc
                  Drive, le bilan (Ajoutés / En rupture / Introuvables) s’affiche directement sur le
                  site.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="text-lg font-black text-emerald-700">
                        {lastRecap.added.length}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-900">✅ Ajoutés</div>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <div className="text-lg font-black text-amber-700">
                        {lastRecap.outOfStock.length}
                      </div>
                      <div className="text-[11px] font-bold text-amber-900">⚠️ En rupture</div>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                      <div className="text-lg font-black text-rose-700">
                        {lastRecap.notFound.length}
                      </div>
                      <div className="text-[11px] font-bold text-rose-900">❌ Introuvables</div>
                    </div>
                  </div>

                  {lastRecap.added.length > 0 && (
                    <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1">
                      <strong className="text-emerald-900 block">✅ Ajoutés au panier :</strong>
                      {lastRecap.added.map((a, i) => (
                        <div key={i} className="text-emerald-950">
                          • <strong>{a.name}</strong> (×{a.quantity}) → {a.matchedTitle}
                        </div>
                      ))}
                    </div>
                  )}

                  {lastRecap.outOfStock.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 space-y-1">
                      <strong className="text-amber-900 block">⚠️ En rupture de stock :</strong>
                      {lastRecap.outOfStock.map((a, i) => (
                        <div key={i} className="text-amber-950">
                          • <strong>{a.name}</strong> (×{a.quantity}) — {a.matchedTitle}
                        </div>
                      ))}
                    </div>
                  )}

                  {lastRecap.notFound.length > 0 && (
                    <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200 space-y-1">
                      <strong className="text-rose-900 block">❌ Introuvables :</strong>
                      {lastRecap.notFound.map((a, i) => (
                        <div key={i} className="text-rose-950">
                          • <strong>{a.name}</strong> (×{a.quantity})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
