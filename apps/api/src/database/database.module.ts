import { Global, Module } from '@nestjs/common';
import { TursoService } from './turso.service';

@Global()
@Module({
  providers: [TursoService],
  exports: [TursoService]
})
export class DatabaseModule {}
