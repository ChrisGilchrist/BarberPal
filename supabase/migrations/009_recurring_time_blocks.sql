-- Recurring Time Blocks (weekly repeating blocks like lunch breaks)
CREATE TABLE recurring_time_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_recurring_time_blocks_user_id ON recurring_time_blocks(user_id);
CREATE INDEX idx_recurring_time_blocks_day ON recurring_time_blocks(day_of_week);

-- Enable RLS
ALTER TABLE recurring_time_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view recurring time blocks"
  ON recurring_time_blocks FOR SELECT
  USING (true);

CREATE POLICY "Staff can manage their own recurring time blocks"
  ON recurring_time_blocks FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Owners can manage all recurring time blocks"
  ON recurring_time_blocks FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM users
      WHERE id = auth.uid() AND role = 'owner'
    )
    OR
    user_id IN (
      SELECT id FROM users
      WHERE business_id IN (
        SELECT business_id FROM users
        WHERE id = auth.uid() AND role = 'owner'
      )
    )
  );
