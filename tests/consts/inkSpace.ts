export const TEST_IDS = {
  // ── Viewer (PRD V1–V8) ────────────────────────────────────────────────────
  PDF_VIEWER: 'pdf-viewer',
  LOADING_INDICATOR: 'pdf-loading-indicator',
  THUMBNAILS_PANEL: 'thumbnails-panel',
  THUMBNAIL_ITEM: 'thumbnail-item',
  PAGE_NAVIGATOR: 'page-navigator',
  CURRENT_PAGE_INPUT: 'current-page-input',
  PREV_PAGE_BUTTON: 'prev-page-button',
  NEXT_PAGE_BUTTON: 'next-page-button',
  ZOOM_IN_BUTTON: 'zoom-in-button',
  ZOOM_OUT_BUTTON: 'zoom-out-button',
  FIT_WIDTH_BUTTON: 'fit-width-button',

  // ── Annotation toolbar (PRD A1) ───────────────────────────────────────────
  ANNOTATION_TOOLBAR: 'annotation-toolbar',
  TOOL_PEN: 'tool-pen',
  TOOL_FREEFORM_HIGHLIGHTER: 'tool-freeform-highlighter',
  TOOL_TEXT: 'tool-text',
  TOOL_TEXT_HIGHLIGHTER: 'tool-text-highlighter',
  TOOL_ELLIPSE: 'tool-ellipse',
  TOOL_RECTANGLE: 'tool-rectangle',
  TOOL_LINE: 'tool-line',
  TOOL_ARROW: 'tool-arrow',
  TOOL_CLOUD: 'tool-cloud',
  TOOL_POLYGON: 'tool-polygon',
  TOOL_SIGNATURE: 'tool-signature',
  STYLE_COLOR_PICKER: 'style-color-picker',
  STYLE_FILL_PICKER: 'style-fill-picker',
  STYLE_WIDTH_PICKER: 'style-width-picker',

  // ── Download & Save (PRD D1–D3, S1–S8, F1–F6) ────────────────────────────
  DOWNLOAD_BUTTON: 'download-button',
  SAVE_BUTTON: 'save-button',
  SAVE_MODAL: 'save-modal',
  SAVE_MODAL_FILENAME_INPUT: 'save-modal-filename-input',
  SAVE_MODAL_CONFIRM_BUTTON: 'save-modal-confirm-button',
  SAVE_MODAL_CANCEL_BUTTON: 'save-modal-cancel-button',
  SAVE_MODAL_CLOSE_BUTTON: 'save-modal-close-button',
  SAVE_PROGRESS_INDICATOR: 'save-progress-indicator',
  SUCCESS_TOAST: 'success-toast',
  ERROR_TOAST: 'error-toast',
  FILENAME_VALIDATION_ERROR: 'filename-validation-error',

  // ── Delete confirmation modal (PRD A6) ────────────────────────────────────
  DELETE_CONFIRM_MODAL: 'delete-confirm-modal',
  DELETE_CONFIRM_TITLE: 'delete-confirm-title',
  DELETE_CONFIRM_MESSAGE: 'delete-confirm-message',
  DELETE_CONFIRM_BUTTON: 'delete-confirm-button',
  DELETE_CANCEL_BUTTON: 'delete-cancel-button',

  // ── Permissions & sharing (PRD P1–P5) ────────────────────────────────────
  SHARE_BUTTON: 'share-button',
  SHARE_MODAL: 'share-modal',
  SHARE_EMAIL_INPUT: 'share-email-input',
  SHARE_ROLE_SELECT: 'share-role-select',
  SHARE_CONFIRM_BUTTON: 'share-confirm-button',
  EMPTY_STATE: 'empty-state',
  NOTES_BUTTON: 'notes-button',
} as const;

export const TEXT_CONTENT = {
  DELETE_MODAL_TITLE: 'Delete annotation?',
  DELETE_MODAL_MESSAGE: 'Are you sure you want to delete this annotation?',
  VALIDATION_REQUIRED: 'Required field',
  VALIDATION_MAX_LENGTH: '255 characters maximum',
  VALIDATION_INVALID_CHARS: 'Invalid characters',
} as const;

/**
 * Use these constants for all attachment record field name references in tests.
 * Never use raw strings like 'attachmentId' — always reference ITEM_FIELD_NAMES.ATTACHMENT_ID.
 * Do NOT import ItemFieldNames from src/consts — that file pulls in browser-only dependencies
 * that break the Playwright Node.js runner.
 */
export const ITEM_FIELD_NAMES = {
  ATTACHMENT_ID: 'attachmentId',
  FILENAME: 'filename',
  ORIGINAL_FILENAME: 'originalFilename',
  STORAGE_PATH: 'storagePath',
  OWNER: 'owner',
  MIME_TYPE: 'mimeType',
  WORKSPACE_ID: 'workspaceId',
  ROLE: 'role',
  GRANTEE_EMAIL: 'granteeEmail',
  GRANTED_BY: 'grantedBy',
  GRANTED_AT: 'grantedAt',
} as const;

export type ItemFieldNames = typeof ITEM_FIELD_NAMES;
