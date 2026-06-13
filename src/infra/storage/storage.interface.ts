export interface UploadOptions {
  folder?: string;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  publicId?: string;
}

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
}

export interface SignedUploadOptions {
  publicId: string;
  resourceType: 'video' | 'raw' | 'image';
  maxFileSize: number;
}

export interface SignedUploadResult {
  uploadUrl: string;
  publicId: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  resourceType: 'video' | 'raw' | 'image';
}

export interface CompletedUploadData {
  publicId: string;
  version: number;
  signature: string;
  secureUrl: string;
}

export interface IStorageAdapter {
  /**
   * Upload a local file to the storage backend.
   * @param filePath Absolute path to the local file.
   * @param options  Optional folder, resource type, public-id overrides.
   * @returns        The stored public-id and CDN URLs.
   */
  upload(filePath: string, options?: UploadOptions): Promise<UploadResult>;

  /**
   * Create signed direct-upload parameters for browser-to-cloud uploads.
   * The caller controls the public-id so completion can be validated later.
   */
  createSignedUpload(options: SignedUploadOptions): Promise<SignedUploadResult>;

  /**
   * Verify that a direct-upload completion payload was signed by the storage
   * provider before trusting its public-id and secure URL.
   */
  verifyUploadResult(data: CompletedUploadData): Promise<boolean>;

  /**
   * Permanently remove an asset from the storage backend.
   * @param publicId    The asset's public-id returned by upload().
   * @param resourceType The resource type used during upload (default: 'video').
   */
  delete(
    publicId: string,
    resourceType?: 'image' | 'video' | 'raw',
  ): Promise<void>;

  /**
   * Download a remote asset to a local temporary path (used by the worker
   * before passing the file to FFmpeg).
   * @param url      The secure URL of the asset.
   * @param destPath Absolute local path to write the file to.
   */
  downloadToTemp(url: string, destPath: string): Promise<void>;
}
