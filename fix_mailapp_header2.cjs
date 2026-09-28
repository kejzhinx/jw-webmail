const fs = require('fs');
let content = fs.readFileSync('src/components/MailApp.tsx', 'utf8');

const regex = /<ThemeToggle \/>[\s\S]+?<\/header>/;

const correctEnd = `<ThemeToggle />
          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-orange-50 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-[#F15A24] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left hidden lg:block leading-tight">
                <div className="text-xs font-bold text-neutral-800">{currentUser.name}</div>
                <div className="text-[10px] text-neutral-500 truncate max-w-[130px] font-mono">
                  {currentUser.email}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-orange-200/80 py-2 z-50 animate-in fade-in zoom-in-95">
                <div className="px-4 py-3 border-b border-neutral-100">
                  <p className="text-xs font-bold text-neutral-900">{currentUser.name}</p>
                  <p className="text-[10px] text-neutral-500 truncate font-mono mt-0.5">{currentUser.email}</p>
                </div>
                
                <div className="p-2 space-y-0.5">
                  {currentUser.role === 'admin' && onSwitchToAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onSwitchToAdmin();
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-orange-700 hover:bg-orange-50 flex items-center gap-2"
                    >
                      <Shield className="w-4 h-4 text-[#F15A24]" />
                      <span>Device Storage & Admin</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setIsDiagnosticsOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-neutral-700 hover:bg-neutral-100 flex items-center gap-2"
                  >
                    <Server className="w-4 h-4 text-orange-600" />
                    <span>Server Status</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>`;

content = content.replace(regex, correctEnd);
fs.writeFileSync('src/components/MailApp.tsx', content);
