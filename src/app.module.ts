import { Module } from '@nestjs/common';
import { UserModule } from './modules/users/modules/user.module';
import { SystemModule } from './modules/system/modules/system.module';

@Module({
  imports: [SystemModule, UserModule],
  controllers: [],
})
export class AppModule {}
