export const Routes = {
  Attachments: '**/api/attachments',
  AttachmentById: '**/api/attachments/:id',
  BurnIn: '**/api/burn-in/:attachmentId',
  Shares: '**/api/attachments/:attachmentId/shares',
  ShareById: '**/api/attachments/:attachmentId/shares/:shareId',
} as const;
