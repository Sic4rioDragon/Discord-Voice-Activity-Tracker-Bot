@echo off
:loop
echo Starting bot...
node bot.js
echo Bot crashed or exited. Restarting in 5 seconds...
timeout /t 10
goto loop
