#!/usr/bin/env python3
"""Parallel recipe collection orchestrator with circuit breakers."""
import sys
import os
import asyncio
import json
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass
import argparse

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion.scrapers.mfds_api import MFDSCollector
from app.ingestion.scrapers.usda_enhanced import USDAEnhancedScraper
from app.ingestion.scrapers.themealdb_commercial import TheMealDBCollector
from scripts.ingest_recipes import RecipeIngestionPipeline


@dataclass
class CollectorConfig:
    """Configuration for a recipe collector."""
    name: str
    collector_class: type
    source_key: str
    rate_limit: float
    limit: int
    enabled: bool = True
    api_key: Optional[str] = None


class CircuitBreaker:
    """Circuit breaker for handling collector failures."""

    def __init__(self, failure_threshold: int = 3, timeout: float = 60):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failures = 0
        self.last_failure_time = None
        self.state = 'closed'  # closed, open, half-open

    def call(self, func):
        """Decorator for circuit breaker protection."""
        async def wrapper(*args, **kwargs):
            if self.state == 'open':
                if self.last_failure_time:
                    elapsed = (datetime.now() - self.last_failure_time).seconds
                    if elapsed > self.timeout:
                        self.state = 'half-open'
                    else:
                        raise Exception(f"Circuit breaker is open (wait {self.timeout - elapsed}s)")

            try:
                result = await func(*args, **kwargs)
                if self.state == 'half-open':
                    self.state = 'closed'
                    self.failures = 0
                return result

            except Exception as e:
                self.failures += 1
                self.last_failure_time = datetime.now()

                if self.failures >= self.failure_threshold:
                    self.state = 'open'
                    print(f"⚠️ Circuit breaker opened after {self.failures} failures")

                raise e

        return wrapper


