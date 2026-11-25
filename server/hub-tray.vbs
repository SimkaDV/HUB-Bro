' HUB BRO tray icon without a console window (task HubBroTray runs this at logon).
Set sh = CreateObject("WScript.Shell")
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & here & "\hub-tray.ps1""", 0, False
