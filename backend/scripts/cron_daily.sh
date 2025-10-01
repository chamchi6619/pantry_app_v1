#!/bin/bash
# Daily recipe collection and maintenance script
# Run this via cron or manually

set -e  # Exit on error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$BACKEND_DIR/data"
LOG_DIR="$DATA_DIR/logs"
DATE=$(date +%Y%m%d)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create log directory if needed
mkdir -p "$LOG_DIR"

# Log file for this run
LOG_FILE="$LOG_DIR/collection_${DATE}.log"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to run command and log output
run_cmd() {
    local cmd="$1"
    local desc="$2"

    log "Starting: $desc"
    if $cmd >> "$LOG_FILE" 2>&1; then
        log "✅ Success: $desc"
        return 0
    else
        log "❌ Failed: $desc"
        return 1
    fi
}

# Main execution
log "========================================="
log "Starting daily recipe collection"
log "========================================="

# Change to backend directory
cd "$BACKEND_DIR"

# 1. Backup database before collection
if [ -f "$DATA_DIR/pantry.db" ]; then
    log "Backing up database..."
    cp "$DATA_DIR/pantry.db" "$DATA_DIR/backups/pantry_${TIMESTAMP}.db" 2>/dev/null || \
        mkdir -p "$DATA_DIR/backups" && cp "$DATA_DIR/pantry.db" "$DATA_DIR/backups/pantry_${TIMESTAMP}.db"
    log "✅ Database backed up"
fi

# 2. Run collection for all sources
log "Collecting recipes..."
SOURCES="mfds,usda,themealdb"

if run_cmd "python scripts/collect_all.py --sources=$SOURCES" "Recipe collection"; then
    # 3. Deduplicate
    run_cmd "python scripts/deduplicate_enhanced.py" "Deduplication"

    # 4. Optimize database
    run_cmd "python scripts/optimize_db.py" "Database optimization" || true

    # 5. Generate statistics
    log "Generating statistics..."
    python scripts/ingest_recipes.py stats >> "$LOG_FILE" 2>&1

    # 6. Run compliance check on sample
    run_cmd "python scripts/quality_audit.py --sample=50" "Quality audit" || true
else
    log "⚠️ Collection failed, skipping post-processing"
fi

# 7. Clean up old logs (keep 30 days)
log "Cleaning up old logs..."
find "$LOG_DIR" -name "collection_*.log" -mtime +30 -delete 2>/dev/null || true

# 8. Clean up old backups (keep 7 days)
log "Cleaning up old backups..."
find "$DATA_DIR/backups" -name "pantry_*.db" -mtime +7 -delete 2>/dev/null || true

# 9. Generate summary
log "========================================="
log "Collection Summary"
log "========================================="

# Get current stats
if [ -f "$DATA_DIR/pantry.db" ]; then
    TOTAL_RECIPES=$(sqlite3 "$DATA_DIR/pantry.db" "SELECT COUNT(*) FROM recipes WHERE takedown = 0;" 2>/dev/null || echo "0")
    TOTAL_SOURCES=$(sqlite3 "$DATA_DIR/pantry.db" "SELECT COUNT(DISTINCT source_key) FROM recipes WHERE takedown = 0;" 2>/dev/null || echo "0")

    log "Total recipes: $TOTAL_RECIPES"
    log "Total sources: $TOTAL_SOURCES"

    # Recipe counts by source
    log "Recipes by source:"
    sqlite3 "$DATA_DIR/pantry.db" "
        SELECT source_key, COUNT(*) as count
        FROM recipes
        WHERE takedown = 0
        GROUP BY source_key
        ORDER BY count DESC;
    " 2>/dev/null | while IFS='|' read -r source count; do
        log "  - $source: $count"
    done
fi

# 10. Check for errors in log
ERROR_COUNT=$(grep -c "❌\|ERROR\|Failed" "$LOG_FILE" 2>/dev/null || echo "0")
if [ "$ERROR_COUNT" -gt 0 ]; then
    log "⚠️ Found $ERROR_COUNT errors in today's run"
else
    log "✅ No errors detected"
fi

log "========================================="
log "Daily collection complete"
log "========================================="

# Optional: Send notification (uncomment and configure)
# if command -v mail >/dev/null 2>&1; then
#     tail -n 50 "$LOG_FILE" | mail -s "Recipe Collection Report - $DATE" admin@example.com
# fi

exit 0