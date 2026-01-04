-- COMPLETE DATABASE RESET AND RECREATION
-- This script drops everything and recreates it with proper setup
-- Run this in your Supabase SQL Editor

-- ============================================
-- PART 1: DROP EVERYTHING
-- ============================================

-- Drop triggers first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;

-- Drop functions
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop all tables (CASCADE drops dependent policies)
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS time_blocks CASCADE;
DROP TABLE IF EXISTS working_hours CASCADE;
DROP TABLE IF EXISTS staff_services CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS businesses CASCADE;

-- Delete all auth users
DELETE FROM auth.users;

-- ============================================
-- PART 2: CREATE TABLES
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Businesses table
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  logo_url TEXT,
  buffer_minutes INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'staff', 'client')) DEFAULT 'client',
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  avatar_url TEXT,
  favorite_staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Services table
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Staff-Services junction table
CREATE TABLE staff_services (
  staff_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

-- Working Hours table
CREATE TABLE working_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  is_active BOOLEAN DEFAULT true,
  UNIQUE (user_id, day_of_week)
);

-- Time Blocks (holidays, breaks, time off)
CREATE TABLE time_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Appointments table
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Push Subscriptions table
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ============================================
-- PART 3: CREATE INDEXES
-- ============================================

CREATE INDEX idx_users_business_id ON users(business_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_services_business_id ON services(business_id);
CREATE INDEX idx_services_is_active ON services(is_active);
CREATE INDEX idx_working_hours_user_id ON working_hours(user_id);
CREATE INDEX idx_appointments_business_id ON appointments(business_id);
CREATE INDEX idx_appointments_client_id ON appointments(client_id);
CREATE INDEX idx_appointments_staff_id ON appointments(staff_id);
CREATE INDEX idx_appointments_start_time ON appointments(start_time);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_time_blocks_user_id ON time_blocks(user_id);

-- ============================================
-- PART 4: ENABLE RLS
-- ============================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 5: CREATE RLS POLICIES
-- ============================================

-- Users policies
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view same business users"
  ON users FOR SELECT
  USING (
    business_id IS NOT NULL AND
    business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Businesses policies
CREATE POLICY "Users can view their business"
  ON businesses FOR SELECT
  USING (
    id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Owners can update their business"
  ON businesses FOR UPDATE
  USING (
    id IN (
      SELECT business_id FROM users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "Anyone can create a business"
  ON businesses FOR INSERT
  WITH CHECK (true);

-- Services policies
CREATE POLICY "Anyone can view active services"
  ON services FOR SELECT
  USING (is_active = true);

CREATE POLICY "Owners can manage services"
  ON services FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- Working hours policies
CREATE POLICY "Anyone can view working hours"
  ON working_hours FOR SELECT
  USING (true);

CREATE POLICY "Staff can manage their own hours"
  ON working_hours FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Owners can manage all staff hours"
  ON working_hours FOR ALL
  USING (
    user_id IN (
      SELECT id FROM users
      WHERE business_id IN (
        SELECT business_id FROM users
        WHERE id = auth.uid() AND role = 'owner'
      )
    )
  );

-- Appointments policies
CREATE POLICY "Clients can view their own appointments"
  ON appointments FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "Staff can view appointments assigned to them"
  ON appointments FOR SELECT
  USING (staff_id = auth.uid());

CREATE POLICY "Owners can view all business appointments"
  ON appointments FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "Clients can create appointments"
  ON appointments FOR INSERT
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "Staff can update their appointments"
  ON appointments FOR UPDATE
  USING (staff_id = auth.uid());

CREATE POLICY "Owners can manage all appointments"
  ON appointments FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- Push subscriptions policies
CREATE POLICY "Users can manage their own subscriptions"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());

-- Time blocks policies
CREATE POLICY "Anyone can view time blocks"
  ON time_blocks FOR SELECT
  USING (true);

CREATE POLICY "Staff can manage their own time blocks"
  ON time_blocks FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Owners can manage all time blocks"
  ON time_blocks FOR ALL
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

-- Staff services policies
CREATE POLICY "Anyone can view staff services"
  ON staff_services FOR SELECT
  USING (true);

CREATE POLICY "Owners can manage staff services"
  ON staff_services FOR ALL
  USING (
    staff_id IN (
      SELECT id FROM users
      WHERE business_id IN (
        SELECT business_id FROM users
        WHERE id = auth.uid() AND role = 'owner'
      )
    )
  );

-- ============================================
-- PART 6: CREATE TRIGGER FUNCTION
-- ============================================

-- Function to automatically create user profile after signup
-- Uses SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, first_name, last_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log error but don't fail the auth signup
    RAISE WARNING 'Failed to create user profile: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- PART 7: UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DONE!
-- ============================================
SELECT 'Database reset and recreation complete!' as status;
