import Dexie, { Table } from 'dexie';
import { Item } from '@/types/supabase';

// Extend the Item interface for local storage if needed
// We keep it simple for now, just storing the Item
export interface LocalItem extends Item {
  saved_at: number; // Timestamp when it was saved locally
  last_viewed: number;
}

class SparkVertexDB extends Dexie {
  history!: Table<LocalItem>;

  constructor() {
    super('SparkVertexDB');
    
    // Define tables and indexes
    // 'id' is the primary key
    // 'saved_at' and 'last_viewed' are indexed for sorting
    this.version(1).stores({
      history: 'id, title, author, saved_at, last_viewed' 
    });
  }
}

export const db = new SparkVertexDB();

// Helper to save an item
export const saveToHistory = async (item: Item) => {
  try {
    await db.history.put({
      ...item,
      saved_at: Date.now(),
      last_viewed: Date.now()
    });
    console.log('Item saved to local history:', item.title);
  } catch (error) {
    console.error('Failed to save item to local history:', error);
  }
};

// Helper to get recent history
export const getRecentHistory = async (limit = 20) => {
  return await db.history.orderBy('last_viewed').reverse().limit(limit).toArray();
};
