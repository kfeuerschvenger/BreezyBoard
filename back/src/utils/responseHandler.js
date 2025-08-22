const responseHandler = (res, statusCode, data) => {
  res.status(statusCode).json({
    success: true,
    data,
  });
};

export default responseHandler;
