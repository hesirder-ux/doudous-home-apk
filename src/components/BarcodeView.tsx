import React from 'react';
import { LoyaltyCard } from '../types';

interface BarcodeViewProps {
  card: LoyaltyCard;
  onClose?: () => void;
}

export const BarcodeView: React.FC<BarcodeViewProps> = ({ card, onClose }) => {
  // Deterministic barcode pattern generation from card number
  const generateBarcodeBars = (code: string) => {
    const clean = code.replace(/\s+/g, '');
    const bars: { width: number; isBlack: boolean }[] = [];
    
    // Guard pattern start
    bars.push({ width: 2, isBlack: true });
    bars.push({ width: 2, isBlack: false });
    bars.push({ width: 2, isBlack: true });

    for (let i = 0; i < clean.length; i++) {
      const charCode = clean.charCodeAt(i);
      const digit = (charCode % 7) + 1;
      
      bars.push({ width: (digit % 3) + 1, isBlack: true });
      bars.push({ width: ((digit + 1) % 3) + 1, isBlack: false });
      bars.push({ width: ((digit + 2) % 3) + 1, isBlack: true });
      bars.push({ width: 2, isBlack: false });
    }

    // Guard pattern end
    bars.push({ width: 2, isBlack: true });
    bars.push({ width: 2, isBlack: false });
    bars.push({ width: 2, isBlack: true });

    return bars;
  };

  const bars = generateBarcodeBars(card.cardNumber);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-xl border border-slate-200 text-center max-w-sm mx-auto">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div className="text-left">
          <p className="text-xs uppercase tracking-wider font-semibold text-slate-500">
            Carte de Fidélité
          </p>
          <h3 className="text-lg font-bold text-slate-900">{card.storeName}</h3>
        </div>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
          style={{ backgroundColor: card.color }}
        >
          {card.storeName.substring(0, 2).toUpperCase()}
        </div>
      </div>

      {/* Scannable Barcode Container */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 mb-4">
        {card.barcodeType === 'QR' ? (
          <div className="flex flex-col items-center justify-center py-2">
            {/* SVG QR Code Simulation */}
            <svg className="w-40 h-40" viewBox="0 0 100 100">
              <rect width="100" height="100" fill="#ffffff" rx="4" />
              {/* Corner position markers */}
              <rect x="8" y="8" width="24" height="24" fill="#0f172a" rx="2" />
              <rect x="12" y="12" width="16" height="16" fill="#ffffff" />
              <rect x="16" y="16" width="8" height="8" fill="#0f172a" />

              <rect x="68" y="8" width="24" height="24" fill="#0f172a" rx="2" />
              <rect x="72" y="12" width="16" height="16" fill="#ffffff" />
              <rect x="76" y="16" width="8" height="8" fill="#0f172a" />

              <rect x="8" y="68" width="24" height="24" fill="#0f172a" rx="2" />
              <rect x="12" y="72" width="16" height="16" fill="#ffffff" />
              <rect x="16" y="76" width="8" height="8" fill="#0f172a" />

              {/* Data blocks */}
              <rect x="36" y="12" width="6" height="6" fill="#0f172a" />
              <rect x="46" y="18" width="6" height="6" fill="#0f172a" />
              <rect x="56" y="12" width="6" height="6" fill="#0f172a" />
              <rect x="16" y="40" width="6" height="6" fill="#0f172a" />
              <rect x="28" y="44" width="6" height="6" fill="#0f172a" />
              <rect x="40" y="38" width="8" height="8" fill="#0f172a" />
              <rect x="52" y="46" width="6" height="6" fill="#0f172a" />
              <rect x="64" y="38" width="8" height="8" fill="#0f172a" />
              <rect x="76" y="44" width="6" height="6" fill="#0f172a" />
              <rect x="38" y="58" width="8" height="8" fill="#0f172a" />
              <rect x="50" y="62" width="8" height="8" fill="#0f172a" />
              <rect x="62" y="58" width="8" height="8" fill="#0f172a" />
              <rect x="78" y="70" width="6" height="6" fill="#0f172a" />
              <rect x="44" y="76" width="6" height="6" fill="#0f172a" />
              <rect x="68" y="80" width="8" height="8" fill="#0f172a" />
            </svg>
            <span className="text-[11px] text-slate-500 font-mono mt-2 tracking-wider">
              Format QR Code Lidl Plus
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {/* 1D Barcode SVG */}
            <div className="w-full flex justify-center items-center h-24 overflow-hidden bg-white p-2 rounded border border-slate-100">
              <div className="flex items-stretch h-full w-full justify-center max-w-[260px]">
                {bars.map((bar, idx) => (
                  <div
                    key={idx}
                    style={{
                      width: `${bar.width * 2}px`,
                      backgroundColor: bar.isBlack ? '#0f172a' : 'transparent',
                    }}
                    className="h-full shrink-0"
                  />
                ))}
              </div>
            </div>
            <p className="font-mono text-sm tracking-widest font-semibold text-slate-800 mt-2">
              {card.cardNumber}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 mb-4 px-1">
        <span>Luminosité max recommandée en caisse</span>
        <span className="font-semibold text-emerald-600">
          Cagnotte: {card.cashbackBalance.toFixed(2)} €
        </span>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="w-full py-2.5 px-4 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors"
        >
          Fermer
        </button>
      )}
    </div>
  );
};
