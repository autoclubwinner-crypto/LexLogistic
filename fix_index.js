const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf-8');
code = code.replace("import crypto from 'crypto';\n", "");
code = "import crypto from 'crypto';\n" + code;
fs.writeFileSync('api/index.ts', code);
