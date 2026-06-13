import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import {
  CompletedUploadData,
  IStorageAdapter,
  SignedUploadOptions,
  SignedUploadResult,
  UploadOptions,
  UploadResult,
} from './storage.interface';

@Injectable()
export class CloudinaryStorageAdapter implements IStorageAdapter, OnModuleInit {
  private readonly logger = new Logger(CloudinaryStorageAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    cloudinary.config({
      cloud_name: this.configService.getOrThrow<string>(
        'CLOUDINARY_CLOUD_NAME',
      ),
      api_key: this.configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.getOrThrow<string>(
        'CLOUDINARY_API_SECRET',
      ),
      secure: true,
    });
    this.logger.log('Cloudinary configured');
  }

  async upload(
    filePath: string,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    this.logger.log(`Uploading ${filePath} to Cloudinary`);

    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: options.resourceType ?? 'auto',
      folder: options.folder,
      public_id: options.publicId,
    });

    return {
      publicId: result.public_id,
      url: result.url,
      secureUrl: result.secure_url,
    };
  }

  createSignedUpload(
    options: SignedUploadOptions,
  ): Promise<SignedUploadResult> {
    const cloudName = this.configService.getOrThrow<string>(
      'CLOUDINARY_CLOUD_NAME',
    );
    const apiKey = this.configService.getOrThrow<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.getOrThrow<string>(
      'CLOUDINARY_API_SECRET',
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      public_id: options.publicId,
      timestamp,
      overwrite: false,
    };

    const signature = cloudinary.utils.api_sign_request(params, apiSecret);

    return Promise.resolve({
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${options.resourceType}/upload`,
      publicId: options.publicId,
      apiKey,
      timestamp,
      signature,
      resourceType: options.resourceType,
    });
  }

  verifyUploadResult(data: CompletedUploadData): Promise<boolean> {
    const apiSecret = this.configService.getOrThrow<string>(
      'CLOUDINARY_API_SECRET',
    );
    const expectedSignature = cloudinary.utils.api_sign_request(
      {
        public_id: data.publicId,
        version: data.version,
      },
      apiSecret,
    );

    return Promise.resolve(expectedSignature === data.signature);
  }

  async delete(
    publicId: string,
    resourceType: 'image' | 'video' | 'raw' = 'video',
  ): Promise<void> {
    this.logger.log(`Deleting ${publicId} from Cloudinary`);

    const result = (await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    })) as { result: string };

    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(
        `Cloudinary delete failed for public_id "${publicId}": ${result.result}`,
      );
    }
  }

  async downloadToTemp(url: string, destPath: string): Promise<void> {
    this.logger.log(`Downloading ${url} to ${destPath}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to download "${url}": ${response.status} ${response.statusText}`,
      );
    }

    const dir = destPath.substring(0, destPath.lastIndexOf('/'));
    if (dir) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    const body = response.body;
    if (!body) {
      throw new Error(`Response body is empty for URL: ${url}`);
    }

    await pipeline(
      Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(destPath),
    );
    this.logger.log(`Downloaded to ${destPath}`);
  }
}
