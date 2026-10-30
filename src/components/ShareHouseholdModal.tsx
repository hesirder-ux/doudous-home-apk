import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from 'lucide-react';

interface ShareHouseholdModalProps {
  isOpen: boolean;
  onClose: () => void;
  householdCode: string;
  onJoinHousehold: (code: string) => void;
  onManualSync: () => void;
  isSyncing: boolean;
  lastSyncedTime: Date | null;
  initialTab?: 'invite' | 'install' | 'join';
}

export const ShareHouseholdModal: React.FC<ShareHouseholdModalProps> = ({
  isOpen,
  onClose,
  householdCode,
  onJoinHousehold,
  onManualSync,
  isSyncing,
  lastSyncedTime,
  initialTab = 'invite',
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [activeTab, setActiveTab] = useState<'invite' | 'install' | 'join'>(initialTab);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!isOpen) return null;

  // Detect if current URL is the private AI Studio dev container (ais-dev-...)
  const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const isDevOrigin = rawOrigin.includes('//ais-dev-');

  // Partner MUST use the Shared App URL (ais-pre-...) instead of the private ais-dev-... URL
  const partnerOrigin = isDevOrigin ? rawOrigin.replace('//ais-dev-', '//ais-pre-') : rawOrigin;
  const partnerShareableUrl = `${partnerOrigin}${pathname}?foyer=${encodeURIComponent(
    householdCode
  )}`;

  // Personal install URL (uses partnerOrigin too if shared, or rawOrigin for owner)
  const ownerInstallUrl = `${partnerOrigin}${pathname}?foyer=${encodeURIComponent(householdCode)}`;

  const safeCopyText = async (text: string): Promise<void> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // Fallback below for iframe restrictions
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore
    }
    document.body.removeChild(ta);
  };

  const handleCopyPartnerLink = async () => {
    await safeCopyText(partnerShareableUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleNativeSharePartnerLink = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: "Doudou's Home — Notre Foyer",
          text: `Rejoins notre foyer Doudou's Home (Code : ${householdCode}) :`,
          url: partnerShareableUrl,
        });
        return;
      } catch {
        // User cancelled or share failed in webview -> fallback to copy
      }
    }
    await handleCopyPartnerLink();
  };

  const handleCopyCode = async () => {
    await safeCopyText(householdCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2200);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInput.trim()) return;
    onJoinHousehold(joinInput.trim().toUpperCase());
    onClose();
  };

  const handleTriggerNativeInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-md shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[88dvh] animate-slide-up"
      >
        {/* Header */}
        <div className="px-4 py-3.5 sm:px-5 sm:py-4 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-base font-bold font-display truncate">
                Partage Foyer & Installation
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                Synchro temps réel sur vos 2 téléphones
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Fermer</span>
          </button>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 p-1.5 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('invite')}
            className={`py-2 px-1.5 text-xs font-bold rounded-lg truncate transition-all cursor-pointer ${
              activeTab === 'invite'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Inviter
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('install')}
            className={`py-2 px-1.5 text-xs font-bold rounded-lg truncate transition-all cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'install'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Installer</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('join')}
            className={`py-2 px-1.5 text-xs font-bold rounded-lg truncate transition-all cursor-pointer ${
              activeTab === 'join'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Code Foyer
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {activeTab === 'invite' && (
            <div className="space-y-4">
              {/* IMPORTANT FIX BOX FOR "An unknown error occurred" */}
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-extrabold text-amber-950">
                      Pourquoi votre compagne voit « An unknown error occurred » ?
                    </p>
                    <p className="text-[11px] text-amber-900 mt-1 leading-relaxed">
                      Dans Google AI Studio, le lien de développement (<code className="font-mono bg-amber-100 px-1 rounded">ais-dev-...</code>) est strictement verrouillé sur <strong>votre seul compte Google</strong>. Si une autre personne l'ouvre, Google bloque l'accès avec cette erreur.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 bg-white rounded-xl border border-amber-200 text-[11px] text-slate-700 space-y-1.5">
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Comment autoriser le téléphone de votre compagne :</span>
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px]">
                    <li>
                      <strong>Dans la barre tout en haut à droite de Google AI Studio</strong> (hors de l'appli), cliquez sur le bouton <strong>« Share » (Partager)</strong> ou <strong>« Deploy » (Déployer)</strong>.
                    </li>
                    <li>
                      Activez <strong>« Public » (Tout le monde avec le lien)</strong> ou ajoutez l'adresse Gmail de votre compagne.
                    </li>
                    <li>
                      Envoyez-lui le <strong>Lien Partagé (`ais-pre-...`)</strong> ci-dessous (corrigé automatiquement) :
                    </li>
                  </ol>
                </div>
              </div>

              {/* Sync Status Banner */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <p className="text-xs font-bold text-emerald-950">
                      Foyer synchronisé : <span className="font-mono">{householdCode}</span>
                    </p>
                    <p className="text-[10px] text-emerald-700">
                      {lastSyncedTime
                        ? `Dernière synchro à ${lastSyncedTime.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}`
                        : 'Connecté au serveur en direct'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={onManualSync}
                  disabled={isSyncing}
                  className="p-1.5 bg-white text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                  title="Synchroniser immédiatement"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* QR Code with the Shared App URL (ais-pre-...) */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col items-center justify-center text-center">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold mb-2">
                  ✓ Lien Partagé (ais-pre) prêt pour votre compagne
                </span>
                <div className="p-2 bg-white qr-code-surface rounded-xl border border-slate-200 shadow-sm">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data=${encodeURIComponent(
                      partnerShareableUrl
                    )}`}
                    alt="QR Code Doudou's Home"
                    className="w-32 h-32 rounded-lg"
                  />
                </div>
                <div className="mt-2.5 w-full p-2 bg-slate-100 rounded-lg text-[10px] font-mono text-slate-700 break-all select-all">
                  {partnerShareableUrl}
                </div>
              </div>

              {/* Direct share / copy buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleCopyPartnerLink}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Lien copié ! Envoyez-le par WhatsApp / SMS</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copier le lien partagé (ais-pre)</span>
                    </>
                  )}
                </button>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={handleNativeSharePartnerLink}
                    className="py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Envoyer</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'install' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <p className="text-xs font-bold text-emerald-950">
                  📲 Installer Doudou's Home sur l'écran d'accueil
                </p>
                <p className="text-[11px] text-emerald-800 mt-1">
                  Scannez le QR Code ci-dessous ou copiez le lien partagé, puis ajoutez l'application sur votre écran d'accueil :
                </p>
              </div>

              {deferredPrompt && (
                <button
                  onClick={handleTriggerNativeInstall}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Installer directement sur cet appareil</span>
                </button>
              )}

              {/* Step 1: Scan QR or Copy Link */}
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-2.5 text-center">
                <p className="text-xs font-bold text-slate-900">
                  Étape 1 : Lien d'installation mobile (avec foyer {householdCode})
                </p>
                <div className="flex justify-center">
                  <div className="p-2 bg-white qr-code-surface rounded-xl border border-slate-200 shadow-xs">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=6&data=${encodeURIComponent(
                        ownerInstallUrl
                      )}`}
                      alt="QR Code Installation Mobile"
                      className="w-32 h-32 rounded-lg"
                    />
                  </div>
                </div>
                <div className="p-2 bg-slate-100 rounded-lg text-[10px] font-mono text-slate-700 break-all select-all">
                  {ownerInstallUrl}
                </div>
                <button
                  onClick={handleCopyPartnerLink}
                  className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>
                    {copiedLink
                      ? 'Lien copié ! Envoyez-le par WhatsApp / SMS'
                      : 'Copier le lien pour nos téléphones'}
                  </span>
                </button>
              </div>

              {/* Step 2: iPhone / iOS */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                <p className="text-xs font-bold text-slate-900">🍎 Sur iPhone (Safari) :</p>
                <ol className="text-[11px] text-slate-600 list-decimal list-inside space-y-1">
                  <li>
                    Ouvrez le lien dans <strong>Safari</strong>.
                  </li>
                  <li>
                    Appuyez sur l'icône <strong>Partager</strong> (carré avec flèche vers le haut).
                  </li>
                  <li>
                    Appuyez sur <strong>« Sur l'écran d'accueil »</strong> puis <strong>Ajouter</strong>.
                  </li>
                </ol>
              </div>

              {/* Step 3: Android */}
              <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-2">
                <p className="text-xs font-bold text-slate-900">🤖 Sur Android (Chrome) :</p>
                <ol className="text-[11px] text-slate-700 list-decimal list-inside space-y-1.5">
                  <li>
                    Ouvrez le lien dans <strong>Chrome</strong> (si vous avez scanné le QR Code, appuyez sur <strong>⋮</strong> → <strong>« Ouvrir dans Chrome »</strong>).
                  </li>
                  <li>
                    Appuyez sur <strong>⋮</strong> → <strong>« Ajouter à l'écran d'accueil »</strong>.
                  </li>
                  <li>
                    Appuyez sur <strong className="text-emerald-800">« Créer un raccourci &gt; »</strong> (ou <strong>« Installer »</strong>) puis validez <strong>« Ajouter »</strong>.
                  </li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'join' && (
            <div className="space-y-4">
              {/* Unique Family Code */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Votre Code de Foyer Actuel
                </span>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className="text-2xl font-black font-mono tracking-widest text-slate-900">
                    {householdCode}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    title="Copier le code"
                  >
                    {copiedCode ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Si votre compagne a déjà ouvert l'application, il lui suffit d'entrer ce code dans cet onglet « Code Foyer ».
                </p>
              </div>

              <form onSubmit={handleJoinSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rejoindre un autre code de foyer
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ex: DOUDOU-HOME"
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono uppercase tracking-widest focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 px-4 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    Fermer
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 shadow-sm cursor-pointer"
                  >
                    Synchroniser ce foyer
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
