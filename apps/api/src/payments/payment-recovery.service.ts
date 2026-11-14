import {Injectable,Logger,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {CashfreeOrdersService} from './cashfree-orders.service';

@Injectable()
export class PaymentRecoveryService implements OnModuleInit,OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running=false;
  private readonly logger=new Logger(PaymentRecoveryService.name);
  constructor(private readonly orders:CashfreeOrdersService) {}
  onModuleInit() {
    this.timer=setInterval(()=>void this.run(),60_000);
    this.timer.unref();
    void this.run();
  }
  onModuleDestroy() { if(this.timer) clearInterval(this.timer); }
  private async run() {
    if(this.running) return;
    this.running=true;
    try {
      const result=await this.orders.recoverPending();
      if(result.checked) this.logger.log(JSON.stringify({event:'payment_recovery',...result}));
    } catch { this.logger.warn('Payment recovery unavailable; will retry.'); }
    finally { this.running=false; }
  }
}
