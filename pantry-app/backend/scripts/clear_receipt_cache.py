#!/usr/bin/env python3
"""Clear cached receipt data to force reprocessing"""

import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from app.database import get_supabase_client

def clear_receipt_cache(receipt_id: str):
    """Clear all cached data for a specific receipt"""
    client = get_supabase_client()

    # Authenticate first
    print("Authenticating as test5@pantry.com...")
    try:
        auth_response = client.auth.sign_in_with_password({
            "email": "test5@pantry.com",
            "password": "test1234"
        })
        print("✅ Authentication successful")
    except Exception as e:
        print(f"❌ Authentication failed: {e}")
        return False

    try:
        # 1. Delete from receipt_fix_queue
        print(f"\nDeleting items from receipt_fix_queue for receipt_id: {receipt_id}")
        result = client.table('receipt_fix_queue').delete().eq('receipt_id', receipt_id).execute()
        print(f"  Deleted {len(result.data) if result.data else 0} items from fix queue")

        # 2. Delete from receipts
        print(f"Deleting receipt record: {receipt_id}")
        result = client.table('receipts').delete().eq('id', receipt_id).execute()
        print(f"  Deleted {len(result.data) if result.data else 0} receipt records")

        # 3. Delete from receipt_jobs (find by receipt_id)
        print(f"Deleting job records for receipt_id: {receipt_id}")
        result = client.table('receipt_jobs').delete().eq('receipt_id', receipt_id).execute()
        print(f"  Deleted {len(result.data) if result.data else 0} job records")

        print("\n✅ Cache cleared successfully!")
        print("You can now rescan the receipt and it will use the v11 parser.")

    except Exception as e:
        print(f"❌ Error clearing cache: {e}")
        return False

    return True

if __name__ == "__main__":
    # The receipt ID from the logs
    RECEIPT_ID = "8e3fcacd-77df-4f86-accc-7aa3feee99b3"

    print("=" * 50)
    print("CLEARING RECEIPT CACHE")
    print("=" * 50)
    print(f"Receipt ID: {RECEIPT_ID}")
    print()

    success = clear_receipt_cache(RECEIPT_ID)

    if success:
        print("\n🎉 Cache cleared! The next scan will run the v11 parser.")
    else:
        print("\n⚠️ Failed to clear cache. Check the error messages above.")