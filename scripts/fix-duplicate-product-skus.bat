@echo off
REM Script to fix duplicate product SKUs
REM 
REM Usage:
REM   scripts\fix-duplicate-product-skus.bat

echo.
echo ========================================
echo Fix Duplicate Product SKUs
echo ========================================
echo.

echo Checking for Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error: Node.js is not installed or not in PATH
    echo    Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js found
echo.

echo Checking for ts-node...
npx ts-node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing ts-node...
    npm install -g ts-node typescript
)

echo.
echo 🚀 Running duplicate SKU fix script...
echo.

npx ts-node scripts/fix-duplicate-product-skus.ts

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Script completed successfully!
    echo.
) else (
    echo.
    echo ❌ Script failed. Please check the error messages above.
    echo.
    pause
    exit /b 1
)

pause
