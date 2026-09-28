const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

const storageUi = `<div className="bg-white rounded-xl border border-orange-200/90 shadow-sm p-5 sm:p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#F15A24] shrink-0">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                        <span>Host Laptop Physical Drive Pool</span>
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          NVMe SSD Active
                        </span>
                      </h2>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        This machine is running as the dedicated mail storage server. All accounts draw their storage quota directly from this pool.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsEditDeviceStorageOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 text-xs font-semibold transition-colors self-start sm:self-auto cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Change Drive Pool Size</span>
                  </button>
                </div>

                {/* Storage Metric Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                    <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
                      Total Host Storage
                    </span>
                    <div className="text-2xl font-black text-neutral-900 mt-1">
                      {deviceStorage.totalDeviceStorageGb} <span className="text-xs font-bold text-neutral-500">GB</span>
                    </div>
                    <span className="text-[11px] text-neutral-500 block mt-0.5">Hardware drive capacity</span>
                  </div>

                  <div className="p-4 rounded-xl bg-orange-50/80 border border-orange-200">
                    <span className="text-[11px] font-bold text-orange-900 uppercase tracking-wider block">
                      Allocated to Users
                    </span>
                    <div className="text-2xl font-black text-[#F15A24] mt-1">
                      {deviceStorage.allocatedGb} <span className="text-xs font-bold text-orange-700">GB</span>
                    </div>
                    <span className="text-[11px] text-orange-700/80 block mt-0.5">
                      Reserved across {filteredUsers.length} mailboxes
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200">
                    <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block">
                      Free Drive Space
                    </span>
                    <div className="text-2xl font-black text-emerald-700 mt-1">
                      {deviceStorage.freeDeviceStorageGb} <span className="text-xs font-bold text-emerald-600">GB</span>
                    </div>
                    <span className="text-[11px] text-emerald-700/80 block mt-0.5">
                      Available to provision new accounts
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                    <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
                      Data Written
                    </span>
                    <div className="text-2xl font-black text-neutral-800 mt-1">
                      {deviceStorage.usedGb} <span className="text-xs font-bold text-neutral-500">GB</span>
                    </div>
                    <span className="text-[11px] text-neutral-500 block mt-0.5">Physical disk bytes consumed</span>
                  </div>
                </div>
              </div>`;

const insertMarker = / className="h-full bg-emerald-400\/30 transition-all duration-500"\s*\/>\s*<\/div>\s*<\/div>\s*\)\}/;
const match = content.match(insertMarker);
if(match) {
  content = content.replace(insertMarker, match[0] + '\n\n              ' + storageUi);
} else {
  console.log("Could not find insertion point!");
}

fs.writeFileSync('src/components/AdminPanel.tsx', content);
