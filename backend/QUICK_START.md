# Quick Start - Recipe Collection

## Prerequisites

### 1. Python 3.8+ with pip
```bash
python --version  # Should be 3.8 or higher
pip --version
```

### 2. SQLite3
```bash
sqlite3 --version  # Usually pre-installed
```

## Installation Steps

### Step 1: Install Dependencies
```bash
cd backend

# Install base FastAPI requirements
pip install -r requirements.txt

# Install collection-specific requirements
pip install -r requirements_collection.txt

# Or install everything at once:
pip install fastapi uvicorn sqlalchemy aiofiles python-jose passlib \
           bcrypt python-multipart aiohttp beautifulsoup4 lxml
```

### Step 2: Initialize Database
```bash
# Create database directory
mkdir -p data

# Initialize database with schema
python scripts/init_db.py

# Apply collection-specific fields
sqlite3 data/pantry.db < migrations/add_collection_fields.sql
sqlite3 data/pantry.db < migrations/add_production_fields.sql
```

### Step 3: Configure Environment
```bash
# Copy example environment file
cp .env.example .env

# Edit .env and add your API keys (optional for testing)
# MFDS_API_KEY=sample_key  # Works for testing
# THEMEALDB_API_KEY=1      # Free test key
```

### Step 4: Test Setup
```bash
# Test that everything is installed correctly
python scripts/test_compliance.py

# Expected output:
# ✅ All compliance tests passed!
```

## Running Your First Collection

### Quick Test (5 recipes)
```bash
# Collect just 5 recipes to test
python scripts/collect_all.py --sources=usda --limit=5

# Check what was collected
python scripts/ingest_recipes.py stats
```

### Full Day 1 Collection (~3000-5000 recipes)
```bash
# Run all Day 1 sources
python scripts/collect_all.py --sources=mfds,usda,themealdb

# Remove duplicates
python scripts/deduplicate_enhanced.py

# Optimize database
python scripts/optimize_db.py

# View results
python scripts/ingest_recipes.py stats
```

## Starting the API Server
```bash
# In a separate terminal, start the API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Test it's working
curl http://localhost:8000/health

# View API docs
# Open browser to http://localhost:8000/docs
```

## Testing with Expo App
```bash
# In your React Native app, update API URL:
# iOS Simulator: http://localhost:8000
# Android Emulator: http://10.0.2.2:8000
# Physical Device: http://YOUR_COMPUTER_IP:8000

# Find your computer's IP:
# Windows: ipconfig
# Mac/Linux: ifconfig | grep "inet "
```

## Troubleshooting

### "Module not found" errors
```bash
# Install missing module
pip install [module_name]

# Or reinstall all requirements
pip install -r requirements.txt
pip install -r requirements_collection.txt
```

### "Database is locked"
```bash
# Ensure only one process is writing to database
# Kill any hanging Python processes
# Windows: taskkill /F /IM python.exe
# Mac/Linux: pkill python
```

### "No recipes collected"
```bash
# Check internet connection
# Verify API keys in .env (though defaults work for testing)
# Try with --limit=5 first
# Check logs in data/logs/
```

### "Permission denied"
```bash
# Make scripts executable
chmod +x scripts/*.py
chmod +x scripts/*.sh
```

## Minimum Working Example

```bash
# Absolute minimum to get recipes in database:

# 1. Install only essential packages
pip install aiohttp beautifulsoup4 lxml

# 2. Initialize database
python scripts/init_db.py

# 3. Collect from USDA (no API key needed)
python -c "
import asyncio
import sys
sys.path.insert(0, '.')
from app.ingestion.scrapers.usda_enhanced import USDAEnhancedScraper

async def quick_collect():
    async with USDAEnhancedScraper() as scraper:
        recipes = await scraper.collect(limit=10)
        print(f'Collected {len(recipes)} recipes')

        # Save to database
        import sqlite3
        conn = sqlite3.connect('data/pantry.db')
        for r in recipes:
            conn.execute('INSERT OR IGNORE INTO recipes (id, title, source_url, license_code) VALUES (?, ?, ?, ?)',
                        (r.get('external_id', 'test'), r['title'], r['source_url'], 'PUBLIC'))
        conn.commit()
        conn.close()

asyncio.run(quick_collect())
"

# 4. Verify
sqlite3 data/pantry.db "SELECT COUNT(*) FROM recipes"
```

## What You Get

After running collection:
- 3000-5000+ recipes in SQLite database
- Full-text search capability
- Ingredient matching for pantry
- API endpoints for your app
- Legal compliance tracking

## Next Steps

1. Connect your Expo app to the API
2. Add more sources (NHS, Japan MAFF)
3. Set up daily automation with cron
4. Monitor with `scripts/ingest_recipes.py stats`

---

**Ready to collect recipes?** Start with the quick test above!