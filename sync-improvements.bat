@echo off
REM Sync WEB IMPROVEMENTS.md + CHANGELOG.md: repo (source of truth) -> Obsidian mirror
set OK=1

copy /Y "D:\TeeTales\GitHub\teetaleslk.github.io\WEB IMPROVEMENTS.md" "G:\My Drive\Personal Documents\GD ObsidianNotes\TeeTales\WEB IMPROVEMENTS.md"
if not %errorlevel%==0 set OK=0

copy /Y "D:\TeeTales\GitHub\teetaleslk.github.io\CHANGELOG.md" "G:\My Drive\Personal Documents\GD ObsidianNotes\TeeTales\CHANGELOG.md"
if not %errorlevel%==0 set OK=0

if %OK%==1 (echo Synced OK - WEB IMPROVEMENTS.md + CHANGELOG.md) else (echo SYNC FAILED - check paths)
pause
