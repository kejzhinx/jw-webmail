const fs = require('fs');
let content = fs.readFileSync('src/components/MailApp.tsx', 'utf8');

// The marker we want to insert ThemeToggle before:
const marker = '{/* User Profile Dropdown */}';
content = content.replace(marker, '<ThemeToggle />\n          {/* User Profile Dropdown */}');

fs.writeFileSync('src/components/MailApp.tsx', content);
