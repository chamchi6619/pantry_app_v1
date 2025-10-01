"""
Test script for item normalization
Run: python test_normalization.py
"""

from app.services.item_normalizer import item_normalizer

# Test samples from real receipts
test_items = [
    # Walmart abbreviations
    "WHP HVY CRM QT",
    "MLK 2% GAL",
    "CHKN BRST BNLS SKLS",
    "GV WHL MLK",
    "MARKETSIDE SPIN",
    "GRND BF 80/20",
    "CHZ CHED SHRD",

    # Brand products
    "SILK SOY",
    "ALMOND BREEZE",
    "CHOBANI YOGURT",
    "PHILADELPHIA CRM CHZ",
    "KRAFT MAC & CHEESE",

    # Produce
    "ORG BAN",
    "RED APPL",
    "BROC CROWN",
    "SWTWT POT",

    # Mixed codes and flags
    "BREAD F",
    "EGGS LRG T",
    "123456789012 MILK",

    # Already clean items
    "Whole Wheat Bread",
    "Fresh Strawberries",
    "Organic Spinach"
]

def test_normalization():
    """Test normalization on various items"""
    print("=" * 80)
    print("ITEM NORMALIZATION TEST")
    print("=" * 80)

    for item in test_items:
        result = item_normalizer.normalize(item, merchant="WALMART")

        print(f"\nOriginal:   {item}")
        print(f"Normalized: {result.normalized}")
        print(f"Confidence: {result.confidence:.2f}")
        print(f"Method:     {result.method}")

        if item != result.normalized:
            print(f"✓ Changed")
        else:
            print(f"- No change needed")

    print("\n" + "=" * 80)
    print("BATCH PROCESSING TEST")
    print("=" * 80)

    # Test batch processing
    batch_results = item_normalizer.batch_normalize(test_items[:5], merchant="KROGER")

    print(f"\nBatch processed {len(batch_results)} items:")
    for result in batch_results:
        print(f"  {result.original:30} → {result.normalized}")

if __name__ == "__main__":
    test_normalization()