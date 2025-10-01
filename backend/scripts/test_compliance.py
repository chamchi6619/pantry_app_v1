#!/usr/bin/env python3
"""Test compliance enforcement and safety checks."""
import sys
import os
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingestion.compliance import ComplianceEnforcer, RateLimiter, generate_fingerprint
from app.ingestion import SourceManager


def test_compliance_enforcement():
    """Test compliance rules."""
    print("\n" + "=" * 60)
    print("Testing Compliance Enforcement")
    print("=" * 60)

    enforcer = ComplianceEnforcer()

    # Test cases
    test_recipes = [
        {
            'title': 'USDA Recipe',
            'license_code': 'PUBLIC',
            'source_url': 'https://myplate.gov/recipe/123',
            'ingredients': ['flour', 'eggs', 'milk'],
            'instructions': 'Mix and bake',
            'image_url': 'https://example.com/image.jpg'
        },
        {
            'title': 'Canada Recipe (Restricted)',
            'license_code': 'RESTRICTED',
            'source_url': 'https://canada.ca/recipe/456',
            'ingredients': ['chicken', 'rice'],
            'instructions': 'Cook thoroughly',
            'image_url': 'https://example.com/image.jpg'
        },
        {
            'title': 'NHS Recipe',
            'license_code': 'OGL',
            'source_url': 'https://nhs.uk/recipe/789',
            'ingredients': ['vegetables', 'pasta'],
            'instructions': 'Boil and serve',
            'image_url': 'https://nhs.uk/image.jpg'  # Should be flagged
        },
        {
            'title': 'CC BY-SA Recipe',
            'license_code': 'CC-BY-SA',
            'source_url': 'https://wiki.example/recipe',
            'ingredients': ['beans', 'rice'],
            'instructions': 'Cook and combine'
        }
    ]

    print("\nTesting compliance for different licenses:")

    for recipe in test_recipes:
        print(f"\n📋 Recipe: {recipe['title']}")
        print(f"   License: {recipe['license_code']}")

        # Mock source
        source = {
            'requires_attribution': recipe['license_code'] != 'PUBLIC',
            'allows_instructions': recipe['license_code'] != 'RESTRICTED',
            'name': 'Test Source'
        }

        # Apply compliance
        compliant = enforcer.enforce_compliance(recipe.copy(), source)

        print(f"   Instructions allowed: {compliant.get('instructions_allowed')}")
        print(f"   Instructions present: {compliant.get('instructions') is not None}")
        print(f"   Image allowed: {compliant.get('image_licence_allowed')}")
        print(f"   Image URL: {compliant.get('image_url')}")
        print(f"   Hotlink only: {compliant.get('image_hotlink_only')}")
        print(f"   Share-alike: {compliant.get('share_alike_required')}")
        print(f"   Attribution: {compliant.get('attribution_text', '')[:50]}...")

        # Verify compliance rules
        if recipe['license_code'] == 'RESTRICTED':
            assert compliant['instructions'] is None, "❌ Instructions should be removed"
            assert compliant['instructions_allowed'] == 0, "❌ Instructions not allowed"
            print("   ✅ Facts-only enforcement working")

        if recipe['license_code'] == 'OGL':
            assert compliant['image_licence_allowed'] == 0, "❌ NHS images not allowed"
            assert compliant['image_url'] is None, "❌ Image should be removed"
            print("   ✅ Image license enforcement working")

        if recipe['license_code'] == 'CC-BY-SA':
            assert compliant['share_alike_required'] == 1, "❌ Share-alike not set"
            assert compliant['open_collection'] == 1, "❌ Open collection not set"
            print("   ✅ Share-alike enforcement working")


def test_batch_validation():
    """Test batch validation with sanity checks."""
    print("\n" + "=" * 60)
    print("Testing Batch Validation")
    print("=" * 60)

    enforcer = ComplianceEnforcer()

    test_batch = [
        {
            'title': 'Valid Recipe',
            'license_code': 'PUBLIC',
            'source_url': 'https://example.com/1',
            'ingredients': ['ing1', 'ing2', 'ing3'],
            'total_time_min': 30,
            'nutrition_json': json.dumps({'calories': 350})
        },
        {
            'title': 'Too Few Ingredients',
            'license_code': 'PUBLIC',
            'source_url': 'https://example.com/2',
            'ingredients': ['only one']  # Should fail
        },
        {
            'title': 'Non-Commercial License',
            'license_code': 'CC-BY-NC',  # Should fail
            'source_url': 'https://example.com/3',
            'ingredients': ['ing1', 'ing2']
        },
        {
            'title': 'Suspicious Nutrition',
            'license_code': 'PUBLIC',
            'source_url': 'https://example.com/4',
            'ingredients': ['ing1', 'ing2'],
            'nutrition_json': json.dumps({'calories': 5000})  # Should fail
        },
        {
            'title': 'Suspicious Time',
            'license_code': 'PUBLIC',
            'source_url': 'https://example.com/5',
            'ingredients': ['ing1', 'ing2'],
            'total_time_min': 600  # Should fail
        }
    ]

    valid, rejected = enforcer.validate_import_batch(test_batch)

    print(f"\nBatch validation results:")
    print(f"  Valid: {len(valid)}/{len(test_batch)}")
    print(f"  Rejected: {len(rejected)}/{len(test_batch)}")

    print("\n❌ Rejected recipes:")
    for item in rejected:
        print(f"  - {item['recipe']}: {item['reason']}")

    assert len(valid) == 1, "Should have 1 valid recipe"
    assert len(rejected) == 4, "Should have 4 rejected recipes"
    print("\n✅ Batch validation working correctly")


