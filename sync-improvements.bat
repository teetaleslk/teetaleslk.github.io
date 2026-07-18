@echo off
REM Sync IMPROVEMENTS.md: repo (source of truth) -> Obsidian mirror
copy /Y "D:\TeeTales\GitHub\teetaleslk.github.io\IMPROVEMENTS.md" "G:\My Drive\Personal Documents\GD ObsidianNotes\TeeTales\IMPROVEMENTS.md"
if %errorlevel%==0 (echo Synced OK) else (echo SYNC FAILED - check paths)
pause
