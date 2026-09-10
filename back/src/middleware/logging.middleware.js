import { randomUUID } from 'crypto';
import pinoHttp from 'pino-http';
import logger from '../utils/logger.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Every request gets an id: an inbound X-Request-Id is honoured when
 * present, otherwise one is generated here. pino-http has no built-in way to
 * echo it back on the response, but genReqId is handed the response object
 * too, so it is set here before pino-http binds the id to req.log for every
 * log line written during this request.
 */
const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const inbound = req.headers['x-request-id'];
    const id = typeof inbound === 'string' && inbound.trim() !== '' ? inbound : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});

export default httpLogger;
