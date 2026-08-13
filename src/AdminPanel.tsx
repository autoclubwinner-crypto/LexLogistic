import React, { useState } from 'react';

export interface AdminSettings {
  usdtTblPercent: number;
  usdtSwiftPercent: number;
  eurUsdCrossPercent: number;
  eurUsdCrossAdd: number;
  usdtBaseOverride: string;
  eurBaseOverride: string;
}

interface Props {
  settings: AdminSettings;
  onSave: (s: AdminSettings) => void;
  onClose: () => void;
}

export function AdminPanel({ settings, onSave, onClose }: Props) {
  // Store form inputs as raw strings so typing "1.", "1,4" or decimals is smooth
  const [form, setForm] = useState({
    usdtTblPercent: String(settings.usdtTblPercent ?? 1.3),
    usdtSwiftPercent: String(settings.usdtSwiftPercent ?? 1.0),
    eurUsdCrossPercent: String(settings.eurUsdCrossPercent ?? 0.3),
    eurUsdCrossAdd: String(settings.eurUsdCrossAdd ?? 0.002),
    usdtBaseOverride: settings.usdtBaseOverride || '',
    eurBaseOverride: settings.eurBaseOverride || ''
  });

  const handleChange = (field: keyof typeof form, val: string) => {
    // Replace comma with dot if typed with Russian layout
    const formatted = val.replace(',', '.');
    setForm(prev => ({ ...prev, [field]: formatted }));
  };

  const handleSave = () => {
    const parseNum = (v: string, fallback: number) => {
      const n = parseFloat(v);
      return isNaN(n) ? fallback : n;
    };

    const updatedSettings: AdminSettings = {
      usdtTblPercent: parseNum(form.usdtTblPercent, 1.3),
      usdtSwiftPercent: parseNum(form.usdtSwiftPercent, 1.0),
      eurUsdCrossPercent: parseNum(form.eurUsdCrossPercent, 0.3),
      eurUsdCrossAdd: parseNum(form.eurUsdCrossAdd, 0.002),
      usdtBaseOverride: form.usdtBaseOverride.trim(),
      eurBaseOverride: form.eurBaseOverride.trim()
    };

    onSave(updatedSettings);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Админ-панель ставок</h2>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-1 rounded-full font-medium">
            Смена наценок %
          </span>
        </div>
        
        <div className="space-y-4">
          {/* Раздел часто меняемых ставок */}
          <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Часто меняемые ставки</span>
            </div>

            {/* Тбилиси % */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                1. Наценка RUB/USD (Тбилиси), %
              </label>
              <div className="relative flex items-center">
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={form.usdtTblPercent} 
                  onChange={e => handleChange('usdtTblPercent', e.target.value)}
                  placeholder="1.3 или 1.4"
                  className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-8"
                />
                <span className="absolute right-3 text-sm text-slate-400 font-medium">%</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500">Обычно меняете на: 1.3, 1.4 или 1.5</p>
            </div>

            {/* SWIFT % */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                2. Наценка RUB/USD (SWIFT), %
              </label>
              <div className="relative flex items-center">
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={form.usdtSwiftPercent} 
                  onChange={e => handleChange('usdtSwiftPercent', e.target.value)}
                  placeholder="1.0 или 1.4"
                  className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-8"
                />
                <span className="absolute right-3 text-sm text-slate-400 font-medium">%</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500">Обычно меняете на: 1.0, 1.1 или 1.4</p>
            </div>

            {/* Ручная замена USDT/RUB */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-amber-600 dark:text-amber-400">
                3. Прямая замена базового курса USDT/RUB
              </label>
              <input 
                type="text" 
                inputMode="decimal"
                value={form.usdtBaseOverride} 
                onChange={e => handleChange('usdtBaseOverride', e.target.value)}
                placeholder="Оставь пустым для автопарсинга (например: 95.50)"
                className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-zinc-500">Задает точный базовый курс USDT, если нужно перебить парсинг</p>
            </div>
          </div>

          {/* Дополнительные параметры */}
          <div className="pt-2 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">
              Кросс-курсы EUR/USD
            </span>

            {/* Кросс-курс */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Наценка к кросс-курсу EUR/USD, %
              </label>
              <div className="relative flex items-center">
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={form.eurUsdCrossPercent} 
                  onChange={e => handleChange('eurUsdCrossPercent', e.target.value)}
                  placeholder="0.3"
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-8"
                />
                <span className="absolute right-3 text-sm text-slate-400 font-medium">%</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500">По умолчанию: 0.3% (+0.3% к XE.com)</p>
            </div>

            {/* Добавка к кросс-курсу */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Фиксированная добавка к кросс-курсу
              </label>
              <input 
                type="text" 
                inputMode="decimal"
                value={form.eurUsdCrossAdd} 
                onChange={e => handleChange('eurUsdCrossAdd', e.target.value)}
                placeholder="0.002"
                className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-zinc-500">По умолчанию: 0.002</p>
            </div>

            {/* Ручная замена EUR/USD */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-amber-600 dark:text-amber-400">
                Прямая замена EUR/USD
              </label>
              <input 
                type="text" 
                inputMode="decimal"
                value={form.eurBaseOverride} 
                onChange={e => handleChange('eurBaseOverride', e.target.value)}
                placeholder="Оставь пустым для автопарсинга (например: 1.0850)"
                className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 mt-8">
          <button 
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-medium py-2.5 rounded-xl hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors text-sm"
          >
            Отмена
          </button>
          <button 
            type="button"
            onClick={handleSave}
            className="flex-1 bg-emerald-500 text-white font-medium py-2.5 rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 text-sm"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
