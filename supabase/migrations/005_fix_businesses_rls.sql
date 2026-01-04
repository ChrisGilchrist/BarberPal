-- FIX BUSINESSES RLS POLICIES
-- Ensure businesses table has proper INSERT policy

-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Users can view their business" ON businesses;
DROP POLICY IF EXISTS "Owners can update their business" ON businesses;
DROP POLICY IF EXISTS "Anyone can create a business" ON businesses;

-- Allow anyone authenticated to create a business
CREATE POLICY "Anyone can create a business"
  ON businesses FOR INSERT
  WITH CHECK (true);

-- Use security definer function to avoid recursion when checking business ownership
CREATE OR REPLACE FUNCTION get_user_business_id_safe(user_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT business_id FROM users WHERE id = user_id;
$$;

CREATE OR REPLACE FUNCTION is_user_business_owner(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = user_id AND role = 'owner'
  );
$$;

-- Users can view their own business (using function to avoid recursion)
CREATE POLICY "Users can view their business"
  ON businesses FOR SELECT
  USING (
    id = get_user_business_id_safe(auth.uid())
  );

-- Owners can update their business
CREATE POLICY "Owners can update their business"
  ON businesses FOR UPDATE
  USING (
    id = get_user_business_id_safe(auth.uid())
    AND is_user_business_owner(auth.uid())
  );

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_business_id_safe(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_business_owner(UUID) TO authenticated;

SELECT 'Businesses RLS fix complete!' as status;
