const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// 1. Remove the Reset to 12345 button
const passwordHeaderSearch = `<div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-neutral-800 text-[11px]">
                      Account Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditPassword('12345')}
                      className="text-[10px] font-bold text-[#F15A24] hover:underline cursor-pointer"
                    >
                      Reset to 12345
                    </button>
                  </div>`;
const passwordHeaderReplace = `<div className="flex items-center mb-1">
                    <label className="block font-bold text-neutral-800 text-[11px]">
                      Account Password
                    </label>
                  </div>`;
content = content.replace(passwordHeaderSearch, passwordHeaderReplace);

// 2. Add the Lock/Unlock button back to the table, before the pencil icon.
const pencilIconSearch = `{/* Pencil Icon - All-in-One Edit User */}
                                <button`;
const lockUnlockReplace = `{/* Lock / Unlock Button */}
                                {u.status === 'locked' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleLock(u)}
                                    title="Unlock user account (Restore mailbox access)"
                                    className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                                  >
                                    <Unlock className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleLock(u)}
                                    disabled={u.id === adminUser.id || u.email === adminUser.email}
                                    title={
                                      u.id === adminUser.id || u.email === adminUser.email
                                        ? 'Cannot lock active administrator'
                                        : 'Lock user account (Disable login)'
                                    }
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <Lock className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Pencil Icon - All-in-One Edit User */}
                                <button`;

content = content.replace(pencilIconSearch, lockUnlockReplace);

fs.writeFileSync('src/components/AdminPanel.tsx', content);
