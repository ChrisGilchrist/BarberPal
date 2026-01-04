-- FIX RLS INFINITE RECURSION
-- The issue is that user policies reference the users table itself
-- causing infinite recursion when checking policies

-- Drop existing user policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can view same business users" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;

-- Simple policy: users can only see and manage their own profile
-- This avoids the recursion issue entirely
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- For viewing other users in same business, we'll use a function
-- that bypasses RLS to avoid recursion

CREATE OR REPLACE FUNCTION get_user_business_id(user_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT business_id FROM users WHERE id = user_id;
$$;

-- Now create policy for viewing same business users using the function
CREATE POLICY "Users can view same business users"
  ON users FOR SELECT
  USING (
    business_id IS NOT NULL
    AND business_id = get_user_business_id(auth.uid())
  );

-- Grant execute on the function
GRANT EXECUTE ON FUNCTION get_user_business_id(UUID) TO authenticated;

SELECT 'RLS recursion fix complete!' as status;
