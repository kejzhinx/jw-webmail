const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

const searchDelete = `{/* Delete User */}
                                {u.id !== adminUser.id && u.email !== adminUser.email && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u)}
                                    title="Delete Mailbox"
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}`;

const replaceDelete = `{/* Delete User */}
                                {u.id !== adminUser.id && u.email !== adminUser.email ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u)}
                                    title="Delete Mailbox"
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <div className="w-[28px] h-[28px]" aria-hidden="true"></div>
                                )}`;

content = content.replace(searchDelete, replaceDelete);
fs.writeFileSync('src/components/AdminPanel.tsx', content);
