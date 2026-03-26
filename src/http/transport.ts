import { gzipSync } from 'node:zlib';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type TransportOptions = {
  responseCompressionThresholdBytes: number;
};

function shouldCompress(request: FastifyRequest, reply: FastifyReply, thresholdBytes: number) {
  const acceptEncoding = request.headers['accept-encoding'];
  const contentType = reply.getHeader('content-type');
  const contentLength = Number(reply.getHeader('content-length'));

  return typeof acceptEncoding === 'string'
    && /\bgzip\b/.test(acceptEncoding)
    && typeof contentType === 'string'
    && contentType.includes('application/json')
    && Number.isFinite(contentLength)
    && contentLength >= thresholdBytes;
}

export function registerTransportControls(app: FastifyInstance, options: TransportOptions) {
  app.addHook('onSend', async (request, reply, payload) => {
    if (typeof payload !== 'string') {
      return payload;
    }

    if (!shouldCompress(request, reply, options.responseCompressionThresholdBytes)) {
      return payload;
    }

    const compressed = gzipSync(payload);
    reply.header('content-encoding', 'gzip');
    reply.header('vary', 'Accept-Encoding');
    reply.header('content-length', String(compressed.byteLength));
    return compressed;
  });
}
