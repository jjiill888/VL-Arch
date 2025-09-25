import { QuotaType, UserPlan } from '@/types/user';

export const useQuotaStats = (briefName?: boolean) => {
  // Auth disabled - return empty quotas
  console.log('Auth disabled, ignoring briefName:', briefName);
  const quotas: QuotaType[] = [];
  const userPlan: UserPlan | undefined = undefined;

  return { quotas, userPlan };
};