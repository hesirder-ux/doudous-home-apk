import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FamilyMember, Language } from '../types';
import { getDetectedChildren } from './DailyHomeView';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Shirt,
  Sun,
  Wind,
  X,
} from 'lucide-react';

interface WeatherBannerProps {
  lang: Language;
  userCoords: { lat: number; lng: number } | null;
  cityName: string;
  onRequestGeolocate: () => void;
  members?: FamilyMember[];
}

interface HourlyForecastItem {
  timeLabel: string;
  temp: number;
  weatherCode: number;
  precipProb: number;
  precipMm: number;
  windSpeedKmh: number;
  windGustsKmh: number;
  windDirDeg: number;
}

interface DailyForecastItem {
  dateIso: string;
  dayLabel: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipProbMax: number;
  precipSumMm: number;
  windMaxKmh: number;
  gustsMaxKmh: number;
  windDirDeg: number;
}

interface WeatherSummary {
  currentTemp: number;
  currentCode: number;
  minTemp24h: number;
  maxTemp24h: number;
  maxRainProb24h: number;
  totalRainMm24h: number;
  currentWindKmh: number;
  currentGustsKmh: number;
  currentWindDirDeg: number;
  maxGusts24h: number;
  willRainNext24h: boolean;
  nextRainHourLabel: string | null;
  hourly24: HourlyForecastItem[];
  daily7: DailyForecastItem[];
}

