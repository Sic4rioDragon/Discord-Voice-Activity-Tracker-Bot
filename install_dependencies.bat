@echo off
echo Installing required packages...
call npm init -y
call npm install discord.js canvas googleapis sharp

echo.
echo All dependencies installed successfully!
pause
