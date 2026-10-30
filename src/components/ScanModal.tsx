import React, { useEffect, useRef, useState } from 'react';
import { FoodCategory, StorageZone } from '../types';
import {
  AlertTriangle,
  Barcode,
  Camera,
  Check,
  Loader2,
  PackagePlus,
  Plus,
  Search,
  Sparkles,
  Video,
  VideoOff,
  X,
} from 'lucide-react';

interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (item: {
    name: string;
    category: FoodCategory;
    zone: StorageZone;
    quantity: number;
    unit: string;
    expirationDays: number;
    autoRestock: boolean;
  }) => void;
}

interface OpenFoodFactsProduct {
  code: string;
  name: string;
  brand: string;
  quantityLabel: string;
  parsedQuantity: number;
  parsedUnit: string;
  category: FoodCategory;
  zone: StorageZone;
  expirationDays: number;
  imageUrl?: string;
  nutriscore?: string;
  allergens: string[];
}

const SAMPLE_BARCODES = [
  { code: '3017620422003', label: 'Nutella 400g' },
  { code: '3033490004523', label: 'Danone Activia Nature' },
  { code: '3228857000166', label: 'Pain de Mie Harrys' },
  { code: '3175680011480', label: 'Lait Demi-Écrémé Candia' },
  { code: '3045320094008', label: 'Compote Pomme Andros' },
];

