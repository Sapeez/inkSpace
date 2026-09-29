export const TEST_IDS = {
  // ── Auth (accounts-workspace PRD SU/LG, task 1.0) ────────────────────────
  SIGNUP_FORM: 'signup-form',
  SIGNUP_EMAIL_INPUT: 'signup-email-input',
  SIGNUP_PASSWORD_INPUT: 'signup-password-input',
  SIGNUP_SUBMIT_BUTTON: 'signup-submit-button',
  SIGNUP_ERROR: 'signup-error',
  SIGNUP_INFO: 'signup-info',
  SIGNUP_LOGIN_LINK: 'signup-login-link',
  LOGIN_FORM: 'login-form',
  LOGIN_EMAIL_INPUT: 'login-email-input',
  LOGIN_PASSWORD_INPUT: 'login-password-input',
  LOGIN_SUBMIT_BUTTON: 'login-submit-button',
  LOGIN_ERROR: 'login-error',
  LOGIN_SIGNUP_LINK: 'login-signup-link',
  LOGIN_FORGOT_PASSWORD_LINK: 'login-forgot-password-link',
  LOGOUT_BUTTON: 'logout-button',
  WORKSPACE_USER_EMAIL: 'workspace-user-email',

  // ── Password reset & email verification (accounts-workspace PRD PR/EV, task 2.0) ─
  FORGOT_PASSWORD_FORM: 'forgot-password-form',
  FORGOT_PASSWORD_EMAIL_INPUT: 'forgot-password-email-input',
  FORGOT_PASSWORD_SUBMIT_BUTTON: 'forgot-password-submit-button',
  FORGOT_PASSWORD_ERROR: 'forgot-password-error',
  FORGOT_PASSWORD_INFO: 'forgot-password-info',
  FORGOT_PASSWORD_LOGIN_LINK: 'forgot-password-login-link',
  FORGOT_PASSWORD_BACK_LINK: 'forgot-password-back-link',
  RESET_PASSWORD_FORM: 'reset-password-form',
  RESET_PASSWORD_PASSWORD_INPUT: 'reset-password-password-input',
  RESET_PASSWORD_CONFIRM_INPUT: 'reset-password-confirm-input',
  RESET_PASSWORD_SUBMIT_BUTTON: 'reset-password-submit-button',
  RESET_PASSWORD_ERROR: 'reset-password-error',
  RESET_PASSWORD_SUCCESS: 'reset-password-success',
  RESET_PASSWORD_LOGIN_LINK: 'reset-password-login-link',
  RESET_PASSWORD_LINK_ERROR: 'reset-password-link-error',
  RESET_PASSWORD_RETRY_LINK: 'reset-password-retry-link',
  VERIFY_EMAIL_SUCCESS: 'verify-email-success',
  VERIFY_EMAIL_WORKSPACE_LINK: 'verify-email-workspace-link',
  VERIFY_EMAIL_LINK_ERROR: 'verify-email-link-error',
  VERIFY_EMAIL_RESEND_FORM: 'verify-email-resend-form',
  VERIFY_EMAIL_EMAIL_INPUT: 'verify-email-email-input',
  VERIFY_EMAIL_ERROR: 'verify-email-error',
  VERIFY_EMAIL_RESEND_BUTTON: 'verify-email-resend-button',
  VERIFY_EMAIL_RESENT: 'verify-email-resent',

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
  TOOLBAR: 'toolbar',
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
  SAVE_MODAL_SIZE_ERROR: 'save-modal-size-error',

  // ── Delete confirmation modal (PRD A6) ────────────────────────────────────
  DELETE_CONFIRM_MODAL: 'delete-confirm-modal',
  DELETE_CONFIRM_TITLE: 'delete-confirm-title',
  DELETE_CONFIRM_MESSAGE: 'delete-confirm-message',
  DELETE_CONFIRM_BUTTON: 'delete-confirm-button',
  DELETE_CANCEL_BUTTON: 'delete-cancel-button',

  // ── Permissions & sharing (PRD P1–P5) ────────────────────────────────────
  SHARE_BUTTON: 'share-button',
  SHARE_MODAL: 'share-modal',
  SHARE_MODAL_CLOSE_BUTTON: 'share-modal-close-button',
  SHARE_EMAIL_INPUT: 'share-email-input',
  SHARE_ROLE_SELECT: 'share-role-select',
  SHARE_CONFIRM_BUTTON: 'share-confirm-button',
  SHARE_FORM_ERROR: 'share-form-error',
  SHARE_LIST: 'share-list',
  SHARE_LIST_ITEM: 'share-list-item',
  SHARE_LIST_ERROR: 'share-list-error',
  SHARE_REVOKE_BUTTON: 'share-revoke-button',
  EMPTY_STATE: 'empty-state',
  NOTES_BUTTON: 'notes-button',
  NOTES_PANEL: 'notes-panel',
  NOTES_PANEL_INPUT: 'notes-panel-input',
  NOTES_PANEL_ADD_BUTTON: 'notes-panel-add-button',
  NOTES_PANEL_ITEM: 'notes-panel-item',
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
