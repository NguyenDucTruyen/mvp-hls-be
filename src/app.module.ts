import { Module } from '@nestjs/common';
import { UserModule } from './modules/users/modules/user.module';
import { SystemModule } from './modules/system/modules/system.module';
import { StorageModule } from './infra/storage/storage.module';
import { QueueModule } from './infra/queue/queue.module';

@Module({
  imports: [SystemModule, StorageModule, QueueModule, UserModule],
  controllers: [],
})
export class AppModule {}
