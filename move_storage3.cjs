const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

const tab3Search = /\{\/\* TAB 3: HOST DEVICE STORAGE POOL \*\/\}[\s\S]+?activeTab === 'storage' && deviceStorage && \(\s*<div className="space-y-6 animate-in fade-in-50">([\s\S]+?)\s*<\/div>\s*\)\}\s*<\/main>/;

const match = content.match(tab3Search);
if (!match) {
  console.log("Could not find TAB 3!");
  process.exit(1);
}

const storageUi = match[1];

// Remove TAB 3 and storage tab button
let newContent = content.replace(tab3Search, '</main>');
newContent = newContent.replace(/\{\/\* 3\. Host Device Storage Pool \*\/\}[\s\S]+?(?=\{\/\* Admin Overview Content)/, '');

// Append storageUi before TAB 2
const tab2Marker = '{/* TAB 2: BLUEHOST SERVER & EMAIL DOMAINS (MANDATED USER REQUIREMENT) */}';
newContent = newContent.replace(tab2Marker, storageUi + '\n\n            </div>\n          )}\n\n          ' + tab2Marker);
// Wait, the original had `</div>\n          )}` right before tab 2 marker. So we need to insert it inside that `</div>`.

// Let's replace the `</div>\n          )}\n\n          {/* TAB 2:`
newContent = content.replace(tab3Search, '</main>');
newContent = newContent.replace(/\{\/\* 3\. Host Device Storage Pool \*\/\}[\s\S]+?(?=\{\/\* Admin Overview Content)/, '');

const endOfTab1 = /<\/div>\s*\)\}\s*\{\/\* TAB 2: BLUEHOST SERVER & EMAIL DOMAINS \(MANDATED USER REQUIREMENT\) \*\/\}/;
newContent = newContent.replace(endOfTab1, storageUi + '\n            </div>\n          )}\n\n          {/* TAB 2: BLUEHOST SERVER & EMAIL DOMAINS (MANDATED USER REQUIREMENT) */}');


fs.writeFileSync('src/components/AdminPanel.tsx', newContent);
