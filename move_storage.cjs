const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// 1. Remove the storage tab button
const tabSearch = /\{\/\* 3\. Host Device Storage Pool \*\/\}[\s\S]+?(?=\{\/\* Admin Overview Content)/;
content = content.replace(tabSearch, '');

// 2. Extract TAB 3 content
const tab3Search = /\{\/\* TAB 3: HOST DEVICE STORAGE POOL \*\/\}[\s\S]+?\{\/\* End Main Content \*\/}/;
const match = content.match(tab3Search);
if (!match) {
  console.log("Could not find TAB 3 content");
} else {
  let tab3Content = match[0];
  // Remove the wrapper {activeTab === 'storage' && ... }
  tab3Content = tab3Content.replace(/\{activeTab === 'storage' && deviceStorage && \(/, '');
  tab3Content = tab3Content.replace(/\s*\}\)\}\s*\{\/\* End Main Content \*\/}/, '\n        {/* End Main Content */}');

  // Also remove it from the original place
  content = content.replace(tab3Search, '        {/* End Main Content */}');

  // Now, find the Host Device Storage Allocation in the users tab
  const allocationSearch = /<div className="h-2\.5 w-full bg-neutral-100 rounded-full overflow-hidden flex border border-neutral-200">[\s\S]+?<\/div>\s*<\/div>\s*<\/div>\s*\)\}/;
  
  const allocationMatch = content.match(allocationSearch);
  if (allocationMatch) {
    const replaceWith = allocationMatch[0] + '\n\n' + tab3Content;
    content = content.replace(allocationSearch, replaceWith);
  } else {
    console.log("Could not find allocation section");
  }
}

fs.writeFileSync('src/components/AdminPanel.tsx', content);
