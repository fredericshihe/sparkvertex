import { Item } from '@/types/supabase';

export const exploreCache = {
  items: [] as Item[],
  category: 'all',
  page: 0,
  hasLoaded: false,
  
  // Helper to remove an item from cache
  removeItem: (id: string) => {
    exploreCache.items = exploreCache.items.filter(item => item.id !== id);
  },

  // Helper to update an item in cache
  updateItem: (updatedItem: Item) => {
    exploreCache.items = exploreCache.items.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    );
  },

  // Helper to add an item to cache (optional, for new uploads)
  addItem: (newItem: Item) => {
    exploreCache.items = [newItem, ...exploreCache.items];
  },
  
  // Reset cache
  reset: () => {
    exploreCache.items = [];
    exploreCache.category = 'all';
    exploreCache.page = 0;
    exploreCache.hasLoaded = false;
  }
};
