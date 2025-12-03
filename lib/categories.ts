export const KNOWN_CATEGORIES: Record<string, { key: string, icon: string }> = {
  // Core Categories (English keys)
  game: { key: 'game', icon: 'fa-gamepad' },
  tool: { key: 'tool', icon: 'fa-screwdriver-wrench' },
  productivity: { key: 'productivity', icon: 'fa-list-check' },
  design: { key: 'design', icon: 'fa-palette' },
  devtool: { key: 'devtool', icon: 'fa-code' },
  entertainment: { key: 'entertainment', icon: 'fa-film' },
  education: { key: 'education', icon: 'fa-graduation-cap' },
  visualization: { key: 'visualization', icon: 'fa-chart-pie' },
  lifestyle: { key: 'lifestyle', icon: 'fa-mug-hot' },
  
  // Chinese mappings
  // 休闲游戏
  '游戏': { key: 'game', icon: 'fa-gamepad' },
  '游戏娱乐': { key: 'game', icon: 'fa-gamepad' },
  '休闲游戏': { key: 'game', icon: 'fa-gamepad' },
  '益智游戏': { key: 'game', icon: 'fa-gamepad' },
  'Game': { key: 'game', icon: 'fa-gamepad' },
  
  // 创意设计
  '创意': { key: 'design', icon: 'fa-palette' },
  '创意设计': { key: 'design', icon: 'fa-palette' },
  '设计': { key: 'design', icon: 'fa-palette' },
  '艺术': { key: 'design', icon: 'fa-palette' },
  'Eye Candy': { key: 'design', icon: 'fa-palette' },
  'Design': { key: 'design', icon: 'fa-palette' },
  
  // 办公效率
  '生产力': { key: 'productivity', icon: 'fa-list-check' },
  '办公效率': { key: 'productivity', icon: 'fa-list-check' },
  '效率': { key: 'productivity', icon: 'fa-list-check' },
  '办公': { key: 'productivity', icon: 'fa-list-check' },
  'Productivity': { key: 'productivity', icon: 'fa-list-check' },
  
  // 实用工具
  '工具': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  '实用工具': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  'Tiny Tools': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  '计算器': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  'Tool': { key: 'tool', icon: 'fa-screwdriver-wrench' },
  
  // 开发者工具
  '开发者工具': { key: 'devtool', icon: 'fa-code' },
  '开发': { key: 'devtool', icon: 'fa-code' },
  '编程': { key: 'devtool', icon: 'fa-code' },
  '代码': { key: 'devtool', icon: 'fa-code' },
  'DevTool': { key: 'devtool', icon: 'fa-code' },
  'Developer': { key: 'devtool', icon: 'fa-code' },
  
  // 影音娱乐
  '影音娱乐': { key: 'entertainment', icon: 'fa-film' },
  '娱乐': { key: 'entertainment', icon: 'fa-film' },
  '音乐': { key: 'entertainment', icon: 'fa-music' },
  '视频': { key: 'entertainment', icon: 'fa-video' },
  '影视': { key: 'entertainment', icon: 'fa-film' },
  'Entertainment': { key: 'entertainment', icon: 'fa-film' },
  
  // 教育学习
  '教育': { key: 'education', icon: 'fa-graduation-cap' },
  '教育学习': { key: 'education', icon: 'fa-graduation-cap' },
  '学习': { key: 'education', icon: 'fa-graduation-cap' },
  '知识': { key: 'education', icon: 'fa-graduation-cap' },
  'Education': { key: 'education', icon: 'fa-graduation-cap' },
  
  // 数据可视化
  '数据可视化': { key: 'visualization', icon: 'fa-chart-pie' },
  '图表': { key: 'visualization', icon: 'fa-chart-pie' },
  '数据': { key: 'visualization', icon: 'fa-chart-pie' },
  'Visualization': { key: 'visualization', icon: 'fa-chart-pie' },
  
  // 生活便利
  '生活': { key: 'lifestyle', icon: 'fa-mug-hot' },
  '生活便利': { key: 'lifestyle', icon: 'fa-mug-hot' },
  '日常': { key: 'lifestyle', icon: 'fa-mug-hot' },
  '健康': { key: 'lifestyle', icon: 'fa-heart-pulse' },
  'Lifestyle': { key: 'lifestyle', icon: 'fa-mug-hot' },
  
  'AI': { key: 'tool', icon: 'fa-robot' },
  'AI应用': { key: 'tool', icon: 'fa-robot' },
};

export const CATEGORY_LABELS: Record<string, { zh: string, en: string }> = {
  game: { zh: '休闲游戏', en: 'Games' },
  tool: { zh: '实用工具', en: 'Tools' },
  productivity: { zh: '办公效率', en: 'Productivity' },
  design: { zh: '创意设计', en: 'Design' },
  devtool: { zh: '开发者工具', en: 'DevTools' },
  entertainment: { zh: '影音娱乐', en: 'Entertainment' },
  education: { zh: '教育学习', en: 'Education' },
  visualization: { zh: '数据可视化', en: 'Visualization' },
  lifestyle: { zh: '生活便利', en: 'Lifestyle' },
};

export function getCategoryFromTags(tags: string[]): string {
  if (!tags || tags.length === 0) return 'tool'; // Default
  
  for (const tag of tags) {
    if (KNOWN_CATEGORIES[tag]) {
      return KNOWN_CATEGORIES[tag].key;
    }
  }
  
  return 'tool'; // Default fallback
}
