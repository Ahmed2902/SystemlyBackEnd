export type RegisterBody = {
  name: string;
  email: string;
  password: string;
  phone: string;
};

export type LoginBody = {
  email: string;
  password: string;
};

export type VerifyEmailQuery = {
  token: string;
};

export type EmailBody = {
  email: string;
};

export type ResetPasswordBody = {
  token: string;
  password: string;
};

export type RefreshTokenBody = {
  refreshToken?: string;
};

export type RefreshTokenInput = {
  refreshToken: string;
};

export type GetMeInput = {
  userId: string;
};
