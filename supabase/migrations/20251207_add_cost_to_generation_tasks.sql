-- 为 generation_tasks 表添加 cost 字段
-- 用于记录每次生成消耗的积分，方便退款时查询

ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS cost INTEGER DEFAULT 0;

-- 添加索引以加速按用户查询带cost的任务
CREATE INDEX IF NOT EXISTS idx_generation_tasks_user_cost ON generation_tasks(user_id, cost) WHERE cost > 0;

COMMENT ON COLUMN generation_tasks.cost IS 'Credits consumed for this generation task';
