// User Roles
export type UserRole = 'owner' | 'staff' | 'client';

// Appointment Status
export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

// Day of Week (0 = Sunday, 6 = Saturday)
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Business
export interface Business {
  id: string;
  name: string;
  address: string;
  phone: string;
  logo_url: string | null;
  buffer_minutes: number;
  created_at: string;
}

// User Profile
export interface UserProfile {
  id: string;
  business_id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  favorite_staff_id: string | null;
  notes: string | null;
  created_at: string;
}

// Alias for User (same as UserProfile)
export type User = UserProfile;

// Service
export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  created_at: string;
}

// Staff Service (junction)
export interface StaffService {
  staff_id: string;
  service_id: string;
}

// Working Hours
export interface WorkingHours {
  id: string;
  user_id: string;
  day_of_week: DayOfWeek;
  start_time: string; // HH:mm format
  end_time: string;   // HH:mm format
  is_active: boolean;
}

// Time Block (holidays, breaks, time off)
export interface TimeBlock {
  id: string;
  user_id: string | null;
  business_id: string | null;
  start_datetime: string;
  end_datetime: string;
  reason: string | null;
  created_at: string;
}

// Appointment
export interface Appointment {
  id: string;
  business_id: string;
  client_id: string;
  staff_id: string;
  service_id: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data (optional)
  client?: UserProfile;
  staff?: UserProfile;
  service?: Service;
}

// Push Subscription
export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

// Time Slot (for booking UI)
export interface TimeSlot {
  time: string; // HH:mm format
  available: boolean;
  staffId?: string;
}

// Auth State
export interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// API Response
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}
