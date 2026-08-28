@echo off
setlocal
set SRC=..\diandian-app
set DST=app\src\main\assets\www
if not exist "%DST%" mkdir "%DST%"
copy /Y "%SRC%\index.html" "%DST%\" >nul
copy /Y "%SRC%\manifest.webmanifest" "%DST%\" >nul
copy /Y "%SRC%\sw.js" "%DST%\" >nul
xcopy /Y /E /I "%SRC%\css" "%DST%\css" >nul
xcopy /Y /E /I "%SRC%\js" "%DST%\js" >nul
xcopy /Y /E /I "%SRC%\icons" "%DST%\icons" >nul
echo Synced %SRC% -^> %DST%
