const fs = require('fs');
let content = fs.readFileSync('src/components/MailApp.tsx', 'utf8');

const brokenEnd = `                  </button>
                </div>
                              </div>
              </div>
            )}
          </div>
        </div>
      </header>`;

const fixedEnd = `                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>`;

content = content.replace(brokenEnd, fixedEnd);
fs.writeFileSync('src/components/MailApp.tsx', content);
