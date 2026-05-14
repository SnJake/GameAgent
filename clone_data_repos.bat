@echo off
setlocal
cd /d "%~dp0"

if not exist "ArknightsGamedata" (
  git clone https://github.com/ArknightsAssets/ArknightsGamedata ArknightsGamedata
) else (
  echo ArknightsGamedata already exists.
)

if not exist "ArknightsGameData_Zh_CN" (
  git clone https://github.com/Kengxxiao/ArknightsGameData.git ArknightsGameData_Zh_CN
) else (
  echo ArknightsGameData_Zh_CN already exists.
)

if not exist "ArknightsStoryJson" (
  git clone https://github.com/050644zf/ArknightsStoryJson ArknightsStoryJson
) else (
  echo ArknightsStoryJson already exists.
)

if not exist "Arknight-Images" (
  git clone https://github.com/Aceship/Arknight-Images Arknight-Images
) else (
  echo Arknight-Images already exists.
)

echo.
echo Data repos are ready. Run rebuild_index.bat after cloning or updating data.
endlocal