export const ScanModal: React.FC<ScanModalProps> = ({ isOpen, onClose, onAddItem }) => {
  const [activeTab, setActiveTab] = useState<'barcode' | 'manual'>('barcode');

  // Barcode & OpenFoodFacts state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scannedProduct, setScannedProduct] = useState<OpenFoodFactsProduct | null>(null);
  const [autoAddOnScan, setAutoAddOnScan] = useState(false);
  const [addedBanner, setAddedBanner] = useState<string | null>(null);

  // Camera Scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  // Manual / Editable form state
  const [manualName, setManualName] = useState('');
  const [manualCategory, setManualCategory] = useState<FoodCategory>('dairy');
  const [manualZone, setManualZone] = useState<StorageZone>('fridge');
  const [manualQuantity, setManualQuantity] = useState(1);
  const [manualUnit, setManualUnit] = useState('pièce(s)');
  const [manualExpiryDays, setManualExpiryDays] = useState(7);
  const [manualAutoRestock, setManualAutoRestock] = useState(false);

  // Stop camera helper
  const stopCamera = () => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setLookupError(null);
    }
    return () => stopCamera();
  }, [isOpen]);

  if (!isOpen) return null;

  // Map OpenFoodFacts categories to our app categories & storage zones
  const inferCategoryAndZone = (
    categoriesTags: string[] = [],
    productName = ''
  ): { category: FoodCategory; zone: StorageZone; expirationDays: number } => {
    const joined = [...categoriesTags, productName].join(' ').toLowerCase();

    if (
      joined.includes('baby') ||
      joined.includes('bebe') ||
      joined.includes('bébé') ||
      joined.includes('infant') ||
      joined.includes('couche')
    ) {
      return { category: 'baby_care', zone: 'baby_care', expirationDays: 180 };
    }
    if (
      joined.includes('frozen') ||
      joined.includes('surgele') ||
      joined.includes('surgelé') ||
      joined.includes('glace')
    ) {
      return { category: 'frozen', zone: 'freezer', expirationDays: 120 };
    }
    if (
      joined.includes('meat') ||
      joined.includes('viande') ||
      joined.includes('poulet') ||
      joined.includes('jambon') ||
      joined.includes('fish') ||
      joined.includes('poisson') ||
      joined.includes('saumon')
    ) {
      return { category: 'meat_fish', zone: 'fridge', expirationDays: 4 };
    }
    if (
      joined.includes('dairy') ||
      joined.includes('lait') ||
      joined.includes('yaourt') ||
      joined.includes('yogurt') ||
      joined.includes('cheese') ||
      joined.includes('fromage') ||
      joined.includes('beurre') ||
      joined.includes('creme') ||
      joined.includes('crème') ||
      joined.includes('oeuf')
    ) {
      return { category: 'dairy', zone: 'fridge', expirationDays: 12 };
    }
    if (joined.includes('vegetable') || joined.includes('legume') || joined.includes('légume')) {
      return { category: 'vegetables', zone: 'fridge', expirationDays: 7 };
    }
    if (joined.includes('fruit') || joined.includes('compote') || joined.includes('pomme')) {
      return { category: 'fruits', zone: 'fridge', expirationDays: 10 };
    }
    if (
      joined.includes('bread') ||
      joined.includes('pain') ||
      joined.includes('brioche') ||
      joined.includes('bakery')
    ) {
      return { category: 'bakery', zone: 'pantry', expirationDays: 10 };
    }
    if (
      joined.includes('beverage') ||
      joined.includes('boisson') ||
      joined.includes('eau') ||
      joined.includes('jus')
    ) {
      return { category: 'beverages', zone: 'pantry', expirationDays: 90 };
    }
    return { category: 'pantry', zone: 'pantry', expirationDays: 180 };
  };

  // Parse quantity string from OpenFoodFacts (e.g. "400 g", "1.5 L", "4 x 125g")
  const parseProductQuantity = (rawQty?: string): { qty: number; unit: string } => {
    if (!rawQty) return { qty: 1, unit: 'pièce(s)' };
    const clean = rawQty.trim();
    const multiMatch = clean.match(/^(\d+)\s*[xX*]\s*(\d+\s*[a-zA-Z]+)/);
    if (multiMatch) {
      return { qty: parseInt(multiMatch[1], 10) || 1, unit: `lot (${multiMatch[2]})` };
    }
    const singleMatch = clean.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|l|L|pièces|pots|sachets)/i);
    if (singleMatch) {
      const val = parseFloat(singleMatch[1].replace(',', '.'));
      const u = singleMatch[2];
      if (!isNaN(val) && val > 0) {
        return { qty: val, unit: u };
      }
    }
    return { qty: 1, unit: clean.slice(0, 18) || 'pièce(s)' };
  };

  // Fetch product from OpenFoodFacts API
  const fetchOpenFoodFacts = async (rawCode: string) => {
    const code = rawCode.replace(/\D/g, '').trim();
    if (!code || code.length < 6) {
      setLookupError('Veuillez entrer un code-barres valide (8 à 13 chiffres).');
      return;
    }

    setIsLookingUp(true);
    setLookupError(null);

    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
      );
      const data = await res.json();

      if (!data || data.status === 0 || !data.product) {
        setLookupError(
          `Aucun produit trouvé sur OpenFoodFacts pour le code ${code}. Vous pouvez l'ajouter manuellement.`
        );
        setScannedProduct(null);
        return;
      }

      const p = data.product;
      const rawName =
        p.product_name_fr || p.product_name || p.generic_name_fr || p.generic_name || 'Produit scanné';
      const brand = p.brands ? p.brands.split(',')[0].trim() : '';
      const fullName = brand && !rawName.toLowerCase().includes(brand.toLowerCase())
        ? `${rawName} (${brand})`
        : rawName;

      const { category, zone, expirationDays } = inferCategoryAndZone(
        p.categories_tags || [],
        fullName
      );
      const { qty, unit } = parseProductQuantity(p.quantity);

      const allergensList: string[] = (p.allergens_tags || []).map((a: string) =>
        a.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')
      );

      const mapped: OpenFoodFactsProduct = {
        code,
        name: fullName,
        brand,
        quantityLabel: p.quantity || `${qty} ${unit}`,
        parsedQuantity: qty,
        parsedUnit: unit,
        category,
        zone,
        expirationDays,
        imageUrl: p.image_front_small_url || p.image_url,
        nutriscore: p.nutriscore_grade ? p.nutriscore_grade.toUpperCase() : undefined,
        allergens: allergensList,
      };

      setScannedProduct(mapped);
      setBarcodeInput(code);

      if (autoAddOnScan) {
        onAddItem({
          name: mapped.name,
          category: mapped.category,
          zone: mapped.zone,
          quantity: mapped.parsedQuantity,
          unit: mapped.parsedUnit,
          expirationDays: mapped.expirationDays,
          autoRestock: false,
        });
        setAddedBanner(`${mapped.name} ajouté au stock !`);
        setTimeout(() => setAddedBanner(null), 2500);
      }
    } catch {
      setLookupError('Erreur de connexion à OpenFoodFacts. Vérifiez votre connexion internet.');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Start live camera barcode scanner
  const startCameraScanner = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      setIsCameraActive(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);

      // Use native BarcodeDetector if available (Android Chrome / modern browsers)
      const BarcodeDetectorClass = (window as any).BarcodeDetector;
      if (BarcodeDetectorClass) {
        const detector = new BarcodeDetectorClass({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
        });
        scanIntervalRef.current = window.setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                const detectedCode = barcodes[0].rawValue;
                stopCamera();
                fetchOpenFoodFacts(detectedCode);
              }
            } catch {
              // ignore frame error
            }
          }
        }, 450);
      } else {
        setCameraError(
          'Votre navigateur ne supporte pas la détection vidéo directe : tapez les chiffres du code-barres ci-dessous.'
        );
      }
    } catch {
      setCameraError(
        "Impossible d'accéder à la caméra. Autorisez l'accès caméra ou saisissez le code-barres manuellement."
      );
      setIsCameraActive(false);
    }
  };

  const handleConfirmScannedProduct = () => {
    if (!scannedProduct) return;
    onAddItem({
      name: scannedProduct.name,
      category: scannedProduct.category,
      zone: scannedProduct.zone,
      quantity: scannedProduct.parsedQuantity,
      unit: scannedProduct.parsedUnit,
      expirationDays: scannedProduct.expirationDays,
      autoRestock: false,
    });
    setAddedBanner(`${scannedProduct.name} ajouté au stock !`);
    setScannedProduct(null);
    setBarcodeInput('');
    setTimeout(() => {
      setAddedBanner(null);
      onClose();
    }, 600);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) return;

    onAddItem({
      name: manualName.trim(),
      category: manualCategory,
      zone: manualZone,
      quantity: manualQuantity,
      unit: manualUnit,
      expirationDays: manualExpiryDays,
      autoRestock: manualAutoRestock,
    });
    setManualName('');
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-lg shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[88dvh] animate-slide-up"
      >
        {/* Header */}
        <div className="px-4 py-3.5 sm:px-5 sm:py-4 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Barcode className="w-5 h-5 text-emerald-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold truncate">
              Scanner Code-Barres & Ajout Stock
            </h3>
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

        {/* View Switcher */}
        <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 p-1.5 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('barcode')}
            className={`py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 truncate cursor-pointer ${
              activeTab === 'barcode'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Barcode className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate">Scan Code-Barres</span>
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('manual');
            }}
            className={`py-2 px-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 truncate cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate">Saisie Manuelle</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {addedBanner && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{addedBanner}</span>
            </div>
          )}

          {activeTab === 'barcode' ? (
            <div className="space-y-4">
              {/* Camera Scanner Box */}
              <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800">
                {isCameraActive ? (
                  <div className="relative h-48 bg-black flex items-center justify-center">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                    />
                    <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse" />
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="absolute bottom-3 right-3 px-3 py-1.5 bg-slate-900/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <VideoOff className="w-3.5 h-3.5 text-rose-400" />
                      <span>Arrêter la caméra</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                        <Camera className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-white text-xs font-bold">
                          Scanner avec la caméra du téléphone
                        </p>
                        <p className="text-slate-400 text-[11px]">
                          Détection automatique EAN-13 / EAN-8 reliée à OpenFoodFacts
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={startCameraScanner}
                      className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Video className="w-4 h-4" />
                      <span>Activer la caméra</span>
                    </button>
                  </div>
                )}
              </div>

              {cameraError && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                  {cameraError}
                </p>
              )}

              {/* Barcode Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchOpenFoodFacts(barcodeInput);
                }}
                className="space-y-2"
              >
                <label className="block text-xs font-bold text-slate-700">
                  Ou saisissez les chiffres du code-barres (EAN) :
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Barcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder="Ex: 3017620422003"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLookingUp}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {isLookingUp ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span>Rechercher</span>
                  </button>
                </div>

                {/* Auto-add checkbox */}
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoAddOnScan}
                    onChange={(e) => setAutoAddOnScan(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] text-slate-600 font-medium">
                    Ajouter immédiatement au stock dès que le code-barres est reconnu
                  </span>
                </label>
              </form>

              {/* Quick sample barcodes for testing */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 mb-1.5">
                  Exemples de codes-barres OpenFoodFacts à tester en 1 clic :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_BARCODES.map((sample) => (
                    <button
                      key={sample.code}
                      type="button"
                      onClick={() => {
                        setBarcodeInput(sample.code);
                        fetchOpenFoodFacts(sample.code);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              {lookupError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
                  <span>{lookupError}</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('manual')}
                    className="px-2.5 py-1 bg-white border border-rose-200 rounded-lg font-bold text-[11px] shrink-0 cursor-pointer"
                  >
                    Saisie manuelle
                  </button>
                </div>
              )}

              {/* Scanned OpenFoodFacts Product Result Card */}
              {scannedProduct && (
                <div className="p-4 rounded-2xl bg-emerald-50/60 border-2 border-emerald-400 space-y-3">
                  <div className="flex items-start gap-3">
                    {scannedProduct.imageUrl ? (
                      <img
                        src={scannedProduct.imageUrl}
                        alt={scannedProduct.name}
                        className="w-16 h-16 rounded-xl object-contain bg-white border border-slate-200 p-1 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-xl shrink-0">
                        📦
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                          EAN {scannedProduct.code}
                        </span>
                        {scannedProduct.nutriscore && (
                          <span className="text-[10px] font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded">
                            Nutri-Score {scannedProduct.nutriscore}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mt-1">
                        {scannedProduct.name}
                      </h4>
                      <p className="text-xs text-slate-600">
                        Format détecté : <strong>{scannedProduct.quantityLabel}</strong>
                      </p>
                      {scannedProduct.allergens.length > 0 && (
                        <p className="text-[11px] text-amber-800 font-semibold mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Allergènes : {scannedProduct.allergens.join(', ')}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Quick adjustments before adding to stock */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200/70">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Emplacement
                      </label>
                      <select
                        value={scannedProduct.zone}
                        onChange={(e) =>
                          setScannedProduct({
                            ...scannedProduct,
                            zone: e.target.value as StorageZone,
                          })
                        }
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      >
                        <option value="fridge">❄️ Frigo</option>
                        <option value="pantry">🥫 Placard</option>
                        <option value="freezer">🧊 Congélateur</option>
                        <option value="baby_care">🍼 Bébé</option>
                        <option value="household">🧺 Ménage</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Quantité
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={scannedProduct.parsedQuantity}
                        onChange={(e) =>
                          setScannedProduct({
                            ...scannedProduct,
                            parsedQuantity: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Conservation (j)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={scannedProduct.expirationDays}
                        onChange={(e) =>
                          setScannedProduct({
                            ...scannedProduct,
                            expirationDays: Math.max(1, Number(e.target.value)),
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmScannedProduct}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <PackagePlus className="w-4 h-4" />
                    <span>Ajouter directement dans le stock</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Manual Custom Form */
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom du produit *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Courgettes bio, Lessive bébé, Lait..."
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catégorie
                  </label>
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value as FoodCategory)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="vegetables">🥦 Légumes</option>
                    <option value="fruits">🍎 Fruits</option>
                    <option value="dairy">🥛 Produits Laitiers & Œufs</option>
                    <option value="meat_fish">🥩 Viandes & Poissons</option>
                    <option value="pantry">🥫 Épicerie</option>
                    <option value="bakery">🥖 Boulangerie</option>
                    <option value="frozen">🧊 Surgelés</option>
                    <option value="baby_care">🍼 Soins Bébé & Couches</option>
                    <option value="breast_milk">🤱 Lait Maternel</option>
                    <option value="household">🧺 Ménage & Lessive</option>
                    <option value="hygiene">🧼 Hygiène</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Emplacement
                  </label>
                  <select
                    value={manualZone}
                    onChange={(e) => setManualZone(e.target.value as StorageZone)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="fridge">❄️ Frigo</option>
                    <option value="freezer">🧊 Congélateur</option>
                    <option value="pantry">🥫 Placard</option>
                    <option value="baby_care">🍼 Espace Bébé</option>
                    <option value="household">🧺 Buanderie / Ménage</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantité
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={manualQuantity}
                    onChange={(e) => setManualQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unité</label>
                  <select
                    value={manualUnit}
                    onChange={(e) => setManualUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  >
                    <option value="pièce(s)">pièce(s)</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="L">L</option>
                    <option value="pot(s)">pot(s)</option>
                    <option value="paquet">paquet</option>
                    <option value="boîte">boîte</option>
                    <option value="flacon">flacon</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Expire dans (j)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="720"
                    value={manualExpiryDays}
                    onChange={(e) => setManualExpiryDays(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoRestock"
                  checked={manualAutoRestock}
                  onChange={(e) => setManualAutoRestock(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="autoRestock" className="text-xs text-slate-700">
                  Ajouter automatiquement aux courses quand le stock est épuisé
                </label>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                >
                  Ajouter au stock
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
