import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudinaryStorageAdapter } from './cloudinary.storage';
import { STORAGE_ADAPTER } from './storage.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_ADAPTER,
      useClass: CloudinaryStorageAdapter,
    },
  ],
  exports: [STORAGE_ADAPTER],
})
export class StorageModule {}