class CollectorOrchestrator:
    """Orchestrate parallel recipe collection."""

    def __init__(self, db_path: str = None):
        """Initialize orchestrator."""
        self.db_path = db_path or str(Path(__file__).parent.parent / "data" / "pantry.db")

        # Configure collectors
        self.collectors = {
            'mfds': CollectorConfig(
                name='MFDS Korea',
                collector_class=MFDSCollector,
                source_key='mfds_korea',
                rate_limit=2.0,
                limit=2000,
                api_key=os.getenv('MFDS_API_KEY', 'sample_key')
            ),
            'usda': CollectorConfig(
                name='USDA MyPlate',
                collector_class=USDAEnhancedScraper,
                source_key='usda_myplate',
                rate_limit=1.0,
                limit=1500
            ),
            'themealdb': CollectorConfig(
                name='TheMealDB',
                collector_class=TheMealDBCollector,
                source_key='themealdb',
                rate_limit=0.5,
                limit=300,
                api_key=os.getenv('THEMEALDB_API_KEY', '1')
            ),
        }

        # Circuit breakers for each collector
        self.circuit_breakers = {
            name: CircuitBreaker()
            for name in self.collectors
        }

        # Collection statistics
        self.stats = {
            'start_time': None,
            'end_time': None,
            'collectors_run': 0,
            'collectors_failed': 0,
            'total_recipes_collected': 0,
            'total_recipes_ingested': 0,
            'errors': []
        }

    async def collect_with_circuit_breaker(self, name: str, config: CollectorConfig) -> List[Dict]:
        """Collect recipes with circuit breaker protection."""
        breaker = self.circuit_breakers[name]

        @breaker.call
        async def protected_collect():
            print(f"\n🔄 Starting {config.name} collector...")

            # Initialize collector based on type
            if config.api_key:
                collector = config.collector_class(
                    api_key=config.api_key,
                    rate_limit=config.rate_limit
                )
            else:
                collector = config.collector_class(
                    rate_limit=config.rate_limit
                )

            # Use context manager if supported
            if hasattr(collector, '__aenter__'):
                async with collector as c:
                    return await c.collect(limit=config.limit)
            else:
                return await collector.collect(limit=config.limit)

        try:
            recipes = await protected_collect()
            print(f"✅ {config.name}: Collected {len(recipes)} recipes")
            return recipes

        except Exception as e:
            print(f"❌ {config.name} failed: {e}")
            self.stats['errors'].append({
                'collector': name,
                'error': str(e),
                'time': datetime.now().isoformat()
            })
            self.stats['collectors_failed'] += 1
            return []

    async def run_collectors(self, sources: Optional[List[str]] = None) -> Dict[str, List[Dict]]:
        """Run collectors in parallel."""
        # Filter collectors
        if sources:
            active_collectors = {
                name: config
                for name, config in self.collectors.items()
                if name in sources and config.enabled
            }
        else:
            active_collectors = {
                name: config
                for name, config in self.collectors.items()
                if config.enabled
            }

        if not active_collectors:
            print("❌ No collectors enabled")
            return {}

        print(f"🚀 Running {len(active_collectors)} collectors in parallel...")
        print(f"   Collectors: {', '.join(active_collectors.keys())}")

        # Create collection tasks
        tasks = [
            self.collect_with_circuit_breaker(name, config)
            for name, config in active_collectors.items()
        ]

        # Run in parallel
        results = await asyncio.gather(*tasks)

        # Map results to collector names
        collected_recipes = {}
        for (name, config), recipes in zip(active_collectors.items(), results):
            collected_recipes[config.source_key] = recipes
            self.stats['collectors_run'] += 1
            self.stats['total_recipes_collected'] += len(recipes)

        return collected_recipes

    async def save_collected_recipes(self, collected_recipes: Dict[str, List[Dict]]):
        """Save collected recipes to JSON files."""
        collected_dir = Path(__file__).parent.parent / "data" / "collected"
        collected_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        for source_key, recipes in collected_recipes.items():
            if not recipes:
                continue

            filename = collected_dir / f"{source_key}_{timestamp}.json"

            # Get source info
            config = next((c for c in self.collectors.values() if c.source_key == source_key), None)

            with open(filename, 'w', encoding='utf-8') as f:
                json.dump({
                    'source': config.name if config else source_key,
                    'source_key': source_key,
                    'collected_at': datetime.utcnow().isoformat(),
                    'count': len(recipes),
                    'recipes': recipes
                }, f, ensure_ascii=False, indent=2)

            print(f"💾 Saved {len(recipes)} recipes to {filename.name}")

    async def ingest_collected_recipes(self, collected_recipes: Dict[str, List[Dict]]):
        """Ingest collected recipes into database."""
        pipeline = RecipeIngestionPipeline(self.db_path)

        for source_key, recipes in collected_recipes.items():
            if not recipes:
                continue

            print(f"\n📥 Ingesting {len(recipes)} recipes from {source_key}...")

            try:
                await pipeline.ingest_from_source(source_key, recipes)
                self.stats['total_recipes_ingested'] += pipeline.stats['successfully_ingested']

            except Exception as e:
                print(f"❌ Ingestion failed for {source_key}: {e}")
                self.stats['errors'].append({
                    'step': 'ingestion',
                    'source': source_key,
                    'error': str(e)
                })

    async def run(self, sources: Optional[List[str]] = None,
                  save_only: bool = False,
                  ingest_only: bool = False,
                  input_files: Optional[List[str]] = None):
        """Main orchestration method."""
        self.stats['start_time'] = datetime.now()

        try:
            if ingest_only and input_files:
                # Load from files and ingest
                print("📂 Loading recipes from files...")
                collected_recipes = {}

                for filepath in input_files:
                    path = Path(filepath)
                    if path.exists():
                        with open(path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            source_key = data.get('source_key', 'unknown')
                            collected_recipes[source_key] = data.get('recipes', [])
                            print(f"   Loaded {len(collected_recipes[source_key])} recipes from {path.name}")

            else:
                # Collect recipes
                collected_recipes = await self.run_collectors(sources)

                # Save to files
                if collected_recipes:
                    await self.save_collected_recipes(collected_recipes)

            # Ingest into database
            if not save_only and collected_recipes:
                await self.ingest_collected_recipes(collected_recipes)

        finally:
            self.stats['end_time'] = datetime.now()
            self.print_stats()

    def print_stats(self):
        """Print collection statistics."""
        duration = (self.stats['end_time'] - self.stats['start_time']).seconds if self.stats['end_time'] else 0

        print("\n" + "=" * 60)
        print("📊 Collection Statistics")
        print("=" * 60)
        print(f"Duration: {duration // 60}m {duration % 60}s")
        print(f"Collectors run: {self.stats['collectors_run']}")
        print(f"Collectors failed: {self.stats['collectors_failed']}")
        print(f"Total recipes collected: {self.stats['total_recipes_collected']}")
        print(f"Total recipes ingested: {self.stats['total_recipes_ingested']}")

        if self.stats['errors']:
            print(f"\n⚠️ Errors encountered: {len(self.stats['errors'])}")
            for error in self.stats['errors'][:5]:
                print(f"   - {error.get('collector', error.get('step'))}: {error['error'][:100]}")


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='Collect recipes from multiple sources')
    parser.add_argument(
        '--sources',
        type=str,
        help='Comma-separated list of sources to collect (e.g., mfds,usda)'
    )
    parser.add_argument(
        '--save-only',
        action='store_true',
        help='Only collect and save, do not ingest'
    )
    parser.add_argument(
        '--ingest-only',
        action='store_true',
        help='Only ingest from existing files'
    )
    parser.add_argument(
        '--files',
        type=str,
        help='Comma-separated list of JSON files to ingest'
    )
    parser.add_argument(
        '--limit',
        type=int,
        help='Override default collection limits'
    )

    args = parser.parse_args()

    # Create orchestrator
    orchestrator = CollectorOrchestrator()

    # Override limits if specified
    if args.limit:
        for config in orchestrator.collectors.values():
            config.limit = args.limit

    # Parse sources
    sources = None
    if args.sources:
        sources = [s.strip() for s in args.sources.split(',')]

    # Parse files
    files = None
    if args.files:
        files = [f.strip() for f in args.files.split(',')]

    # Run collection
    await orchestrator.run(
        sources=sources,
        save_only=args.save_only,
        ingest_only=args.ingest_only,
        input_files=files
    )


if __name__ == "__main__":
    asyncio.run(main())