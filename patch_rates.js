const fs = require('fs');
let code = fs.readFileSync('api/rates.ts', 'utf-8');

// Remove Garantex request
code = code.replace(/axios\.get\("https:\/\/garantex\.org\/api\/v2\/depth\?market=usdtrub".*?\}\),/s, '');
// Remove Garantex response processing
code = code.replace(/\/\/ 2\. Источник: Garantex API.*?\}\n  \}/s, '');
// Replace garantexRes with empty or remove from array
code = code.replace(/garantexRes, /, '');

fs.writeFileSync('api/rates.ts', code);
