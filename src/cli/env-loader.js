const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

const prodIndex = process.argv.indexOf('--prod');
if (prodIndex !== -1) {
  process.argv.splice(prodIndex, 1);
  const prodPath = path.resolve(process.cwd(), '.env.production');
  if (!fs.existsSync(prodPath)) {
    console.error('ERROR: --prod requires .env.production file but it was not found at', prodPath);
    process.exit(1);
  }
  dotenv.config({ path: prodPath });
} else {
  dotenv.config();
}
