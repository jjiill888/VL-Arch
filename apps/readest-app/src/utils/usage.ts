// Usage stats disabled

export class UsageStatsManager {
  static async incrementUsage() {
    console.log('Usage stats disabled');
  }

  static async getUsage() {
    return 0;
  }

  static async getCurrentUsage(userId?: string, type?: string, period?: string) {
    console.log('Usage stats disabled, ignoring params:', userId, type, period);
    return 0;
  }

  static async updateUsage(userId?: string, type?: string, amount?: number) {
    console.log('Usage stats disabled, ignoring params:', userId, type, amount);
  }

  static async trackUsage(userId?: string, type?: string, amount?: number, metadata?: unknown) {
    console.log('Usage stats disabled, ignoring params:', userId, type, amount, metadata);
    return 0;
  }
}