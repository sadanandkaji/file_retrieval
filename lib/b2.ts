import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Backblaze B2 exposes an S3-compatible API. We talk to it with the
// standard AWS SDK, just pointed at B2's endpoint instead of AWS.
const b2Client = new S3Client({
  region: process.env.B2_REGION, // e.g. "us-west-004"
  endpoint: process.env.B2_ENDPOINT, // e.g. "https://s3.us-west-004.backblazeb2.com"
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
  forcePathStyle: true, // required for B2's S3-compatible endpoint
});

const BUCKET = process.env.B2_BUCKET_NAME!;

function sanitizeKey(filename: string) {
  // Your B2 application key is restricted to file names starting with
  // "bucket" (its configured namePrefix) — keep this prefix or uploads
  // will fail with AccessDenied: not entitled.
  return `bucket/policy-pdfs/${Date.now()}-${filename.replace(/\s+/g, "_")}`;
}

export async function uploadPdfToB2(buffer: Buffer, filename: string) {
  const key = sanitizeKey(filename);

  await b2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
    })
  );

  // Bucket is private, so this URL isn't directly browsable — it's stored
  // only as a reference. Use getB2DownloadUrl(key) to get a working,
  // time-limited link whenever someone actually needs to open the file.
  const url = `${process.env.B2_ENDPOINT}/${BUCKET}/${key}`;

  return { url, key };
}

export async function getB2DownloadUrl(key: string, filename?: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ...(filename
      ? { ResponseContentDisposition: `inline; filename="${filename}"` }
      : {}),
  });

  // Valid for 5 minutes — plenty of time to open/download, short enough
  // that a leaked link isn't useful for long.
  return getSignedUrl(b2Client, command, { expiresIn: 300 });
}

export async function deleteFromB2(key: string) {
  await b2Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}