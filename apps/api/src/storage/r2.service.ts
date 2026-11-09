import { BadRequestException, Injectable, PayloadTooLargeException, ServiceUnavailableException, UnsupportedMediaTypeException } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['application/pdf', 'pdf']
]);
const MAX_SIGNED_URL_SECONDS = 300;

function matchesFileSignature(contentType: string, body: Buffer) {
  switch (contentType) {
    case 'image/jpeg':
      return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
    case 'image/png':
      return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return body.length >= 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP';
    case 'application/pdf':
      return body.length >= 5 && body.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return false;
  }
}

@Injectable()
export class R2Service {
  private readonly storageClient?: S3Client;
  private readonly bucket: string;

  constructor() {
    const accountId = (process.env.R2_ACCOUNT_ID ?? '').trim();
    const accessKeyId = (process.env.R2_ACCESS_KEY_ID ?? '').trim();
    const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY ?? '').trim();
    this.bucket = (process.env.R2_BUCKET_NAME ?? '').trim();
    if (process.env.FILE_STORAGE_ENABLED === 'false') return;
    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucket) {
      throw new Error('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are required');
    }
    this.storageClient = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    });
  }

  private get client(): S3Client {
    if (!this.storageClient) throw new ServiceUnavailableException('File storage is not configured');
    return this.storageClient;
  }

  async uploadBusinessFile(businessId: string, contentType: string, body: Buffer) {
    const extension = ALLOWED_TYPES.get(contentType.toLowerCase().split(';')[0].trim());
    if (!extension) throw new UnsupportedMediaTypeException('File type is not supported');
    if (!Buffer.isBuffer(body) || body.length === 0) throw new UnsupportedMediaTypeException('File is empty or invalid');
    if (body.length > MAX_FILE_BYTES) throw new PayloadTooLargeException('Files must be 10 MB or smaller');
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) throw new BadRequestException('Invalid business identifier');
    const normalizedType = contentType.toLowerCase().split(';')[0].trim();
    if (!matchesFileSignature(normalizedType, body)) {
      throw new UnsupportedMediaTypeException('File contents do not match the declared file type');
    }

    const key = `${businessId}/${randomUUID()}.${extension}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: normalizedType,
      Metadata: { businessid: businessId }
    }));
    return { key, size: body.length, contentType: normalizedType };
  }

  async createDownloadUrl(businessId: string, key: string, expiresInSeconds = 180) {
    this.assertBusinessKey(businessId, key);
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_SIGNED_URL_SECONDS) {
      throw new ServiceUnavailableException('Download link expiry must be between 1 and 300 seconds');
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds }
    );
  }

  async deleteBusinessFile(businessId: string, key: string) {
    this.assertBusinessKey(businessId, key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private assertBusinessKey(businessId: string, key: string) {
    if (!/^[0-9a-f-]{36}$/i.test(businessId) || !key.startsWith(`${businessId}/`) || key.includes('..')) {
      throw new BadRequestException('File does not belong to this business');
    }
  }
}
