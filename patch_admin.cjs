const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');
content = content.replace(
  '        {/* Right Admin Controls */}\n        <div className="flex items-center gap-3">\n             \n\n          <button\n            type="button"\n            onClick={onLogout}',
  '        {/* Right Admin Controls */}\n        <div className="flex items-center gap-3">\n          <ThemeToggle />\n          <button\n            type="button"\n            onClick={onLogout}'
);
fs.writeFileSync('src/components/AdminPanel.tsx', content);
