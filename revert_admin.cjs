const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// 1. Revert Header
content = content.replace(
  '<th className="py-3.5 px-4">Current Password & Actions</th>',
  `<th className="py-3.5 px-4">Current Password</th>
                        <th className="py-3.5 px-6 text-right">Actions</th>`
);

// 2. Revert td
const searchTd = `<td className="py-4 px-4">
                              <div className="inline-flex items-center gap-3">
                                {/* Password Field */}
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="font-mono bg-neutral-100 px-2.5 py-1 rounded text-neutral-800 font-medium border border-neutral-200/80 tracking-wider text-xs">
                                    {revealedPasswords[u.id] ? u.password : '••••••••'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => togglePasswordVisibility(u.id)}
                                    title={revealedPasswords[u.id] ? 'Hide password' : 'View password'}
                                    className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-150 transition-colors cursor-pointer"
                                  >
                                    {revealedPasswords[u.id] ? (
                                      <EyeOff className="w-3.5 h-3.5 text-[#F15A24]" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                                {/* Actions: Edit, Delete */}
                                <div className="inline-flex items-center gap-1.5 border-l border-neutral-200 pl-3">`;

const replaceTd = `<td className="py-4 px-4">
                              <div className="inline-flex items-center gap-1.5">
                                <span className="font-mono bg-neutral-100 px-2.5 py-1 rounded text-neutral-800 font-medium border border-neutral-200/80 tracking-wider text-xs">
                                  {revealedPasswords[u.id] ? u.password : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility(u.id)}
                                  title={revealedPasswords[u.id] ? 'Hide password' : 'View password'}
                                  className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-150 transition-colors cursor-pointer"
                                >
                                  {revealedPasswords[u.id] ? (
                                    <EyeOff className="w-3.5 h-3.5 text-[#F15A24]" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>

                            {/* Actions: Edit, Delete */}
                            <td className="py-4 px-6 text-right">
                              <div className="inline-flex items-center gap-1.5">`;

content = content.replace(searchTd, replaceTd);

// 3. Revert close tags
content = content.replace(
  `                                </button>
                                )}
                              </div>
                              </div>
                            </td>
                          </tr>`,
  `                                </button>
                                )}
                              </div>
                            </td>
                          </tr>`
);

fs.writeFileSync('src/components/AdminPanel.tsx', content);
