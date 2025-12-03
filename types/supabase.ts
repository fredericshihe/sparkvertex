export interface Item {
  id: string;
  created_at: string;
  title: string;
  description: string;
  user_id: string;
  author_id: string;
  file_url: string;
  price: number;
  currency: string;
  views: number; // Download count in original code
  page_views: number;
  likes: number;
  category: string;
  tags: string[];
  content?: string; // HTML content
  prompt?: string;
  author?: string; // Joined from profiles
  authorAvatar?: string; // Joined from profiles
  color?: string;
  downloads?: number;
  icon_url?: string;
  is_public?: boolean;
  quality_score?: number;
  richness_score?: number;
  utility_score?: number;
  total_score?: number;
  daily_rank?: number;
  analysis_reason?: string;
}

export interface Order {
  id: string;
  created_at: string;
  buyer_id: string;
  seller_id: string;
  item_id: number;
  price: number;
  status: string;
  remark?: string;
  amount: number;
}

export interface Feedback {
  id: string;
  user_id?: string;
  email: string;
  type: string;
  content: string;
  screenshot?: string;
  user_agent?: string;
  page_url?: string;
  created_at: string;
  status: string;
}
