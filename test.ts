import { fetchRatesData } from "./api/rates";
fetchRatesData().then(console.log).catch(console.error);
