const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// Fix closing tags
content = content.replace(
  /                                <\/button>\n                                \)}\n                              <\/div>\n                            <\/td>\n                          <\/tr>/,
  `                                </button>
                                )}
                              </div>
                              </div>
                            </td>
                          </tr>`
);

fs.writeFileSync('src/components/AdminPanel.tsx', content);
