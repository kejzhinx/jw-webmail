const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// Find the storage block I mistakenly put at the end of the mailboxes tab
const badStorageBlockSearch = /<div className="bg-white rounded-xl border border-orange-200\/90 shadow-sm p-5 sm:p-6 space-y-6">\s*<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-4">[\s\S]+?<\/div>\s*<\/div>\s*<\/div>\n            <\/div>\n          \)}\n\n          \{\/\* TAB 2/;

const match = content.match(badStorageBlockSearch);
if (!match) {
  console.log("Could not find the misplaced block!");
} else {
  // Extract just the parts we want: header and the 4 stat cards
  const block = match[0];
  const headerSearch = /<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-4">[\s\S]+?<\/div>/;
  const statsSearch = /\{\/\* Storage Metric Cards \*\/\}[\s\S]+?<\/div>/;
  
  const headerMatch = block.match(headerSearch);
  const statsMatch = block.match(statsSearch);
  
  if (headerMatch && statsMatch) {
    const cleanBlock = `<div className="bg-white rounded-xl border border-orange-200/90 shadow-sm p-5 sm:p-6 space-y-6">
                ${headerMatch[0]}
                ${statsMatch[0]}
              </div>`;
              
    // Remove it from the bottom
    content = content.replace(badStorageBlockSearch, '\n            </div>\n          )}\n\n          {/* TAB 2');
    
    // Insert it after the Host Device Storage Allocation gauge
    const gaugeEndSearch = / className="h-full bg-emerald-400\/30 transition-all duration-500"\s*\/>\s*<\/div>\s*<\/div>\s*\)\}/;
    const insertAfter = content.match(gaugeEndSearch)[0];
    content = content.replace(insertAfter, insertAfter + '\n\n              ' + cleanBlock);
  }
}

fs.writeFileSync('src/components/AdminPanel.tsx', content);
