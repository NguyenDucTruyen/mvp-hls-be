import { Module } from '@nestjs/common';
import { UserModule } from './modules/users/modules/user.module';
import { SystemModule } from './modules/system/modules/system.module';
import { StorageModule } from './infra/storage/storage.module';

@Module({
  imports: [SystemModule, StorageModule, UserModule],
  controllers: [],
})
export class AppModule {}
