export const Routes = {
  Attachments: '**/api/attachments',
  AttachmentById: '**/api/attachments/:id',
  BurnIn: '**/api/burn-in/:attachmentId',
  LoginAttempt: '**/api/auth/login-attempt',
} as const;
