// Authentication and access control disabled

export const getUserID = async (): Promise<string | null> => {
  return null;
};

export const getUserPlan = (token?: string | null): 'free' | 'plus' | 'pro' => {
  console.log('Auth disabled, ignoring token:', token);
  return 'free';
};

export const canAccessFeature = (feature?: string | null): boolean => {
  console.log('Auth disabled, all features available:', feature);
  return true; // All features available in offline mode
};

export const getAccessToken = (): string | null => {
  return null;
};

export const getStoragePlanData = (token?: string | null) => {
  console.log('Auth disabled, ignoring token:', token);
  return {
    usage: 0,
    quota: 1000000000, // 1GB
    unlimited: true,
  };
};

export const getTranslationPlanData = (token?: string | null) => {
  console.log('Auth disabled, ignoring token:', token);
  return {
    usage: 0,
    quota: 1000,
    unlimited: true,
  };
};

export const validateUserAndToken = async (authHeader?: string | null) => {
  // Authentication disabled - return dummy user/token
  console.log('Auth disabled, ignoring header:', authHeader);
  return {
    user: { id: 'dummy-user' },
    token: 'dummy-token'
  };
};

export const createSupabaseAdminClient = () => {
  // Supabase disabled
  return null;
};

export const getDailyTranslationPlanData = (token?: string | null) => {
  console.log('Auth disabled, ignoring token:', token);
  return {
    usage: 0,
    quota: 1000,
    unlimited: true,
  };
};