const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

const replacements = [
  ['bg-[#09090b]', 'bg-slate-50 dark:bg-zinc-950'],
  ['text-[#fafafa]', 'text-slate-900 dark:text-[#fafafa]'],
  ['border-[#27272a]', 'border-slate-200 dark:border-[#27272a]'],
  ['text-[#a1a1aa]', 'text-slate-500 dark:text-[#a1a1aa]'],
  ['bg-zinc-900', 'bg-slate-100 dark:bg-zinc-900'],
  ['bg-zinc-950/50', 'bg-white/80 dark:bg-zinc-950/50'],
  ['bg-zinc-900/50', 'bg-slate-100/80 dark:bg-zinc-900/50'],
  ['bg-zinc-800/50', 'bg-white/60 dark:bg-zinc-800/50'],
  ['bg-zinc-800', 'bg-slate-200 dark:bg-zinc-800'],
  ['bg-[#0d0d0f]', 'bg-white dark:bg-[#0d0d0f]'],
  ['hover:bg-[#131316]', 'hover:bg-slate-50 dark:hover:bg-[#131316]'],
  ['border-zinc-800/80', 'border-slate-200 dark:border-zinc-800/80'],
  ['border-zinc-800/50', 'border-slate-200 dark:border-zinc-800/50'],
  ['border-zinc-800', 'border-slate-200 dark:border-zinc-800'],
  ['border-zinc-700/80', 'border-slate-300 dark:border-zinc-700/80'],
  ['border-white/10', 'border-black/5 dark:border-white/10'],
  ['border-white/5', 'border-black/5 dark:border-white/5'],
  ['text-zinc-500', 'text-slate-500 dark:text-zinc-500'],
  ['text-zinc-600', 'text-slate-400 dark:text-zinc-600'],
  ['text-zinc-400', 'text-slate-600 dark:text-zinc-400'],
  ['text-zinc-300', 'text-slate-700 dark:text-zinc-300'],
  ['text-zinc-100', 'text-slate-800 dark:text-zinc-100'],
  ['text-white', 'text-slate-900 dark:text-white'],
  ['bg-black/40', 'bg-white/80 dark:bg-black/40'],
  ['from-zinc-900/80 to-zinc-950/80', 'from-slate-100 to-slate-200/50 dark:from-zinc-900/80 dark:to-zinc-950/80'],
  ['from-zinc-800/80 to-zinc-900/80', 'from-white to-slate-100 dark:from-zinc-800/80 dark:to-zinc-900/80'],
  ['shadow-[0_8px_30px_rgb(0,0,0,0.4)]', 'shadow-xl dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)]']
];

for (const [find, replace] of replacements) {
    code = code.split(find).join(replace);
}

// Revert text-slate-900 for the red update button and rate icons where we want text-white
code = code.replace(/<span className="text-\[7px\] sm:text-\[8px\] font-black text-slate-900 dark:text-white uppercase tracking-wider leading-none select-none">Обновить<\/span>/g, '<span className="text-[7px] sm:text-[8px] font-black text-white uppercase tracking-wider leading-none select-none">Обновить</span>');
code = code.replace(/text-slate-900 dark:text-white \${isLoading \? 'animate-spin'/g, "text-white ${isLoading ? 'animate-spin'");
code = code.replace(/text-slate-900 dark:text-white drop-shadow-md/g, "text-slate-900 dark:text-white");
// ensure specific instances look right
code = code.replace(/text-slate-900 dark:text-white ml-1/g, 'text-slate-900 dark:text-white ml-1');

fs.writeFileSync('src/App.tsx', code);
console.log('Done');
