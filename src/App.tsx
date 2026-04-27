/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Activity, RefreshCcw, TrendingUp, Newspaper, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

interface Rate {
  id: string;
  code: string;
  name: string;
  value: number;
  nominal: number;
}

interface RatesData {
  date: string;
  rates: Rate[];
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

export default function App() {
  const [ratesData, setRatesData] = useState<RatesData | null>(null);
  const [newsData, setNewsData] = useState<NewsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      // Используем бесплатный CORS-прокси для обхода защиты серверов (чтобы сайт мог работать как простой HTML без бекенда)
      
      // 1. Загрузка курсов валют через открытый API, который не блокирует CORS
      const ratesRes = await fetch("https://www.cbr-xml-daily.ru/daily_json.js").catch(() => null);
      if (ratesRes && ratesRes.ok) {
        const data = await ratesRes.json();
        
        const dateStr = new Date(data.Date).toLocaleDateString("ru-RU", {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
        
        const targetCodes = ["USD", "EUR", "GEL"];
        
        const rates = targetCodes.map(code => {
          const valute = data.Valute[code];
          if (!valute) return { code, value: 0, name: "Unknown", nominal: 1 };
          
          return {
            id: valute.ID,
            code: valute.CharCode,
            name: valute.Name,
            value: parseFloat(valute.Value),
            nominal: parseInt(valute.Nominal, 10)
          };
        });
        
        setRatesData({ date: dateStr, rates });
      }

      // 2. Загрузка новостей через rss2json для обхода CORS и трансформации в JSON
      const newsUrl = "https://www.vedomosti.ru/rss/news";
      const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(newsUrl)}`;
      
      const newsRes = await fetch(rss2jsonUrl).catch(() => null);
      if (newsRes && newsRes.ok) {
        const data = await newsRes.json();
        const items = data.items || [];
        
        const currencyAndBankKeywords = [
          'курс', 'валют', 'доллар', 'евро', 'рубл', 'юан', 
          'банк', 'цб', 'центробанк', 'ставк', 'кредит', 'вклад',
          'депозит', 'ипотек', 'свифт', 'swift', 'санкци'
        ];
        
        const parsedNewsList = items.map((item: any) => {
          // Очистка HTML тегов из описания, если они есть
          const cleanDescription = (item.description || "").replace(/<[^>]*>?/gm, '');
          
          return {
            id: item.guid || item.link || Math.random().toString(),
            title: item.title || "",
            link: item.link || "#",
            date: item.pubDate || "",
            contentSnippet: cleanDescription,
            category: (item.categories && item.categories.length > 0) ? item.categories[0] : "Новости"
          };
        });

        // Фильтруем новости по нашей теме
        let filteredNews = parsedNewsList.filter((item: any) => {
          const textToSearch = (item.title + " " + item.contentSnippet).toLowerCase();
          return currencyAndBankKeywords.some(keyword => textToSearch.includes(keyword));
        });

        // Берем все новости, если фильтрованных нет
        const finalNews = filteredNews.length > 0 ? filteredNews : parsedNewsList;

        setNewsData({ items: finalNews.slice(0, 10) });
      }
      
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

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

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-[#27272a] bg-[#09090b] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-3 sm:py-0 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-[14px] sm:text-[16px] font-semibold text-[#a1a1aa] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-[#fafafa]" />
              RUS-EXCHANGE
            </h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:block text-[12px] bg-[#1e1b4b] text-[#818cf8] px-3 py-1 rounded-full border border-[#312e81]">
              Step 4: News Feed
            </div>
            <button 
              onClick={fetchAllData}
              className={`group relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-full border-[3px] sm:border-[4px] border-zinc-800 bg-zinc-900 shadow-2xl flex items-center justify-center transition-all active:scale-95 touch-manipulation cursor-pointer ${isLoading ? 'opacity-80 cursor-wait' : ''}`}
              disabled={isLoading}
              title="Обновить"
            >
              {/* Inner red button */}
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
        <section className="bg-zinc-950/50 border border-zinc-800 rounded-[32px] p-5 sm:p-6 lg:p-8 backdrop-blur-sm">
          <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 sm:gap-4">
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-500 uppercase tracking-widest block mb-2 sm:mb-3">
                Live Rates
              </span>
              <div className="flex items-center gap-2 sm:gap-3">
                <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Курс валют ЦБ РФ</h2>
              </div>
            </div>
            {ratesData && (
              <div className="text-[11px] sm:text-[13px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full shadow-inner self-start sm:self-auto">
                Данные на: <span className="text-white font-medium ml-1">{ratesData.date}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {isLoading && !ratesData ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="h-36 sm:h-40 rounded-3xl bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 border border-white/5 shadow-2xl backdrop-blur-xl animate-pulse flex flex-col p-5 sm:p-6" />
              ))
            ) : (
              ratesData?.rates.map((rate, index) => {
                const gradients = [
                  "from-emerald-500/10 to-teal-900/20",
                  "from-blue-500/10 to-indigo-900/20",
                  "from-purple-500/10 to-fuchsia-900/20"
                ];
                const bgGradient = gradients[index % gradients.length];
                const colors = ["text-emerald-400", "text-blue-400", "text-purple-400"];
                const iconColor = colors[index % colors.length];

                return (
                  <div key={rate.code} className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${bgGradient} border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-md p-5 sm:p-6 flex flex-col justify-between min-h-[140px] sm:min-h-[160px] group transition-all hover:scale-[1.02] hover:border-white/20 touch-manipulation`}>
                    
                    {/* Background glow effect */}
                    <div className="absolute -inset-0.5 bg-gradient-to-br opacity-0 group-hover:opacity-20 transition duration-500 blur-xl pointer-events-none" style={{
                      backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))`
                    }}></div>

                    <div className="relative z-10 flex justify-between items-start mb-4">
                      <div className="flex flex-col gap-1">
                        <span className={`text-[12px] sm:text-[13px] font-bold tracking-wider uppercase ${iconColor}`}>
                          {rate.code} / RUB
                        </span>
                        <span className="text-[11px] text-zinc-400 font-medium line-clamp-1 max-w-[120px] sm:max-w-[140px]" title={rate.name}>
                          {rate.nominal > 1 ? `${rate.nominal} ` : ''}{rate.name}
                        </span>
                      </div>
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/40 border border-white/5 flex items-center justify-center shadow-inner flex-shrink-0 ${iconColor}`}>
                        <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                    </div>
                    <div className="relative z-10 flex items-baseline gap-1 mt-auto">
                      <span className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-md">
                        {rate.value.toFixed(2)}
                      </span>
                      <span className="text-base sm:text-lg text-zinc-400 font-bold ml-1">₽</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* News Section */}
        <section className="bg-zinc-950/50 border border-zinc-800 rounded-[32px] p-5 sm:p-6 lg:p-8 backdrop-blur-sm">
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
                <div key={i} className="h-32 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl animate-pulse" />
              ))
            ) : (
              newsData?.items.map((news) => (
                <a 
                  key={news.id} 
                  href={news.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group relative bg-[#0d0d0f] hover:bg-[#131316] border border-zinc-800 hover:border-zinc-700/80 rounded-2xl p-4 sm:p-5 transition-all outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 overflow-hidden flex flex-col justify-between min-h-[130px] sm:min-h-[140px] touch-manipulation"
                >
                  <div className="flex flex-col gap-2 sm:gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-800/50 px-2 py-0.5 sm:py-1 rounded">
                        {news.category}
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">
                        {formatDate(news.date)}
                      </span>
                    </div>
                    <h3 className="text-[14px] sm:text-[15px] font-medium text-zinc-100 leading-snug group-hover:text-emerald-400 transition-colors line-clamp-3">
                      {news.title}
                    </h3>
                  </div>
                  
                  {/* Hover icon */}
                  <div className="absolute right-4 sm:right-5 bottom-4 sm:bottom-5 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300 hidden sm:block">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-300" />
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-[#27272a] bg-[#09090b] mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-6 sm:py-8 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 text-[11px] sm:text-[12px] text-[#a1a1aa]">
          <p className="text-center md:text-left">© {new Date().getFullYear()} Rus-exchange. Официальные данные ЦБ и ВЕДОМОСТИ.</p>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
            Elegant Dark Theme
          </div>
        </div>
      </footer>
    </div>
  );
}
