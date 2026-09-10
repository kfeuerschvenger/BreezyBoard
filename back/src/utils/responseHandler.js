// `meta` is optional and merged as sibling keys alongside `data`, e.g.
// `{ pagination: { total, limit, offset } }`. Existing two-argument callers
// are unaffected: the envelope's `success` and `data` fields are unchanged.
const responseHandler = (res, statusCode, data, meta) => {
  res.status(statusCode).json({
    success: true,
    data,
    ...(meta && meta),
  });
};

export default responseHandler;
