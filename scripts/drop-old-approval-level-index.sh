#!/bin/bash

# Script to drop old unique index from approvalLevels collection
# This fixes the error: "Unique constraint failed on the constraint: approvalLevels_workflowId_level_key"
#
# Usage:
#   chmod +x scripts/drop-old-approval-level-index.sh
#   ./scripts/drop-old-approval-level-index.sh

echo ""
echo "🔍 Dropping old unique index from approvalLevels collection..."
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    echo "   Please set it in your .env file or export it:"
    echo "   export DATABASE_URL='mongodb://localhost:27017/your_database'"
    exit 1
fi

# Run the MongoDB script
mongosh "$DATABASE_URL" --file scripts/drop-old-approval-level-index.js

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Script completed successfully!"
    echo ""
else
    echo ""
    echo "❌ Script failed. Please check the error messages above."
    echo ""
    exit 1
fi