export const WeatherBanner: React.FC<WeatherBannerProps> = ({
  userCoords,
  cityName,
  onRequestGeolocate,
  members = [],
}) => {
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'7days' | '24h' | 'outfit'>('7days');

  const detectedChildren = getDetectedChildren(members);
  const hasChildren = detectedChildren.length > 0;

  // Default fallback coordinates (Paris) if geolocation not granted yet
  const activeLat = userCoords?.lat ?? 48.8566;
  const activeLng = userCoords?.lng ?? 2.3522;

  useEffect(() => {
    let isMounted = true;
    const fetchWeather = async () => {
      setLoading(true);
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${activeLat}&longitude=${activeLng}&current=temperature_2m,weather_code,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant&timezone=auto&forecast_days=8`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Weather fetch failed');
        const data = await res.json();

        if (!isMounted || !data.hourly) return;

        const now = new Date();
        const times: string[] = data.hourly.time || [];
        let startIndex = times.findIndex(
          (t) => new Date(t).getTime() >= now.getTime() - 30 * 60 * 1000
        );
        if (startIndex === -1) startIndex = 0;

        const slice24 = times.slice(startIndex, startIndex + 24);
        const hourly24: HourlyForecastItem[] = slice24.map((timeStr, idx) => {
          const i = startIndex + idx;
          const dateObj = new Date(timeStr);
          const hour = dateObj.getHours();
          return {
            timeLabel: idx === 0 ? 'Maint.' : `${hour}h`,
            temp: Math.round(data.hourly.temperature_2m[i] ?? 15),
            weatherCode: data.hourly.weather_code[i] ?? 0,
            precipProb: Math.round(data.hourly.precipitation_probability?.[i] ?? 0),
            precipMm: Number((data.hourly.precipitation?.[i] ?? 0).toFixed(1)),
            windSpeedKmh: Math.round(data.hourly.wind_speed_10m?.[i] ?? 0),
            windGustsKmh: Math.round(data.hourly.wind_gusts_10m?.[i] ?? 0),
            windDirDeg: Math.round(data.hourly.wind_direction_10m?.[i] ?? 0),
          };
        });

        const dailyTimes: string[] = data.daily?.time || [];
        const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        const daily7: DailyForecastItem[] = dailyTimes.slice(0, 7).map((dateStr, idx) => {
          const d = new Date(`${dateStr}T12:00:00`);
          const dayName = idx === 0 ? 'Auj.' : idx === 1 ? 'Dem.' : dayNames[d.getDay()];
          const dayNum = d.getDate();
          return {
            dateIso: dateStr,
            dayLabel: `${dayName} ${dayNum}`,
            weatherCode: data.daily.weather_code?.[idx] ?? 0,
            tempMax: Math.round(data.daily.temperature_2m_max?.[idx] ?? 18),
            tempMin: Math.round(data.daily.temperature_2m_min?.[idx] ?? 10),
            precipProbMax: Math.round(data.daily.precipitation_probability_max?.[idx] ?? 0),
            precipSumMm: Number((data.daily.precipitation_sum?.[idx] ?? 0).toFixed(1)),
            windMaxKmh: Math.round(data.daily.wind_speed_10m_max?.[idx] ?? 0),
            gustsMaxKmh: Math.round(data.daily.wind_gusts_10m_max?.[idx] ?? 0),
            windDirDeg: Math.round(data.daily.wind_direction_10m_dominant?.[idx] ?? 0),
          };
        });

        const temps = hourly24.map((h) => h.temp);
        const minTemp24h = temps.length ? Math.min(...temps) : 10;
        const maxTemp24h = temps.length ? Math.max(...temps) : 20;
        const maxRainProb24h = hourly24.length
          ? Math.max(...hourly24.map((h) => h.precipProb))
          : 0;
        const totalRainMm24h = Number(
          hourly24.reduce((sum, h) => sum + h.precipMm, 0).toFixed(1)
        );
        const maxGusts24h = hourly24.length
          ? Math.max(...hourly24.map((h) => h.windGustsKmh))
          : 0;

        const firstRainHour = hourly24.find(
          (h) => h.precipProb >= 45 || h.precipMm >= 0.2 || isRainCode(h.weatherCode)
        );

        setWeather({
          currentTemp: Math.round(data.current?.temperature_2m ?? hourly24[0]?.temp ?? 15),
          currentCode: data.current?.weather_code ?? hourly24[0]?.weatherCode ?? 0,
          minTemp24h,
          maxTemp24h,
          maxRainProb24h,
          totalRainMm24h,
          currentWindKmh: Math.round(
            data.current?.wind_speed_10m ?? hourly24[0]?.windSpeedKmh ?? 0
          ),
          currentGustsKmh: Math.round(
            data.current?.wind_gusts_10m ?? hourly24[0]?.windGustsKmh ?? 0
          ),
          currentWindDirDeg: Math.round(
            data.current?.wind_direction_10m ?? hourly24[0]?.windDirDeg ?? 0
          ),
          maxGusts24h,
          willRainNext24h: Boolean(firstRainHour),
          nextRainHourLabel: firstRainHour ? firstRainHour.timeLabel : null,
          hourly24,
          daily7,
        });
      } catch (e) {
        console.warn('Open-Meteo error:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeLat, activeLng]);

  const isRainCode = (code: number) => {
    return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  };

  const getWeatherLabel = (code: number): string => {
    if (code === 0) return 'Ensoleillé';
    if (code === 1 || code === 2) return 'Éclaircies';
    if (code === 3) return 'Nuageux';
    if (code === 45 || code === 48) return 'Brouillard';
    if (code >= 51 && code <= 57) return 'Bruine';
    if (code >= 61 && code <= 67) return 'Pluie';
    if (code >= 71 && code <= 77) return 'Neige';
    if (code >= 80 && code <= 82) return 'Averses';
    if (code >= 95) return 'Orageux';
    return 'Variable';
  };

  const getWindDirectionCardinal = (deg: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const index = Math.round(((deg %= 360) < 0 ? deg + 360 : deg) / 45) % 8;
    return directions[index];
  };

  const renderWeatherIcon = (code: number, className = 'w-4 h-4') => {
    if (code === 0) return <Sun className={`${className} text-amber-400`} />;
    if (code === 1 || code === 2) return <CloudSun className={`${className} text-amber-400`} />;
    if (code === 3) return <Cloud className={`${className} text-slate-400`} />;
    if (code === 45 || code === 48) return <CloudFog className={`${className} text-slate-400`} />;
    if (code >= 51 && code <= 57) return <CloudDrizzle className={`${className} text-sky-400`} />;
    if (code >= 61 && code <= 67) return <CloudRain className={`${className} text-sky-500`} />;
    if (code >= 71 && code <= 77) return <CloudSnow className={`${className} text-indigo-400`} />;
    if (code >= 80 && code <= 82) return <CloudRain className={`${className} text-sky-400`} />;
    if (code >= 95) return <CloudLightning className={`${className} text-amber-400`} />;
    return <CloudSun className={`${className} text-amber-400`} />;
  };

  const getBabyOutfitRecommendation = (w: WeatherSummary) => {
    const temp = w.currentTemp;
    const windy = w.currentGustsKmh >= 35 || w.currentWindKmh >= 25;
    const rainy = w.willRainNext24h || w.maxRainProb24h >= 40;

    let shortSummary = '';
    let daytimeOutfit = '';
    if (temp < 5) {
      shortSummary = 'Combi pilote + bonnet chaud';
      daytimeOutfit =
        'Body manches longues + pull chaud + combinaison pilote / chancelière polaire + bonnet couvrant les oreilles + moufles.';
    } else if (temp < 12) {
      shortSummary = 'Body ML + pull + manteau chaud';
      daytimeOutfit =
        'Body manches longues + pantalon chaud + gilet/sweat + manteau chaud ou nid d’ange + bonnet léger.';
    } else if (temp < 18) {
      shortSummary = 'Body + gilet + coupe-vent';
      daytimeOutfit =
        'Body manches courtes ou longues + pantalon souple + gilet ou petite veste coupe-vent.';
    } else if (temp < 23) {
      shortSummary = 'T-shirt léger + pantalon fin';
      daytimeOutfit =
        'Body manches courtes + t-shirt léger + pantalon fin ou legging (prévoir un petit gilet pour l’ombre).';
    } else {
      shortSummary = 'Tenue légère coton + chapeau UV';
      daytimeOutfit =
        'Tenue très légère en coton (body manches courtes ou barboteuse) + chapeau de soleil anti-UV + lunettes.';
    }

    const strollerAlert = rainy
      ? '☔ Habillage pluie poussette indispensable aujourd’hui.'
      : windy
      ? '💨 Vent marqué : protégez bébé des courants d’air.'
      : '🌤️ Temps calme : sortie poussette ou parc idéale.';

    const estRoomTemp = Math.min(25, Math.max(17, Math.round(18 + (temp - 12) * 0.25)));
    let sleepTog = '';
    if (estRoomTemp < 18) {
      sleepTog = 'Gigoteuse TOG 2.5 ou 3.0 + Pyjama velours + Body manches longues';
    } else if (estRoomTemp <= 20) {
      sleepTog = 'Gigoteuse TOG 2.0 + Pyjama coton/velours + Body manches longues';
    } else if (estRoomTemp <= 22) {
      sleepTog = 'Gigoteuse légère TOG 1.0 + Pyjama coton léger ou Body manches courtes';
    } else {
      sleepTog = 'Gigoteuse d’été TOG 0.5 + Body manches courtes (ou couche seule si > 25°C)';
    }

    return {
      shortSummary,
      daytimeOutfit,
      strollerAlert,
      sleepTog,
      estRoomTemp,
    };
  };

  const sampleHourly = weather
    ? weather.hourly24.filter((_, i) => i % 2 === 0).slice(0, 12)
    : [];

  const outfitRec = weather ? getBabyOutfitRecommendation(weather) : null;

  // Render modal in document.body via React Portal so no parent header/backdrop-filter can EVER clip it!
  const weatherModalPortal =
    isModalOpen && weather && typeof document !== 'undefined'
      ? createPortal(
          <div
            onClick={() => setIsModalOpen(false)}
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-full sm:max-w-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88dvh] animate-slide-up"
            >
              {/* Mobile Bottom-Sheet Grab Handle */}
              <div
                onClick={() => setIsModalOpen(false)}
                className="w-full pt-2.5 pb-1 bg-slate-900 flex justify-center sm:hidden cursor-pointer"
              >
                <div className="w-12 h-1.5 rounded-full bg-slate-700" />
              </div>

              {/* Modal Header */}
              <div className="px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center shrink-0">
                    {renderWeatherIcon(weather.currentCode, 'w-6 h-6')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-extrabold truncate text-white">
                        {userCoords ? cityName : 'Paris'} · {weather.currentTemp}°C
                      </h3>
                      <span className="text-xs text-emerald-400 font-bold shrink-0">
                        {getWeatherLabel(weather.currentCode)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 truncate mt-0.5">
                      Min {weather.minTemp24h}° / Max {weather.maxTemp24h}° · Vent{' '}
                      {weather.currentWindKmh} km/h ({getWindDirectionCardinal(weather.currentWindDirDeg)})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onRequestGeolocate}
                    className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    title="Actualiser la position GPS"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>GPS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    aria-label="Fermer la météo"
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Fermer</span>
                  </button>
                </div>
              </div>

              {/* Quick Baby Outfit Highlight Strip right inside the Modal Top */}
              {hasChildren && outfitRec && (
                <div
                  onClick={() => setActiveTab('outfit')}
                  className="px-4 py-2.5 bg-emerald-950/90 text-emerald-100 border-b border-emerald-800/60 flex items-center justify-between gap-2 text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Shirt className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">
                      <strong className="text-white">Conseil tenue :</strong> {outfitRec.shortSummary}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-400 shrink-0">Détails →</span>
                </div>
              )}

              {/* Segmented Modal Tabs */}
              <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0">
                <div
                  className={`grid ${
                    hasChildren ? 'grid-cols-3' : 'grid-cols-2'
                  } gap-1.5 bg-slate-200/80 p-1 rounded-xl w-full`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTab('7days')}
                    className={`min-h-[38px] py-1.5 px-2 rounded-lg text-xs font-bold truncate cursor-pointer transition-colors ${
                      activeTab === '7days'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📅 7 jours
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('24h')}
                    className={`min-h-[38px] py-1.5 px-2 rounded-lg text-xs font-bold truncate cursor-pointer transition-colors ${
                      activeTab === '24h'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🕒 24 heures
                  </button>
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('outfit')}
                      className={`min-h-[38px] py-1.5 px-2 rounded-lg text-xs font-bold truncate cursor-pointer transition-colors ${
                        activeTab === 'outfit'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      👕 Tenue & Nuit
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Modal Body */}
              <div className="p-4 overflow-y-auto space-y-3 flex-1">
                {activeTab === '7days' && (
                  <div className="divide-y divide-slate-100">
                    {weather.daily7.map((d, idx) => (
                      <div
                        key={d.dateIso}
                        className={`py-3 px-3 rounded-xl flex items-center justify-between gap-2 ${
                          idx === 0 ? 'bg-emerald-50/70 font-semibold' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {renderWeatherIcon(d.weatherCode, 'w-5 h-5 shrink-0')}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{d.dayLabel}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {getWeatherLabel(d.weatherCode)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-xs shrink-0">
                          {d.precipProbMax > 0 ? (
                            <span className="text-sky-600 font-semibold flex items-center gap-0.5 text-[11px] tabular-nums">
                              <Droplets className="w-3 h-3" />
                              {d.precipProbMax}%
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Sec</span>
                          )}

                          <span className="text-slate-500 text-[11px] hidden sm:inline tabular-nums">
                            <Wind className="w-3 h-3 inline mr-0.5" />
                            {d.windMaxKmh} km/h
                          </span>

                          <div className="text-right min-w-[60px] tabular-nums">
                            <span className="font-extrabold text-slate-900">{d.tempMax}°</span>
                            <span className="text-slate-400 ml-1.5">{d.tempMin}°</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === '24h' && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {sampleHourly.map((h, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center text-center gap-1"
                      >
                        <span className="text-xs font-bold text-slate-600">{h.timeLabel}</span>
                        {renderWeatherIcon(h.weatherCode, 'w-5 h-5 my-0.5')}
                        <span className="text-sm font-extrabold text-slate-900 tabular-nums">
                          {h.temp}°C
                        </span>
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${
                            h.precipProb >= 40 ? 'text-sky-600' : 'text-slate-400'
                          }`}
                        >
                          💧 {h.precipProb}%
                        </span>
                        <span className="text-[10px] text-slate-500 tabular-nums">
                          💨 {h.windSpeedKmh} km/h
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'outfit' && hasChildren && outfitRec && (() => {
                  const hasYoungBaby = detectedChildren.some((c) => c.totalMonths < 36);
                  return (
                    <div className="space-y-3">
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                          <Shirt className="w-4 h-4 shrink-0" />
                          <span className="truncate">
                            Tenue de journée ({detectedChildren.map((c) => c.member.name).join(' & ')})
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          {outfitRec.daytimeOutfit}
                        </p>
                      </div>

                      {hasYoungBaby && (
                        <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-1.5">
                          <span className="text-xs font-bold text-indigo-900 block">
                            🌙 Nuit & Gigoteuse (~{outfitRec.estRoomTemp}°C chambre estimée)
                          </span>
                          <p className="text-xs text-indigo-950 leading-relaxed">
                            {outfitRec.sleepTog}
                          </p>
                        </div>
                      )}

                      <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                        <span className="text-xs font-bold text-amber-900 block">
                          🚼 Sortie Poussette & Extérieur
                        </span>
                        <p className="text-xs text-amber-950 leading-relaxed">
                          {outfitRec.strollerAlert}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Sticky Thumb-Zone Close CTA */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full min-h-[44px] py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Fermer la météo
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {/* High-Contrast, Always-Readable Top Weather & Outfit Bar */}
      <div className="bg-slate-900 text-white border-b border-slate-800 w-full">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 min-h-[40px] py-1 flex items-center justify-between gap-2 text-xs">
          {/* Left: GPS City + Live Temperature + Min/Max */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={onRequestGeolocate}
              className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold truncate cursor-pointer shrink-0 max-w-[125px] sm:max-w-[200px]"
              title="Actualiser votre position GPS"
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{userCoords ? cityName : 'Paris (GPS)'}</span>
            </button>

            <span className="text-slate-600 shrink-0">·</span>

            {loading && !weather ? (
              <span className="text-slate-300 text-xs truncate">Chargement météo...</span>
            ) : weather ? (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1.5 min-w-0 truncate text-left cursor-pointer group"
              >
                <span className="flex items-center gap-1 font-extrabold text-white shrink-0">
                  {renderWeatherIcon(weather.currentCode, 'w-4 h-4')}
                  <span className="tabular-nums">{weather.currentTemp}°C</span>
                </span>

                <span className="text-slate-300 font-medium truncate">
                  {getWeatherLabel(weather.currentCode)}
                </span>

                <span className="text-slate-400 text-[11px] shrink-0 tabular-nums hidden xs:inline">
                  ({weather.minTemp24h}°/{weather.maxTemp24h}°)
                </span>

                {hasChildren && outfitRec && (
                  <span className="hidden md:inline-flex items-center gap-1 text-emerald-300 text-[11px] font-medium truncate ml-1">
                    · 👕 {outfitRec.shortSummary}
                  </span>
                )}
              </button>
            ) : (
              <span className="text-slate-400 text-xs">Météo locale</span>
            )}
          </div>

          {/* Right: Clear 1-Tap Trigger Button */}
          {weather && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="min-h-[30px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-emerald-300 flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
            >
              {weather.willRainNext24h && <Droplets className="w-3 h-3 text-sky-400 shrink-0" />}
              <span>Météo 7j{hasChildren ? ' & Tenue' : ''}</span>
            </button>
          )}
        </div>
      </div>

      {weatherModalPortal}
    </>
  );
};
