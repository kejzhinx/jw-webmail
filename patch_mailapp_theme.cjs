const fs = require('fs');
let content = fs.readFileSync('src/components/MailApp.tsx', 'utf8');

// Add import
if (!content.includes("import { ThemeToggle }")) {
  content = content.replace("import { JWLogo }", "import { JWLogo }\nimport { ThemeToggle } from './ThemeToggle';");
}

// In MailApp, the header right side has a user dropdown
const rightControlsSearch = `<div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}`;

const rightControlsReplace = `<div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}`;

content = content.replace(rightControlsSearch, rightControlsReplace);
// Fix the closing div for the new flex wrapper
const rightControlsSearch2 = `</div>
            )}
          </div>
        </div>
      </header>`;

const rightControlsReplace2 = `</div>
              )}
            </div>
          </div>
        </div>
      </header>`;

content = content.replace(rightControlsSearch2, rightControlsReplace2);

fs.writeFileSync('src/components/MailApp.tsx', content);
