@echo off
:: TeeTales — Sync TTSE_Translation.md from Obsidian to GitHub repo
:: Double-click this file after editing translations in Obsidian

set SRC=G:\My Drive\Personal Documents\GD ObsidianNotes\TeeTales\TTSE_Translation.md
set DST=D:\TeeTales\GitHub\teetaleslk.github.io\TTSE_Translation.md

copy /Y "%SRC%" "%DST%"

if %errorlevel%==0 (
  echo.
  echo  Synced successfully!
  echo  Now commit and push in GitHub Desktop.
) else (
  echo.
  echo  ERROR: Could not copy file. Check that Obsidian path is correct.
)

pause
