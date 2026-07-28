declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user: {
        id: string;
        businessId?: string;
        role?: string;
        email?: string;
      };
    }
  }
}

export {};
