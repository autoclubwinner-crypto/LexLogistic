const fs = require('fs');
const js = fs.readFileSync('rus.js', 'utf8');

// I want to see what fetch calls it has.
console.log(js.match(/fetch\([^)]+\)/g));
