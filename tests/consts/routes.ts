export const Routes = {
  Attachments: '**/api/attachments',
  AttachmentById: '**/api/attachments/:id',
  AttachmentDownload: '**/api/attachments/:id/download',
  BurnIn: '**/api/burn-in/:attachmentId',
  Permissions: '**/api/permissions',
  PermissionById: '**/api/permissions/:id',
} as const;
