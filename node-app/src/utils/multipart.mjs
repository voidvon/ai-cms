import path from 'node:path';

export async function readMultipartBody(request, options = {}) {
  const contentType = request.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error('multipart boundary is required');
  }

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const chunks = [];
  let totalSize = 0;
  const maxBytes = options.maxBytes || 1024 * 1024;

  for await (const chunk of request) {
    totalSize += chunk.length;
    if (totalSize > maxBytes) {
      throw new Error('uploaded file exceeds size limit');
    }
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const delimiter = Buffer.from(`--${boundary}`);
  const endDelimiter = Buffer.from(`--${boundary}--`);
  const parts = [];

  let start = buffer.indexOf(delimiter);
  if (start === -1) {
    throw new Error('invalid multipart payload');
  }
  start += delimiter.length + 2;

  while (start < buffer.length) {
    let nextBoundary = buffer.indexOf(delimiter, start);
    let closingBoundary = buffer.indexOf(endDelimiter, start);

    if (closingBoundary !== -1 && (nextBoundary === -1 || closingBoundary < nextBoundary)) {
      nextBoundary = closingBoundary;
    }

    if (nextBoundary === -1) {
      break;
    }

    let partBuffer = buffer.subarray(start, nextBoundary - 2);
    if (partBuffer.length > 0) {
      parts.push(parsePart(partBuffer));
    }

    start = nextBoundary + delimiter.length + 2;
    if (buffer.subarray(nextBoundary, nextBoundary + endDelimiter.length).equals(endDelimiter)) {
      break;
    }
  }

  const fields = {};
  const files = [];

  for (const part of parts) {
    if (!part.name) {
      continue;
    }
    if (part.filename) {
      files.push({
        fieldName: part.name,
        filename: part.filename,
        extension: path.extname(part.filename).toLowerCase(),
        contentType: part.contentType,
        data: part.data
      });
    } else {
      fields[part.name] = part.data.toString('utf8');
    }
  }

  return { fields, files };
}

function parsePart(partBuffer) {
  const separator = Buffer.from('\r\n\r\n');
  const headerEnd = partBuffer.indexOf(separator);
  if (headerEnd === -1) {
    throw new Error('invalid multipart part');
  }

  const rawHeaders = partBuffer.subarray(0, headerEnd).toString('utf8');
  const data = partBuffer.subarray(headerEnd + separator.length);
  const headers = Object.create(null);

  for (const line of rawHeaders.split('\r\n')) {
    const index = line.indexOf(':');
    if (index === -1) {
      continue;
    }
    const name = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    headers[name] = value;
  }

  const disposition = headers['content-disposition'] || '';
  const nameMatch = disposition.match(/name="([^"]+)"/i);
  const fileMatch = disposition.match(/filename="([^"]*)"/i);

  return {
    name: nameMatch ? nameMatch[1] : null,
    filename: fileMatch ? fileMatch[1] : null,
    contentType: headers['content-type'] || 'application/octet-stream',
    data
  };
}