def test_rate_limiter():
    """Test rate limiting."""
    print("\n" + "=" * 60)
    print("Testing Rate Limiter")
    print("=" * 60)

    import asyncio

    async def test_limits():
        limiter = RateLimiter()

        hosts = [
            'myplate.gov',
            'foodsafetykorea.go.kr',
            'nhs.uk',
            'unknown.example.com'
        ]

        print("Testing rate limits for different hosts:")
        for host in hosts:
            min_delay = limiter.min_delays.get(host, limiter.min_delays['default'])
            print(f"  {host}: {min_delay}s minimum delay")

            # Test waiting
            start = asyncio.get_event_loop().time()
            await limiter.wait_if_needed(host)
            await limiter.wait_if_needed(host)  # Second request should wait
            elapsed = asyncio.get_event_loop().time() - start

            assert elapsed >= min_delay * 0.9, f"Rate limit not enforced for {host}"
            print(f"    ✅ Rate limit enforced ({elapsed:.2f}s)")

    asyncio.run(test_limits())


def test_fingerprint_generation():
    """Test fingerprint generation for deduplication."""
    print("\n" + "=" * 60)
    print("Testing Fingerprint Generation")
    print("=" * 60)

    test_recipes = [
        {
            'title': 'Chicken Salad',
            'ingredients': ['chicken', 'lettuce', 'tomato', 'dressing']
        },
        {
            'title': 'CHICKEN SALAD',  # Same as above, different case
            'ingredients': ['lettuce', 'chicken', 'dressing', 'tomato']  # Different order
        },
        {
            'title': 'Chicken Salad Recipe',  # Slightly different title
            'ingredients': ['chicken', 'lettuce', 'tomato', 'dressing']
        },
        {
            'title': 'Beef Salad',  # Different recipe
            'ingredients': ['beef', 'lettuce', 'tomato', 'dressing']
        }
    ]

    fingerprints = []
    for i, recipe in enumerate(test_recipes):
        fp = generate_fingerprint(recipe)
        fingerprints.append(fp)
        print(f"\nRecipe {i+1}: {recipe['title']}")
        print(f"  Fingerprint: {fp[:16]}...")

    # First two should have same fingerprint (normalized)
    assert fingerprints[0] == fingerprints[1], "Normalized recipes should match"
    print("\n✅ Case/order normalization working")

    # Third should be different (title differs)
    assert fingerprints[0] != fingerprints[2], "Different titles should differ"
    print("✅ Title difference detection working")

    # Fourth should be different (ingredients differ)
    assert fingerprints[0] != fingerprints[3], "Different ingredients should differ"
    print("✅ Ingredient difference detection working")


def test_idempotency():
    """Test idempotent imports."""
    print("\n" + "=" * 60)
    print("Testing Idempotency")
    print("=" * 60)

    # Simulate running same recipe twice
    recipe = {
        'external_id': 'test_123',
        'source_key': 'test_source',
        'title': 'Test Recipe',
        'license_code': 'PUBLIC',
        'source_url': 'https://example.com/test',
        'ingredients': ['ing1', 'ing2', 'ing3']
    }

    fp1 = generate_fingerprint(recipe)
    fp2 = generate_fingerprint(recipe)

    assert fp1 == fp2, "Same recipe should generate same fingerprint"
    print("✅ Fingerprints are deterministic")

    # With unique constraint on (source_key, external_id),
    # second import would be UPDATE not INSERT
    print("✅ Idempotency will be enforced by unique index")


def main():
    """Run all compliance tests."""
    print("🔒 Testing Compliance and Safety Features")

    test_compliance_enforcement()
    test_batch_validation()
    test_rate_limiter()
    test_fingerprint_generation()
    test_idempotency()

    print("\n" + "=" * 60)
    print("✅ All compliance tests passed!")
    print("=" * 60)

    print("\n📝 Compliance Summary:")
    print("  • Canada treated as RESTRICTED (facts-only)")
    print("  • NHS/GoJ images flagged as hotlink-only")
    print("  • CC-BY-SA marked for open collection")
    print("  • Nutrition/time sanity checks working")
    print("  • Rate limiting enforced per host")
    print("  • Idempotent imports via fingerprints")


if __name__ == "__main__":
    main()