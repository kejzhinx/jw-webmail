const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// Add import
if (!content.includes("import { ThemeToggle }")) {
  content = content.replace("import { JWLogo }", "import { JWLogo }\nimport { ThemeToggle } from './ThemeToggle';");
}

// Add to header right controls
const rightControlsSearch = `<div className="flex items-center gap-3">
             
          <button
            type="button"
            onClick={onLogout}`;

const rightControlsReplace = `<div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={onLogout}`;

content = content.replace(rightControlsSearch, rightControlsReplace);

fs.writeFileSync('src/components/AdminPanel.tsx', content);
