import React, { useState, useRef, useEffect } from 'react';
import { FoodCategory, StorageZone } from '../types';
import {
  Camera,
  Check,
  ClipboardPaste,
  FilePlus2,
  Loader2,
  Receipt,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

export interface DetectedReceiptItem {
  id: string;
  name: string;
  rawDesignation?: string;
  driveSpec?: string;
  category: FoodCategory;
  zone: StorageZone;
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalPrice?: number;
  expirationDays: number;
  confidence: number;
  selected: boolean;
}

interface PhotoScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDetectedItems: (
    items: Array<{
      name: string;
      rawDesignation?: string;
      driveSpec?: string;
      unitPrice?: number;
      category: FoodCategory;
      zone: StorageZone;
      quantity: number;
      unit: string;
      expirationDays: number;
      autoRestock: boolean;
    }>,
    options?: {
      memorizeDriveSpecs?: boolean;
      storeLocation?: string;
    }
  ) => void;
}

export const PhotoScanModal: React.FC<PhotoScanModalProps> = ({
  isOpen,
  onClose,
  onAddDetectedItems,
}) => {
  const [scanType, setScanType] = useState<'receipt' | 'groceries' | 'paste_text'>('receipt');
  const [mode, setMode] = useState<'upload' | 'camera' | 'results'>('upload');
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [detectedStoreLocation, setDetectedStoreLocation] = useState<string>('');
  const [detectedOrderNumber, setDetectedOrderNumber] = useState<string>('');
  const [detectedItems, setDetectedItems] = useState<DetectedReceiptItem[]>([]);
  const [memorizeDriveSpecs, setMemorizeDriveSpecs] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appendFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setMode('upload');
      setImagePreviews([]);
      setPastedText('');
      setScanError(null);
      setDetectedItems([]);
      setDetectedStoreLocation('');
      setDetectedOrderNumber('');
    }
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1600 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      setMode('camera');
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 50);
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError('Impossible d’accéder à la caméra. Importez votre capture ou PDF ci-dessous.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const capturePhotoFromCamera = () => {
    if (!videoRef.current) return;
    const rawW = videoRef.current.videoWidth || 1280;
    const rawH = videoRef.current.videoHeight || 720;
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(rawW, rawH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rawW * scale);
    canvas.height = Math.round(rawH * scale);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setImagePreviews([dataUrl]);
      stopCamera();
      analyzePayload({
        images: [{ imageBase64: dataUrl, mimeType: 'image/jpeg' }],
        activeScanType: scanType === 'groceries' ? 'groceries' : 'receipt',
        appendToExisting: false,
      });
    }
  };

  // Compress image files on canvas (max 1400px, JPEG 0.80) so 6MB phone screenshots shrink to ~130KB for instant OCR
  const compressImageFileIfNeeded = (
    file: File
  ): Promise<{ imageBase64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (ev) => {
        const rawDataUrl = (ev.target?.result as string) || '';
        if (!file.type.startsWith('image/')) {
          resolve({
            imageBase64: rawDataUrl,
            mimeType: file.type || 'application/pdf',
          });
          return;
        }
        const img = new Image();
        img.onerror = () =>
          resolve({
            imageBase64: rawDataUrl,
            mimeType: file.type || 'image/jpeg',
          });
        img.onload = () => {
          const maxDim = 1450;
          const w = img.naturalWidth || img.width || 1200;
          const h = img.naturalHeight || img.height || 1600;
          const scale = Math.min(1, maxDim / Math.max(w, h));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ imageBase64: rawDataUrl, mimeType: file.type || 'image/jpeg' });
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressedUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve({
            imageBase64: compressedUrl,
            mimeType: 'image/jpeg',
          });
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const readFilesAsDataUrls = (
    files: FileList
  ): Promise<Array<{ imageBase64: string; mimeType: string }>> => {
    const fileArray = Array.from(files);
    return Promise.all(fileArray.map((file) => compressImageFileIfNeeded(file)));
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    appendToExisting: boolean = false
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const encodedList = await readFilesAsDataUrls(files);
      const urls = encodedList.map((x) => x.imageBase64);
      setImagePreviews((prev) => (appendToExisting ? [...prev, ...urls] : urls));
      await analyzePayload({
        images: encodedList,
        activeScanType: scanType === 'groceries' ? 'groceries' : 'receipt',
        appendToExisting,
      });
    } catch (err) {
      console.error('File read error:', err);
      setScanError('Impossible de lire ce fichier.');
    } finally {
      e.target.value = '';
    }
  };

  const handleAnalyzePastedText = async () => {
    if (!pastedText.trim()) return;
    await analyzePayload({
      rawText: pastedText.trim(),
      activeScanType: 'receipt',
      appendToExisting: false,
    });
  };

  const analyzePayload = async ({
    images,
    rawText,
    activeScanType,
    appendToExisting,
  }: {
    images?: Array<{ imageBase64: string; mimeType: string }>;
    rawText?: string;
    activeScanType: 'receipt' | 'groceries';
    appendToExisting: boolean;
  }) => {
    setIsAnalyzing(true);
    setScanError(null);
    setMode('results');

    try {
      const response = await fetch('/api/scan/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          imageBase64: images?.[0]?.imageBase64,
          mimeType: images?.[0]?.mimeType || 'image/jpeg',
          rawText,
          language: 'fr',
          scanType: activeScanType,
        }),
      });

      const data = await response.json();
      if (data?.storeLocation) {
        setDetectedStoreLocation(data.storeLocation);
      }
      if (data?.orderNumber) {
        setDetectedOrderNumber(data.orderNumber);
      }

      if (data && Array.isArray(data.detectedItems) && data.detectedItems.length > 0) {
        const mapped: DetectedReceiptItem[] = data.detectedItems.map((item: any, idx: number) => ({
          id: `det-${Date.now()}-${idx}`,
          name: item.name || 'Article reconnu',
          rawDesignation: item.rawDesignation || item.name || '',
          driveSpec: item.driveSpec || item.brandOrSpec || '',
          category: (item.category as FoodCategory) || 'pantry',
          zone: (item.zone as StorageZone) || 'pantry',
          quantity: Math.max(1, Number(item.quantity) || 1),
          unit: item.unit || 'pièce(s)',
          unitPrice: Number(item.unitPrice) || 0,
          totalPrice: Number(item.totalPrice) || 0,
          expirationDays: Number(item.expirationDays) || 14,
          confidence: Number(item.confidence) || 98,
          selected: true,
        }));

        setDetectedItems((prev) => (appendToExisting ? [...prev, ...mapped] : mapped));
      } else if (data?.error) {
        setScanError(data.error);
      } else {
        setScanError('Aucun article lisible détecté. Essayez avec une capture plus nette.');
      }
    } catch (err) {
      console.error('Error analyzing receipt/photo:', err);
      setScanError('Erreur réseau lors de l’analyse du ticket.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleItem = (id: string) => {
    setDetectedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i))
    );
  };

  const handleDeleteDetectedItem = (id: string) => {
    setDetectedItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleUpdateItem = (id: string, updates: Partial<DetectedReceiptItem>) => {
    setDetectedItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
  };

  const handleConfirmStore = () => {
    const selected = detectedItems.filter((i) => i.selected);
    if (selected.length === 0) return;

    onAddDetectedItems(
      selected.map((item) => ({
        name: item.name,
        rawDesignation: item.rawDesignation,
        driveSpec: item.driveSpec,
        unitPrice: item.unitPrice,
        category: item.category,
        zone: item.zone,
        quantity: item.quantity,
        unit: item.unit,
        expirationDays: item.expirationDays,
        autoRestock: item.zone === 'baby_care' || item.zone === 'household',
      })),
      {
        memorizeDriveSpecs,
        storeLocation: detectedStoreLocation,
      }
    );

    onClose();
  };

  if (!isOpen) return null;

  const selectedItems = detectedItems.filter((i) => i.selected);
  const totalReceiptAmount = selectedItems.reduce(
    (sum, it) =>
      sum + (it.totalPrice && it.totalPrice > 0 ? it.totalPrice : (it.unitPrice || 0) * it.quantity),
    0
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-2xl max-h-[92dvh] shadow-2xl overflow-hidden border border-slate-200 flex flex-col animate-slide-up"
      >
        {/* Modal Header */}
        <div className="px-4 py-3.5 sm:px-5 sm:py-4 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-base font-bold font-display truncate">
                Scan Bon E.Leclerc Drive & Ticket Haute Précision
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                Extraction exacte des quantités, grammages (g/kg/L/lots) et marques Drive
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

        {/* Mode Switcher: Receipt/Drive vs Text Paste vs Groceries Photo */}
        {mode === 'upload' && (
          <div className="px-4 sm:px-5 pt-3.5 shrink-0">
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setScanType('receipt')}
                className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 truncate transition-all cursor-pointer ${
                  scanType === 'receipt'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">🧾 Bon Drive / Ticket</span>
              </button>
              <button
                type="button"
                onClick={() => setScanType('paste_text')}
                className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 truncate transition-all cursor-pointer ${
                  scanType === 'paste_text'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">📋 Coller Texte PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setScanType('groceries')}
                className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 truncate transition-all cursor-pointer ${
                  scanType === 'groceries'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">📸 Photo Frigo</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {mode === 'camera' && (
            <div className="flex flex-col items-center">
              <div className="relative w-full max-w-md h-72 bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-6 border-2 border-dashed border-emerald-400/80 rounded-2xl pointer-events-none flex items-end justify-center pb-3">
                  <span className="text-[11px] bg-slate-950/80 text-emerald-300 px-3 py-1 rounded-full backdrop-blur-md">
                    {scanType === 'groceries'
                      ? 'Cadrez vos produits'
                      : 'Cadrez les colonnes Désignation, Quantité et Prix'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setMode('upload');
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={capturePhotoFromCamera}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Capturer & Extraire</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'upload' && (
            <div className="space-y-4">
              {cameraError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  {cameraError}
                </div>
              )}

              {scanType === 'paste_text' ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950">
                    <strong>📋 Copier-coller direct du Bon de Commande E.Leclerc Drive :</strong>{' '}
                    Ouvrez votre PDF ou email de commande E.Leclerc Drive, copiez les lignes et
                    collez-les ci-dessous pour une extraction instantanée à 100% des quantités,
                    grammages et prix.
                  </div>
                  <textarea
                    rows={7}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={`Exemple :\nTomates cerises colorées - Panier du Primeur - 350g   2   2.79   5.58\nKiwis - 4p   5   3.95   19.75\nOeufs plein air Matines - Moyen - x12   2   3.58   7.16`}
                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    disabled={!pastedText.trim()}
                    onClick={handleAnalyzePastedText}
                    className="w-full min-h-[46px] py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Extraire les produits, quantités et grammages</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950">
                    {scanType === 'receipt' ? (
                      <p>
                        <strong>🧾 Spécial Bon de commande E.Leclerc Drive & Tickets :</strong>{' '}
                        Importez une ou plusieurs captures d’écran (pages 1/3, 2/3, 3/3) ou votre
                        PDF. Le moteur vérifie mathématiquement chaque <strong>Quantité</strong>{' '}
                        (Total ÷ Prix unitaire), récupère le <strong>grammage exact</strong>{' '}
                        (<em>350g, 1,4kg, 16x100g, 6x1,5L, x12, 4p…</em>) et mémorise vos marques
                        habituelles pour vos prochains Drives.
                      </p>
                    ) : (
                      <p>
                        <strong>📸 Mode Photo Frigo / Courses :</strong> Prenez une photo de vos
                        produits pour identifier les articles et leurs formats d’un seul coup.
                      </p>
                    )}
                  </div>

                  {/* Action Buttons: Multi-File Upload vs Camera */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="p-6 rounded-2xl border-2 border-emerald-500/60 bg-emerald-50/40 hover:bg-emerald-50 text-slate-800 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group"
                    >
                      <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-bold text-slate-900 text-center">
                        Importer Capture(s) ou PDF
                      </span>
                      <span className="text-[11px] text-slate-500 text-center">
                        Vous pouvez sélectionner plusieurs pages (1/3, 2/3…) d’un coup
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,application/pdf"
                        onChange={(e) => handleFileUpload(e, false)}
                        className="hidden"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={startCamera}
                      className="p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/50 hover:bg-slate-50 text-slate-800 flex flex-col items-center justify-center gap-2 transition-all group cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center group-hover:bg-emerald-100 group-hover:text-emerald-700 transition-colors">
                        <Camera className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-bold text-slate-900">
                        {scanType === 'receipt' ? 'Photographier le ticket' : 'Prendre une photo'}
                      </span>
                      <span className="text-[11px] text-slate-500 text-center">
                        Utiliser l’appareil photo du téléphone
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {mode === 'results' && (
            <div className="space-y-4">
              {/* Top Status Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900 text-white rounded-2xl">
                <div className="flex items-center gap-3 min-w-0">
                  {imagePreviews.length > 0 && (
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700 relative">
                      <img
                        src={imagePreviews[0]}
                        alt="Capture"
                        className="w-full h-full object-cover"
                      />
                      {imagePreviews.length > 1 && (
                        <span className="absolute bottom-0.5 right-0.5 px-1 bg-blue-600 text-[9px] font-extrabold rounded">
                          +{imagePreviews.length - 1}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {detectedStoreLocation
                          ? `Bon Drive ${detectedStoreLocation}`
                          : 'Extraction Haute Précision (Quantités & Grammages)'}
                        {detectedOrderNumber ? ` · Commande n°${detectedOrderNumber}` : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {isAnalyzing
                        ? 'Vérification des quantités, grammages (g/kg/L/lots) et rayons...'
                        : `${detectedItems.length} ligne(s) extraite(s)${
                            totalReceiptAmount > 0
                              ? ` · Total détecté : ${totalReceiptAmount.toFixed(2)} €`
                              : ''
                          }`}
                    </p>
                  </div>
                </div>

                {!isAnalyzing && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => appendFileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      title="Ajouter la page suivante du bon de commande (ex: page 3/3)"
                    >
                      <FilePlus2 className="w-3.5 h-3.5" />
                      <span>+ Ajouter une page</span>
                    </button>
                    <input
                      ref={appendFileInputRef}
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => handleFileUpload(e, true)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setMode('upload')}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold cursor-pointer"
                    >
                      Recommencer
                    </button>
                  </div>
                )}
              </div>

              {scanError && !isAnalyzing && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
                  {scanError}
                </div>
              )}

              {isAnalyzing ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                  <p className="text-sm font-bold text-slate-800">
                    Lecture haute précision des colonnes Désignation, Quantité & Grammage...
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Calcul automatique des lots (ex: 2 × 350g = 700g, 5 × 4p = 20 pièces, 2 × x12 =
                    24 œufs) et classement Frigo / Placard / Ménage.
                  </p>
                </div>
              ) : (
                detectedItems.length > 0 && (
                  <div className="space-y-3">
                    {/* Option to auto-save E.Leclerc Drive formats & brands */}
                    <label className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200 flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={memorizeDriveSpecs}
                        onChange={(e) => setMemorizeDriveSpecs(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 mt-0.5 cursor-pointer"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 block">
                          Mémoriser automatiquement ces marques & grammages pour mes prochains
                          Drives E.Leclerc
                        </span>
                        <span className="text-[11px] text-slate-600">
                          Enregistre les formats détectés (ex: <em>Matines Moyen x12</em>,{' '}
                          <em>Elle&amp;Vire 250g</em>, <em>Panier du Primeur 350g</em>,{' '}
                          <em>Délisse 1kg</em>) dans vos préférences Drive.
                        </span>
                      </div>
                    </label>

                    <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                      <span className="font-bold">
                        Vérifiez ou ajustez librement les quantités et grammages :
                      </span>
                      <span className="font-bold text-emerald-700">
                        {selectedItems.length} / {detectedItems.length} sélectionné(s)
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {detectedItems.map((item) => (
                        <div
                          key={item.id}
                          className={`p-3 rounded-2xl border transition-all space-y-2 ${
                            item.selected
                              ? 'bg-white border-slate-200 shadow-2xs'
                              : 'bg-slate-50 border-slate-200/60 opacity-60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => handleToggleItem(item.id)}
                                className="w-4 h-4 text-emerald-600 rounded border-slate-300 mt-1 cursor-pointer shrink-0"
                              />
                              <div className="min-w-0 flex-1 space-y-1">
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) =>
                                    handleUpdateItem(item.id, { name: e.target.value })
                                  }
                                  className="w-full font-extrabold text-xs sm:text-sm text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-none bg-transparent"
                                />
                                {item.driveSpec !== undefined && (
                                  <div className="flex items-center gap-1 text-[11px] text-blue-700">
                                    <Tag className="w-3 h-3 shrink-0" />
                                    <input
                                      type="text"
                                      value={item.driveSpec}
                                      onChange={(e) =>
                                        handleUpdateItem(item.id, { driveSpec: e.target.value })
                                      }
                                      placeholder="Format / marque Drive (ex: Matines x12, 350g...)"
                                      className="w-full text-[11px] font-semibold text-blue-700 bg-transparent border-b border-transparent hover:border-blue-300 focus:border-blue-500 focus:outline-none"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {item.totalPrice ? (
                                <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold tabular-nums">
                                  {item.totalPrice.toFixed(2)} €
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleDeleteDetectedItem(item.id)}
                                className="p-1 text-slate-300 hover:text-rose-600 rounded-lg cursor-pointer"
                                title="Retirer cette ligne"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Editable Quantity + Editable Grammage/Packaging + Zone/Category */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                value={item.zone}
                                onChange={(e) =>
                                  handleUpdateItem(item.id, {
                                    zone: e.target.value as StorageZone,
                                  })
                                }
                                className="px-2 py-1 bg-slate-100 rounded-lg text-[11px] font-bold text-slate-700 border-0"
                              >
                                <option value="fridge">❄️ Frigo</option>
                                <option value="pantry">🥫 Placard / Épicerie</option>
                                <option value="freezer">🧊 Congélateur</option>
                                <option value="baby_care">👶 Bébé</option>
                                <option value="household">🧹 Ménage & Hygiène</option>
                              </select>

                              <select
                                value={item.category}
                                onChange={(e) =>
                                  handleUpdateItem(item.id, {
                                    category: e.target.value as FoodCategory,
                                  })
                                }
                                className="px-2 py-1 bg-slate-100 rounded-lg text-[11px] font-medium text-slate-700 border-0"
                              >
                                <option value="vegetables">🥦 Légumes</option>
                                <option value="fruits">🍎 Fruits</option>
                                <option value="dairy">🥛 Crèmerie / Œufs / Beurre</option>
                                <option value="meat_fish">🥩 Viandes & Poissons</option>
                                <option value="pantry">🥫 Épicerie salée & sucrée</option>
                                <option value="beverages">🥤 Boissons</option>
                                <option value="bakery">🥖 Boulangerie</option>
                                <option value="frozen">🧊 Surgelés</option>
                                <option value="baby_care">🍼 Bébé</option>
                                <option value="hygiene">🧼 Hygiène & Beauté</option>
                                <option value="household">🧹 Entretien & Nettoyage</option>
                              </select>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-500 font-semibold">Qté:</span>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  handleUpdateItem(item.id, {
                                    quantity: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                className="w-12 px-1.5 py-1 text-center bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-extrabold text-emerald-950 tabular-nums"
                                title="Quantité achetée (colonne Quantité)"
                              />
                              <span className="text-[11px] text-slate-400">×</span>
                              <input
                                type="text"
                                value={item.unit}
                                onChange={(e) =>
                                  handleUpdateItem(item.id, {
                                    unit: e.target.value,
                                  })
                                }
                                className="w-40 sm:w-48 px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                                title="Grammage / Conditionnement (ex: 350g, 1,4kg, boîte x12...)"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Fermer
          </button>

          {mode === 'results' && !isAnalyzing && selectedItems.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmStore}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>
                Ranger {selectedItems.length} article(s) dans mes stocks
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
