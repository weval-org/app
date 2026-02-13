const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

if (process.argv.includes('--prod')) {
  const prodPath = path.resolve(process.cwd(), '.env.production');
  if (!fs.existsSync(prodPath)) {
    console.error('ERROR: --prod requires .env.production file but it was not found at', prodPath);
    process.exit(1);
  }
  dotenv.config({ path: prodPath });
} else {
  dotenv.config();
}
