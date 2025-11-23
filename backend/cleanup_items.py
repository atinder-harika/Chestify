"""
Cleanup script to delete old processing items from Firestore
Run this to clean up stuck/failed items
"""

from config.firebase_config import initialize_firebase

def cleanup_processing_items(user_id: str):
    """Delete all items with status='processing' for a user"""
    db = initialize_firebase()
    
    items_ref = db.collection('users').document(user_id).collection('items')
    
    # Get all processing items
    docs = items_ref.where('status', '==', 'processing').stream()
    
    deleted_count = 0
    for doc in docs:
        print(f"Deleting: {doc.id} - {doc.to_dict().get('title', 'Unknown')}")
        doc.reference.delete()
        deleted_count += 1
    
    print(f"\n✅ Deleted {deleted_count} processing items")

def cleanup_all_items(user_id: str):
    """Delete ALL items for a user"""
    db = initialize_firebase()
    
    items_ref = db.collection('users').document(user_id).collection('items')
    
    docs = items_ref.stream()
    
    deleted_count = 0
    for doc in docs:
        print(f"Deleting: {doc.id} - {doc.to_dict().get('title', 'Unknown')}")
        doc.reference.delete()
        deleted_count += 1
    
    print(f"\n✅ Deleted {deleted_count} items")

if __name__ == "__main__":
    # Replace with your user ID
    USER_ID = "3GL5YBWjSlXRV7xq1073zLB3rs52"
    
    print("Cleanup Options:")
    print("1. Delete only 'processing' items")
    print("2. Delete ALL items")
    
    choice = input("Enter choice (1 or 2): ")
    
    if choice == "1":
        cleanup_processing_items(USER_ID)
    elif choice == "2":
        confirm = input("⚠️ This will delete ALL items. Type 'yes' to confirm: ")
        if confirm.lower() == 'yes':
            cleanup_all_items(USER_ID)
        else:
            print("Cancelled")
    else:
        print("Invalid choice")
