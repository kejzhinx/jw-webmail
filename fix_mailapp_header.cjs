const fs = require('fs');
let content = fs.readFileSync('src/components/MailApp.tsx', 'utf8');

// I replaced:
/*
<div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
*/
// It's probably easier to just replace this specifically:
content = content.replace(
  '<div className="flex items-center gap-3">\n              <ThemeToggle />\n              <div className="relative">\n                <button',
  '<ThemeToggle />\n          <div className="relative">\n            <button'
);

// And replace the mangled end tags back to the original:
/*
</div>
              )}
            </div>
          </div>
        </div>
      </header>
*/
content = content.replace(
  '</div>\n              )}\n            </div>\n          </div>\n        </div>\n      </header>',
  '                </div>\n              </div>\n            )}\n          </div>\n        </div>\n      </header>'
);

fs.writeFileSync('src/components/MailApp.tsx', content);
