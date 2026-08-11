import type { SubscriptionAccessSnapshot } from "../modules/subscriptions/subscription-access.service";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user: {
        id: string;
        businessId?: string;
        branchId?: string;
        requestedBranchId?: string;
        role?: string;
        email?: string;
      };
      subscriptionAccess?: SubscriptionAccessSnapshot;
    }
  }
}

export {};
