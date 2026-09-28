const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

const tabButtonSearch = /\{\/\* 3\. Host Device Storage Pool \*\/\}[\s\S]+?<\/button>/;
content = content.replace(tabButtonSearch, '');

fs.writeFileSync('src/components/AdminPanel.tsx', content);
