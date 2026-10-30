import React, { useState } from 'react';
import { LoyaltyCard, StoreDeal, StoreLocation, Language } from '../types';
import { translations } from '../i18n/translations';
import { BarcodeView } from './BarcodeView';
import {
  CreditCard,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  QrCode,
  Search,
  Store,
  Trash2,
  X,
} from 'lucide-react';

interface LoyaltyViewProps {
  cards: LoyaltyCard[];
  stores: StoreLocation[];
  deals: StoreDeal[];
  lang: Language;
  onAddCard: (card: Omit<LoyaltyCard, 'id'>) => void;
  onDeleteCard: (id: string) => void;
  onGeolocate: () => void;
  onSearchCity?: (query: string) => Promise<void>;
  isLocating: boolean;
  userCoords: { lat: number; lng: number } | null;
  cityName?: string;
  storeRadiusKm?: number;
  onUpdateStoreRadius?: (radiusKm: number) => void;
}

export const LoyaltyView: React.FC<LoyaltyViewProps> = ({
  cards,
  stores,
  deals,
  lang,
  onAddCard,
  onDeleteCard,
  onGeolocate,
  onSearchCity,
  isLocating,
  userCoords,
  cityName = 'Position non définie',
  storeRadiusKm = 15,
  onUpdateStoreRadius,
}) => {
  const t = translations[lang] || translations.fr;
  const [activeBarcodeCard, setActiveBarcodeCard] = useState<LoyaltyCard | null>(null);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [isSearchingCity, setIsSearchingCity] = useState(false);

  // New card form state
  const [storeName, setStoreName] = useState('Carrefour');
  const [cardNumber, setCardNumber] = useState('');
  const [barcodeType, setBarcodeType] = useState<'EAN13' | 'CODE128' | 'QR'>('CODE128');

  const brandPresets = [
    { name: 'Carrefour', code: 'carrefour', color: '#004e98', accent: '#3a86ff' },
    { name: 'E.Leclerc', code: 'leclerc', color: '#0055b8', accent: '#ff7900' },
    { name: 'Lidl', code: 'lidl', color: '#0050aa', accent: '#fff000' },
    { name: 'Intermarché', code: 'intermarche', color: '#c9141d', accent: '#e63946' },
    { name: 'Auchan', code: 'auchan', color: '#d90429', accent: '#ef233c' },
    { name: 'Système U', code: 'custom', color: '#0284c7', accent: '#38bdf8' },
    { name: 'Monoprix', code: 'monoprix', color: '#111827', accent: '#e11d48' },
  ];

  const handleCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber.trim()) return;

    const matched = brandPresets.find(
      (b) => b.name.toLowerCase() === storeName.toLowerCase()
    );

    onAddCard({
      storeName: storeName.trim(),
      brandCode: (matched?.code as any) || 'custom',
      cardNumber: cardNumber.trim(),
      barcodeType: barcodeType,
      color: matched?.color || '#334155',
      accentColor: matched?.accent || '#64748b',
      cashbackBalance: 0.0,
      notes: 'Carte ajoutée manuellement',
    });

    setCardNumber('');
    setIsAddingCard(false);
  };

  const handleCitySearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityQuery.trim() || !onSearchCity) return;
    setIsSearchingCity(true);
    try {
      await onSearchCity(cityQuery.trim());
      setCityQuery('');
    } finally {
      setIsSearchingCity(false);
    }
  };

  const totalCashback = cards.reduce((acc, c) => acc + c.cashbackBalance, 0);

  return (
    <div className="space-y-5">
      {/* Header: Wallet & Add Card */}
      <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
            <CreditCard className="w-4 h-4" />
            <span>Porte-Cartes & Magasins Autour de Vous</span>
          </div>
          <h2 className="text-lg font-bold font-display">{t.loyaltyTitle}</h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Scannez vos cartes en caisse et visualisez les vrais supermarchés dans un rayon de {storeRadiusKm} km.
          </p>
          {cards.length > 0 && (
            <div className="flex items-center gap-2 mt-2.5">
              <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-xl font-semibold">
                Cagnottes cumulées : {totalCashback.toFixed(2)} €
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsAddingCard(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 justify-center cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.addCard}</span>
        </button>
      </div>

      {/* Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-sm font-bold text-slate-900">
            {t.myCards} ({cards.length})
          </h3>
          {cards.length > 0 && (
            <span className="text-xs text-slate-500">
              Touchez une carte pour afficher le code-barres
            </span>
          )}
        </div>

        {cards.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center">
            <QrCode className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">
              Aucune carte de fidélité enregistrée
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
              Ajoutez vos cartes (Leclerc, Carrefour, Lidl, Intermarché...) pour les avoir toujours sous la main.
            </p>
            <button
              onClick={() => setIsAddingCard(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter ma première carte</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cards.map((card) => (
              <div
                key={card.id}
                onClick={() => setActiveBarcodeCard(card)}
                className="p-4 rounded-2xl cursor-pointer text-white relative overflow-hidden transition-all duration-200 hover:scale-[1.01] shadow-xs flex flex-col justify-between h-36 group"
                style={{
                  backgroundColor: card.color,
                  backgroundImage: `linear-gradient(135deg, ${card.color} 0%, #0f172a 100%)`,
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
                      Carte Fidélité
                    </span>
                    <h4 className="text-base font-bold tracking-tight">{card.storeName}</h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCard(card.id);
                      }}
                      className="w-7 h-7 rounded-full bg-black/25 hover:bg-rose-500/80 flex items-center justify-center transition-colors"
                      title="Supprimer la carte"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                      <QrCode className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="font-mono text-xs tracking-wider opacity-90">{card.cardNumber}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/20 text-xs">
                    <span className="text-[11px] opacity-80">Toucher pour scanner</span>
                    <span className="font-bold text-emerald-300">
                      {card.barcodeType}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unified Geolocation (Shared with Weather) & Real Nearby Supermarkets */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-emerald-700">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>Position : {cityName}</span>
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px]">
                Rayon : {storeRadiusKm} km
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Supermarchés autour de vous (jusqu'à {storeRadiusKm} km)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Supermarchés, hypermarchés, drives et magasins de proximité détectés autour de votre position ou commune.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
            {/* Search Radius Selector (5 / 10 / 15 / 25 km) */}
            {onUpdateStoreRadius && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 px-1.5">Rayon :</span>
                {[5, 10, 15, 25].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onUpdateStoreRadius(r)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      storeRadiusKm === r
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            )}

            {/* Manual City / Postal Code Search */}
            {onSearchCity && (
              <form onSubmit={handleCitySearchSubmit} className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder="Ville ou code postal..."
                    className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500 w-full sm:w-44"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearchingCity || !cityQuery.trim()}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  {isSearchingCity ? '...' : 'Chercher'}
                </button>
              </form>
            )}

            <button
              onClick={onGeolocate}
              disabled={isLocating}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors shrink-0 cursor-pointer"
            >
              <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
              <span>
                {isLocating ? 'Recherche...' : 'Position GPS'}
              </span>
            </button>
          </div>
        </div>

        {/* Real Stores list */}
        {isLocating ? (
          <div className="py-10 text-center space-y-2">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
            <p className="text-xs font-semibold text-slate-600">
              Recherche des supermarchés dans un rayon de {storeRadiusKm} km autour de {cityName}...
            </p>
          </div>
        ) : stores.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80 p-4 space-y-2.5">
            <Store className="w-7 h-7 text-slate-400 mx-auto" />
            <div>
              <p className="text-xs font-bold text-slate-700">
                Aucun supermarché trouvé à moins de {storeRadiusKm} km de {cityName}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                Saisissez votre code postal ou nom de commune ci-dessus, activez le GPS, ou élargissez le rayon de recherche.
              </p>
            </div>
            {onUpdateStoreRadius && storeRadiusKm < 25 && (
              <button
                type="button"
                onClick={() => onUpdateStoreRadius(25)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                <span>Élargir la recherche à 25 km</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {stores.map((store) => {
              const hasUserCard = cards.some(
                (c) =>
                  c.brandCode.toLowerCase() === store.brandCode.toLowerCase() ||
                  store.name.toLowerCase().includes(c.storeName.toLowerCase())
              );
              const storeDeals = deals.filter(
                (d) => d.brandCode.toLowerCase() === store.brandCode.toLowerCase()
              );

              return (
                <div
                  key={store.id}
                  className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-slate-50/60 flex flex-col justify-between transition-colors"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Store className="w-4 h-4 text-emerald-600 shrink-0" />
                          <h4 className="text-sm font-bold text-slate-900">{store.name}</h4>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {store.address ? `${store.address}, ` : ''}
                          {store.city}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-900 text-white text-xs font-bold">
                          {store.distanceKm.toFixed(1)} km
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-200/70">
                      <div className="flex items-center gap-2">
                        {hasUserCard ? (
                          <span className="text-[11px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-md">
                            Carte fidélité enregistrée ✓
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            À {store.distanceKm.toFixed(1)} km à vol d'oiseau
                          </span>
                        )}
                      </div>

                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${store.name} ${store.city}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800"
                      >
                        <span>Itinéraire</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {storeDeals.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-1.5">
                        {storeDeals.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center gap-2 text-xs bg-white p-2 rounded-xl border border-slate-200/70"
                          >
                            <span className="text-rose-600 font-bold shrink-0">
                              -{d.discountPercent}%
                            </span>
                            <span className="text-slate-800 font-medium line-clamp-1">
                              {d.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barcode Modal for Store Checkout */}
      {activeBarcodeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm">
            <BarcodeView
              card={activeBarcodeCard}
              onClose={() => setActiveBarcodeCard(null)}
            />
          </div>
        </div>
      )}

      {/* Add Card Modal */}
      {isAddingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-base font-bold font-display">Ajouter une carte de fidélité</h3>
              <button
                onClick={() => setIsAddingCard(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCardSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enseigne de supermarché
                </label>
                <select
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {brandPresets.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                  <option value="Autre enseigne">Autre supermarché</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Numéro de carte ou code client *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: 9135 2400 8192 4810"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Type de code-barres à générer
                </label>
                <select
                  value={barcodeType}
                  onChange={(e) => setBarcodeType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="CODE128">Code-barres 1D standard (Code 128)</option>
                  <option value="EAN13">Code-barres EAN-13 (13 chiffres)</option>
                  <option value="QR">QR Code (Format Lidl Plus)</option>
                </select>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCard(false)}
                  className="flex-1 py-2.5 px-4 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 shadow-xs cursor-pointer"
                >
                  Enregistrer la carte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
