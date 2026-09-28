const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// Find the storage pool block
const tab3Search = /\{\/\* TAB 3: HOST DEVICE STORAGE POOL \*\/\}[\s\S]+?activeTab === 'storage' && deviceStorage && \(\s*<div className="space-y-6 animate-in fade-in-50">([\s\S]+?)\s*<\/div>\s*\)\}\s*<\/main>/;

const match = content.match(tab3Search);
if (!match) {
  console.log("Could not find TAB 3!");
  process.exit(1);
}

const storageUi = match[1]; // This is the inner div

// Remove the whole TAB 3 block and the storage tab button
let newContent = content.replace(tab3Search, '</main>');
newContent = newContent.replace(/\{\/\* 3\. Host Device Storage Pool \*\/\}[\s\S]+?(?=\{\/\* Admin Overview Content)/, '');

// Now we want to insert `storageUi` below the `deviceStorage` block in Mailboxes & Users
// But wait, actually they want to replace the top block? 
// The image shows the full "Host Laptop Physical Drive Pool" block being inserted. Let's just append it to the bottom of the activeTab === 'mailboxes' div.

const usersTabSearch = /(activeTab === 'mailboxes' && \(\s*<div className="space-y-6 animate-in fade-in-50">)([\s\S]+?)(<\/div>\s*\)\s*\{\/\* TAB 2)/;
const usersMatch = newContent.match(usersTabSearch);
if (!usersMatch) {
  console.log("Could not find users tab!");
  process.exit(1);
}

// Just put it below the existing content in users tab
const replaceUsers = usersMatch[1] + usersMatch[2] + '\n' + storageUi + '\n            ' + usersMatch[3];
newContent = newContent.replace(usersTabSearch, replaceUsers);

fs.writeFileSync('src/components/AdminPanel.tsx', newContent);
