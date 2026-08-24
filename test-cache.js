const { updateCache, getCachedRates } = require('./dist/server.cjs');
(async () => {
  console.log("Fetching...");
  await updateCache();
  const rates = await getCachedRates();
  console.log("Result:", rates);
})();
