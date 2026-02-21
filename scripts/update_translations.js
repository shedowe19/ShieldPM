// script to translate all
import fs from 'fs';
import path from 'path';

const langDir = '/home/shedowe/ShieldPM-1/frontend/src/locale/lang';

const translations = {
  "tor.description": "Expose services via Tor Hidden Services for privacy and CGNAT bypass",
  "tor.running_status": "Tor v{{version}} is running. Onion services will be accessible via Tor Browser.",
  "tor.demo_mode_title": "Access Denied",
  "tor.demo_mode_desc": "This feature is disabled in Demo Mode.",
  "tor.demo_mode_subdesc": "Tor Onion Services are restricted for security reasons."
};

const deTranslations = {
  "tor.description": "Dienste via Tor Hidden Services für Privatsphäre und CGNAT-Bypass bereitstellen",
  "tor.running_status": "Tor v{{version}} läuft. Onion-Dienste sind über den Tor Browser erreichbar.",
  "tor.demo_mode_title": "Zugriff verweigert",
  "tor.demo_mode_desc": "Diese Funktion ist im Demo-Modus deaktiviert.",
  "tor.demo_mode_subdesc": "Tor Onion Services sind aus Sicherheitsgründen gesperrt."
};

const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json') && f !== 'lang-list.json');

for (const file of files) {
  const filePath = path.join(langDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  const toAdd = file === 'de.json' ? deTranslations : translations;
  
  let modified = false;
  for (const [key, value] of Object.entries(toAdd)) {
    if (!data[key]) {
      data[key] = value;
      modified = true;
    }
  }
  
  if (modified) {
    // Sort keys alphabetically to match the existing JSON structure
    const sortedData = Object.keys(data).sort().reduce((acc, key) => {
      acc[key] = data[key];
      return acc;
    }, {});
    
    fs.writeFileSync(filePath, JSON.stringify(sortedData, null, 2) + '\n');
    console.log(`Updated ${file}`);
  }
}
