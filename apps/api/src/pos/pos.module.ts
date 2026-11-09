import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { PosAuthGuard } from './pos-auth.guard';
import { PosAssistService } from './pos-assist.service';

@Module({
  controllers: [PosController],
  providers: [PosAuthGuard, PosService, PosAssistService]
})
export class PosModule {}
