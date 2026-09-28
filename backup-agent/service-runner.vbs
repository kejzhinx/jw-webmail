' JW-Webmail Automatic Backup Service Silent Background Runner
' Runs node agent.mjs in the background without showing any command prompt window
Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
WshShell.Run "node agent.mjs", 0, False
