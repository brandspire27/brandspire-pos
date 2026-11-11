import { BadGatewayException } from '@nestjs/common';

// Only developer-authored, sanitized messages belong here; never provider bodies.
export class AiProviderException extends BadGatewayException {}
