const fs = require('fs');
let code = fs.readFileSync('api/rates.ts', 'utf-8');

// Change initial memoryCache
code = code.replace(/let memoryCache = \{\s*usdtRubRaw: 95\.50,\s*xeEur: 0\.92,\s*success: true\s*\};/, `let memoryCache = {
  usdtRubRaw: 0,
  xeEur: 0,
  success: false
};`);

// Add settings import
code = code.replace(/export async function getCachedRates\(\) \{/, `import { getSettings } from "./settings";\n\nexport async function getCachedRates() {`);

// Modify getCachedRates to await updateCache if empty
code = code.replace(/if \(fs\.existsSync\(CACHE_FILE\)\) \{/, `if (fs.existsSync(CACHE_FILE)) {`);
code = code.replace(/return memoryCache;\n\}/, `  if (!memoryCache.success || memoryCache.usdtRubRaw === 0) {
    console.log("[RATES] Cache empty, fetching synchronously...");
    await updateCache();
  }
  
  return memoryCache;
}`);

// Modify handler to include settings
code = code.replace(/const data = await getCachedRates\(\);\n    return res\.status\(200\)\.json\(data\);/, `const data = await getCachedRates();
    const settings = await getSettings();
    return res.status(200).json({ ...data, settings });`);

fs.writeFileSync('api/rates.ts', code);
