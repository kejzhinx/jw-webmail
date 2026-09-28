const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

const lines = content.split('\n');
// We want to delete lines 808 to 823 (0-indexed 807 to 822)
// But let's be safe and match the exact text.
const mangledSearch = `              <div className="bg-white rounded-xl border border-orange-200/90 shadow-sm p-5 sm:p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#F15A24] shrink-0">
                      <HardDrive className="w-5 h-5" />
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
              </div>`;

if (content.includes(mangledSearch)) {
  content = content.replace(mangledSearch, '');
  fs.writeFileSync('src/components/AdminPanel.tsx', content);
  console.log("Mangled block removed");
} else {
  console.log("Could not find mangled text exactly.");
}

