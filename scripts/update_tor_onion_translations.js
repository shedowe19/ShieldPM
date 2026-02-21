import fs from 'fs';
import path from 'path';

const langDir = '/home/shedowe/ShieldPM-1/frontend/src/locale/lang';

function main() {
  const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(langDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Add or update the "tor-onion" key
      data['tor-onion'] = 'Tor-Onion';
      
      // Delete old keys if present just in case
      // None to delete here though
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, '\t') + '\n', 'utf8');
      console.log(`Updated ${file}`);
    } catch (e) {
      console.error(`Failed to handle ${file}:`, e);
    }
  }
}

main();
