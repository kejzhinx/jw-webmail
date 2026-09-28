const fs = require('fs');
['src/components/AdminPanel.tsx', 'src/components/MailApp.tsx'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/import \{ ThemeToggle \} from '\.\/ThemeToggle'; from '\.\/JWLogo';/, "import { JWLogo } from './JWLogo';\nimport { ThemeToggle } from './ThemeToggle';");
  fs.writeFileSync(file, content);
});
