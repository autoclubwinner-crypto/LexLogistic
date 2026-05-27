/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Activity, RefreshCcw, TrendingUp, Newspaper, ExternalLink, Calculator as CalcIcon, Sun, Moon, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

interface Rate {
  id: string;
  code: string;
  labelOverride?: string;
  name: string;
  value: number;
  nominal: number;
  suffix?: string;
}

interface RatesData {
  date: string;
  rates: Rate[];
  lastChecked?: string;
}

interface NewsItem {
  id: string;
  title: string;
  link: string;
  date: string;
  contentSnippet: string;
  category: string;
}

interface NewsData {
  items: NewsItem[];
}

type ThemeMode = 'light' | 'dark' | 'auto';

export default function App() {
  const [ratesData, setRatesData] = useState<RatesData | null>(null);
  const [newsData, setNewsData] = useState<NewsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('app-theme') as ThemeMode) || 'auto';
    }
    return 'auto';
  });

  // Theme tracking

  // Calculator state
  const [calcAmount, setCalcAmount] = useState<string>("1000");
  const [calcCurrency, setCalcCurrency] = useState<"RUB/USD SWIFT" | "RUB/EURO SWIFT">("RUB/USD SWIFT");

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const timestamp = new Date().getTime();
      
      // 1. Загрузка курсов с криптобиржи Rapira
      const mapiraUrl = `https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB`;
      const ratesRes = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(mapiraUrl)}&_nocache=${timestamp}`).catch(() => null);
      
      // 2. Fetch XE for Cross Rate USD/EUR
      const xeUrl = `https://www.xe.com/currencyconverter/convert/?Amount=1&From=USD&To=EUR`;
      const xeRes = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(xeUrl)}&_nocache=${timestamp}`).catch(() => null);

      let usdtRubRaw = 0;
      let xeEur = 0;

      if (ratesRes && ratesRes.ok) {
        const rapiraPlate = await ratesRes.json();
        if(rapiraPlate?.ask?.items && Array.isArray(rapiraPlate.ask.items)) {
          const items = rapiraPlate.ask.items;
          // Пользователь указал, что верхняя строка биржевого стакана соответствует 12-й позиции (индекс 11) в ответе API,
          // так как биржа визуализирует 12 строк для заявок на продажу, где индекс 0 - это лучшая цена (нижняя строка), а индекс 11 - верхняя.
          if (items.length > 11) {
            usdtRubRaw = parseFloat(items[11].price);
          } else if (items.length > 0) {
            usdtRubRaw = parseFloat(items[items.length - 1].price);
          }
        }
      }

      if (xeRes && xeRes.ok) {
        const text = await xeRes.text();
        const match = text.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            xeEur = data.props.pageProps.initialRatesData.rates.EUR;
          } catch (e) {
            console.error("Failed to parse XE data", e);
          }
        }
      }

      // Calculations according to business rules:
      const rubUsdt = usdtRubRaw;
      const rubUsdTbilisi = usdtRubRaw * 1.01;
      const rubUsdSwift = usdtRubRaw * 1.01;
      
      // Cross rate XE EUR to USD
      // XE gives 1 USD = xeEur EUR (e.g. 0.92)
      // Standard cross rate EUR/USD is 1 / xeEur (e.g. 1.08)
      const eurUsdBase = xeEur ? (1 / xeEur) : 1.08;
      
      // "Кросс курс USD/EUR с сайта xe.com парсить со значением на 0.3 процента больше"
      // "а также автоматически добавлять к нему + 0,002"
      const crossUsdEur = (eurUsdBase * 1.003) + 0.002;
      
      // RUB/EURO SWIFT = RUB/USD SWIFT * CROSS EUR/USD
      const rubEuroSwift = rubUsdSwift * crossUsdEur;

      const dateStr = new Date().toLocaleDateString("ru-RU", {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
      
      const rates: Rate[] = [
        {
          id: "USDT",
          code: "USDT",
          labelOverride: "RUB/USDT",
          name: "USDT (Tether)",
          value: rubUsdt,
          nominal: 1
        },
        {
          id: "USD_TBILISI",
          code: "USD",
          labelOverride: "RUB/USD Тбилиси",
          name: "USD (Тбилиси)",
          value: rubUsdTbilisi,
          nominal: 1
        },
        {
          id: "USD_SWIFT",
          code: "USD",
          labelOverride: "RUB/USD SWIFT",
          name: "USD (SWIFT)",
          value: rubUsdSwift,
          nominal: 1
        },
        {
          id: "EUR_SWIFT",
          code: "EUR",
          labelOverride: "RUB/EURO SWIFT",
          name: "EUR (SWIFT)",
          value: rubEuroSwift,
          nominal: 1
        },
        {
          id: "CROSS",
          code: "CROSS",
          labelOverride: "Кросс курс USD/EUR",
          name: "Евро за Доллар (Cross)",
          value: crossUsdEur,
          nominal: 1,
          suffix: "$"
        }
      ];
      
      setRatesData({ 
        date: dateStr, 
        rates,
        lastChecked: new Date().toLocaleTimeString('ru-RU')
      });

      // 3. Загрузка новостей (RSS)
      const rssSources = [
        "https://rssexport.rbc.ru/rbcnews/news/30/full.rss",
        "https://www.kommersant.ru/RSS/news.xml",
        "https://lenta.ru/rss/news/economics"
      ];

      const allNews: NewsItem[] = [];

      await Promise.allSettled(rssSources.map(async (source) => {
        try {
          const url = `https://api.codetabs.com/v1/proxy?quest=${source}&_nocache=${timestamp}`;
          const res = await fetch(url);
          if (!res.ok) return;
          
          const text = await res.text();
          if (text.includes("429 Too Many") || text.includes("<html")) return;

          const xmlDoc = new DOMParser().parseFromString(text, "text/xml");
          const items = Array.from(xmlDoc.querySelectorAll("item"));
          
          items.forEach(item => {
            const title = item.querySelector("title")?.textContent || "";
            const description = item.querySelector("description")?.textContent || "";
            const cleanDescription = description.replace(/<[^>]*>?/gm, '');
            const pubDateStr = item.querySelector("pubDate")?.textContent || "";
            const link = item.querySelector("link")?.textContent || "#";
            
            let category = "Новости";
            if (source.includes("rbc.ru")) category = "РБК";
            else if (source.includes("kommersant.ru")) category = "Коммерсантъ";
            else if (source.includes("lenta.ru")) category = "Lenta.ru";

            allNews.push({
              id: item.querySelector("guid")?.textContent || link || Math.random().toString(),
              title,
              link,
              date: pubDateStr,
              contentSnippet: cleanDescription,
              category
            });
          });
        } catch (e) {
          console.error("Error fetching", source, e);
        }
      }));

      // Сортировка по дате
      allNews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Фильтруем новости
      const currencyAndBankKeywords = [
        'курс', 'валют', 'доллар', 'евро', 'рубл', 'юан', 
        'банк', 'цб', 'центробанк', 'ставк', 'кредит', 'вклад',
        'депозит', 'ипотек', 'свифт', 'swift', 'санкци', 'экономи', 'бизнес', 'финанс',
        'акци', 'бирж', 'инфляц', 'ввп', 'минфин', 'налог'
      ];

      const filteredNews = allNews.filter((item) => {
        const textToSearch = (item.title + " " + item.contentSnippet).toLowerCase();
        return item.category === "Lenta.ru" || currencyAndBankKeywords.some(keyword => textToSearch.includes(keyword)); 
      });

      const finalNews = filteredNews.length >= 6 ? filteredNews : allNews;

      setNewsData({ items: finalNews.slice(0, 10).map(n => ({...n, id: n.id || Math.random().toString()})) });
      
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      fetchAllData();
    }, 60000); // 1 minute interval
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('app-theme', themeMode);
    
    // Fetch sun data if 'auto' and not cached
    if (themeMode === 'auto') {
      // Испольуем простое локальное время устройства, это самый надежный и быстрый метод
      // без ложных срабатываний из-за VPN или блокировщиков рекламы.
      const hour = new Date().getHours();
      const shouldBeDark = hour < 6 || hour >= 20;
      
      if (shouldBeDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  }, [themeMode]);

  useEffect(() => {
    const applyTheme = () => {
      let shouldBeDark = false;
      if (themeMode === 'light') {
        shouldBeDark = false;
      } else if (themeMode === 'dark') {
        shouldBeDark = true;
      } else {
        // Auto: простое локальное время
        const hour = new Date().getHours();
        shouldBeDark = hour < 6 || hour >= 20;
      }
      
      if (shouldBeDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    };
    
    applyTheme();
    const interval = setInterval(applyTheme, 60000);
    return () => clearInterval(interval);
  }, [themeMode]);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return new Intl.DateTimeFormat('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit',
      day: 'numeric',
      month: 'short'
    }).format(d);
  };

  const getCalculationResult = () => {
    if (!ratesData) return 0;
    
    // Find rates
    const usdSwiftRate = ratesData.rates.find(r => r.id === "USD_SWIFT")?.value || 0;
    const euroSwiftRate = ratesData.rates.find(r => r.id === "EUR_SWIFT")?.value || 0;
    
    const amountNum = parseFloat(calcAmount) || 0;
    const activeRate = calcCurrency === "RUB/USD SWIFT" ? usdSwiftRate : euroSwiftRate;
    
    // Formula: (Amount * Course) + (100 * active_Course)
    const result = (amountNum * activeRate) + (100 * activeRate);
    
    return result;
  };

  return (
    <div className="min-h-screen bg-[#f7f8f9] dark:bg-zinc-950 text-slate-900 dark:text-[#fafafa] flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-[#27272a] bg-[#f7f8f9] dark:bg-zinc-950 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-3 sm:py-0 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-[14px] sm:text-[16px] font-semibold text-slate-500 dark:text-[#a1a1aa] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-slate-900 dark:text-[#fafafa]" />
              RUS-EXCHANGE
            </h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              onClick={fetchAllData}
              className={`group relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-full border-[3px] sm:border-[4px] border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl flex items-center justify-center transition-all active:scale-95 touch-manipulation cursor-pointer ${isLoading ? 'opacity-80 cursor-wait' : ''}`}
              disabled={isLoading}
              title="Обновить"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-600 border border-red-500 shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),0_4px_10px_rgba(220,38,38,0.6)] group-hover:bg-red-500 transition-colors flex flex-col items-center justify-center gap-0.5 sm:gap-1">
                <RefreshCcw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-white ${isLoading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                <span className="text-[7px] sm:text-[8px] font-black text-white uppercase tracking-wider leading-none select-none">Обновить</span>
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-5 py-6 sm:py-8 space-y-6 sm:space-y-8">
        
        {/* Rates Section */}
        <section className="bg-white/80 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-[32px] p-5 sm:p-6 lg:p-8 backdrop-blur-sm">
          <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 sm:gap-4">
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-500 uppercase tracking-widest block mb-2 sm:mb-3">
                Live Market Rates
              </span>
              <div className="flex items-center gap-2 sm:gap-3">
                <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-slate-900 dark:text-white" />
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Актуальный курс на сегодня</h2>
              </div>
            </div>
            {ratesData && (
              <div className="flex flex-col items-end gap-1">
                <div className="text-[11px] sm:text-[13px] text-slate-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full shadow-inner self-start sm:self-auto">
                  Данные на: <span className="text-slate-900 dark:text-white font-medium ml-1">{ratesData.date}</span>
                </div>
                {ratesData.lastChecked && (
                   <div className="text-[10px] text-slate-500 dark:text-zinc-500 mr-2">Проверено: {ratesData.lastChecked}</div>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {isLoading && !ratesData ? (
              [1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-36 sm:h-40 rounded-3xl bg-gradient-to-br from-white to-slate-100 dark:from-zinc-800/80 dark:to-zinc-900/80 border border-black/5 dark:border-white/5 shadow-2xl backdrop-blur-xl animate-pulse flex flex-col p-5 sm:p-6" />
              ))
            ) : (
              ratesData?.rates.map((rate, index) => {
                const gradients = [
                  "from-emerald-500/10 to-teal-900/20",
                  "from-blue-500/10 to-indigo-900/20",
                  "from-purple-500/10 to-fuchsia-900/20",
                  "from-amber-500/10 to-orange-900/20",
                  "from-pink-500/10 to-rose-900/20"
                ];
                const bgGradient = gradients[index % gradients.length];
                const colors = ["text-emerald-400", "text-blue-400", "text-purple-400", "text-amber-400", "text-pink-400"];
                const iconColor = colors[index % colors.length];

                return (
                  <div key={rate.id} className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${bgGradient} border border-black/5 dark:border-white/10 shadow-xl dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-md p-5 sm:p-6 flex flex-col justify-between min-h-[140px] sm:min-h-[160px] group transition-all hover:scale-[1.02] hover:border-white/20 touch-manipulation`}>
                    
                    {/* Background glow effect */}
                    <div className="absolute -inset-0.5 bg-gradient-to-br opacity-0 group-hover:opacity-20 transition duration-500 blur-xl pointer-events-none" style={{
                      backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))`
                    }}></div>

                    <div className="relative z-10 flex justify-between items-start mb-4">
                      <div className="flex flex-col gap-1">
                        <span className={`text-[12px] sm:text-[13px] font-bold tracking-wider uppercase ${iconColor}`}>
                          {rate.labelOverride || `${rate.code} / RUB`}
                        </span>
                        <span className="text-[11px] text-slate-600 dark:text-zinc-400 font-medium line-clamp-1 max-w-[120px] sm:max-w-[140px]" title={rate.name}>
                          {rate.name}
                        </span>
                      </div>
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/80 dark:bg-black/40 border border-black/5 dark:border-white/5 flex items-center justify-center shadow-inner flex-shrink-0 ${iconColor}`}>
                        <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                    </div>
                    <div className="relative z-10 flex items-baseline gap-1 mt-auto">
                      <span className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
                        {new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(rate.value)}
                      </span>
                      <span className="text-base sm:text-lg text-slate-600 dark:text-zinc-400 font-bold ml-1">{rate.suffix || '₽'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Calculator Section */}
        <section className="bg-gradient-to-b from-slate-100 to-slate-200/50 dark:from-zinc-900/80 dark:to-zinc-950/80 border border-slate-200 dark:border-zinc-800 rounded-[32px] p-5 sm:p-6 lg:p-8 backdrop-blur-sm relative overflow-hidden">
          {/* subtle glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
          
          <div className="mb-6">
            <span className="text-[10px] sm:text-[11px] font-bold text-indigo-400 uppercase tracking-widest block mb-2 sm:mb-3">
              Transfer Calculator
            </span>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <CalcIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Калькулятор расчета сумм</h2>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500 max-w-sm">
              Расчет переводных сумм с учетом комиссии SWIFT (фиксированно эквивалент 100 единиц валюты).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            
            {/* Input area */}
            <div className="md:col-span-5 flex flex-col gap-4 relative z-10">
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-slate-600 dark:text-zinc-400">Направление перевода</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl">
                  {["RUB/USD SWIFT", "RUB/EURO SWIFT"].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setCalcCurrency(opt as any)}
                      className={`text-[12px] sm:text-[13px] font-medium px-3 py-2 rounded-lg transition-all ${
                        calcCurrency === opt 
                          ? 'bg-slate-200 dark:bg-zinc-800 text-slate-900 dark:text-white shadow-md' 
                          : 'text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:text-zinc-300 hover:bg-white/60 dark:bg-zinc-800/50'
                      }`}
                    >
                      {opt.replace('RUB/', '').replace(' SWIFT', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-slate-600 dark:text-zinc-400">Сумма к отправке</label>
                <div className="relative">
                  <input 
                    type="number"
                    value={calcAmount}
                    onChange={(e) => setCalcAmount(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 sm:py-4 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all font-mono"
                    placeholder="1000"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-wider">
                    {calcCurrency === "RUB/USD SWIFT" ? "USD" : "EUR"}
                  </div>
                </div>
              </div>
            </div>

            {/* Results Area */}
            <div className="md:col-span-7 md:pl-6 md:border-l border-slate-200 dark:border-zinc-800/50 flex flex-col justify-center min-h-[160px]">
              <div className="space-y-4">
                
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] text-slate-600 dark:text-zinc-400 font-medium">Итого к оплате (с комиссией):</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
                      {new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(getCalculationResult())}
                    </span>
                    <span className="text-xl sm:text-2xl font-bold text-slate-500 dark:text-zinc-500">₽</span>
                  </div>
                </div>

                {ratesData && (
                  <div className="flex items-center gap-4 text-[11px] sm:text-[12px] text-slate-500 dark:text-zinc-500 bg-white dark:bg-zinc-900/50 inline-flex px-4 py-2 rounded-lg border border-slate-200 dark:border-zinc-800/50">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400 dark:text-zinc-600">Курс валюты</span>
                      <span className="font-medium text-slate-600 dark:text-zinc-400">
                        {ratesData.rates.find(r => r.id === (calcCurrency === "RUB/USD SWIFT" ? "USD_SWIFT" : "EUR_SWIFT"))?.value.toFixed(2)} ₽
                      </span>
                    </div>
                    <div className="w-px h-6 bg-slate-200 dark:bg-zinc-800"></div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-400 dark:text-zinc-600">Комиссия (эквивалент 100 {calcCurrency === "RUB/USD SWIFT" ? "USD" : "EUR"})</span>
                      <span className="font-medium text-slate-600 dark:text-zinc-400">
                        {((calcCurrency === "RUB/USD SWIFT" ? ratesData.rates.find(r => r.id === "USD_SWIFT")?.value || 0 : ratesData.rates.find(r => r.id === "EUR_SWIFT")?.value || 0) * 100).toFixed(2)} ₽
                      </span>
                    </div>
                  </div>
                )}
                
              </div>
            </div>

          </div>
        </section>

        {/* News Section */}
        <section className="bg-white/80 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-[32px] p-5 sm:p-6 lg:p-8 backdrop-blur-sm">
          <div className="mb-6 sm:mb-8">
            <span className="text-[10px] sm:text-[11px] font-bold text-blue-500 uppercase tracking-widest block mb-2 sm:mb-3">
              Market Feed
            </span>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Newspaper className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Финансовые новости</h2>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {isLoading && !newsData ? (
              [1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-32 bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl animate-pulse" />
              ))
            ) : (
              newsData?.items.map((news) => (
                <a 
                  key={news.id} 
                  href={news.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group relative bg-white dark:bg-[#0d0d0f] hover:bg-[#f7f8f9] dark:hover:bg-[#131316] border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:border-zinc-700/80 rounded-2xl p-4 sm:p-5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 overflow-hidden flex flex-col justify-between min-h-[130px] sm:min-h-[140px] touch-manipulation"
                >
                  <div className="flex flex-col gap-2 sm:gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 bg-white/60 dark:bg-zinc-800/50 px-2 py-0.5 sm:py-1 rounded">
                        {news.category}
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-500 font-medium">
                        {formatDate(news.date)}
                      </span>
                    </div>
                    <h3 className="text-[14px] sm:text-[15px] font-medium text-slate-800 dark:text-zinc-100 leading-snug group-hover:text-emerald-400 transition-colors line-clamp-3">
                      {news.title}
                    </h3>
                  </div>
                  
                  {/* Hover icon */}
                  <div className="absolute right-4 sm:right-5 bottom-4 sm:bottom-5 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300 hidden sm:block">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center">
                      <ExternalLink className="w-3.5 h-3.5 text-slate-700 dark:text-zinc-300" />
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-[#27272a] bg-[#f7f8f9] dark:bg-zinc-950 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-6 sm:py-8 flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-4 text-[11px] sm:text-[12px] text-slate-500 dark:text-[#a1a1aa]">
          <p className="text-center md:text-left">© {new Date().getFullYear()} Rus-exchange. Live market data aggregator.</p>
          
          {/* Theme Toggle */}
          <div className="flex bg-slate-200/50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 p-1 rounded-full items-center">
            <button 
              onClick={() => setThemeMode('light')} 
              className={`p-2 rounded-full transition-all ${themeMode === 'light' ? 'bg-white dark:bg-zinc-800 shadow-sm text-emerald-500' : 'text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-300'}`} 
              title="Светлая тема"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => setThemeMode('auto')} 
              className={`p-2 rounded-full transition-all ${themeMode === 'auto' ? 'bg-white dark:bg-zinc-800 shadow-sm text-emerald-500' : 'text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-300'}`} 
              title="Авто (по рассвету/закату)"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => setThemeMode('dark')} 
              className={`p-2 rounded-full transition-all ${themeMode === 'dark' ? 'bg-white dark:bg-zinc-800 shadow-sm text-emerald-500' : 'text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-300'}`} 
              title="Темная тема"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
            Elegant Auto Theme
          </div>
        </div>
      </footer>
    </div>
  );
}

