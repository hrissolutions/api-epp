@echo off
REM Script to drop old unique index from approvalLevels collection
REM This fixes the error: "Unique constraint failed on the constraint: approvalLevels_workflowId_level_key"
REM
REM Usage:
REM   scripts\drop-old-approval-level-index.bat

echo.
echo 🔍 Dropping old unique index from approvalLevels collection...
echo.

REM Check if DATABASE_URL is set
if "%DATABASE_URL%"=="" (
    echo ❌ Error: DATABASE_URL environment variable is not set
    echo    Please set it in your .env file or set it manually:
    echo    set DATABASE_URL=mongodb://localhost:27017/your_database
    exit /b 1
)

REM Run the MongoDB script
mongosh "%DATABASE_URL%" --file scripts\drop-old-approval-level-index.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Script completed successfully!
    echo.
) else (
    echo.
    echo ❌ Script failed. Please check the error messages above.
    echo.
    exit /b 1
)
