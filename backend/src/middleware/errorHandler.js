module.exports = (err, req, res, next) => {
  const status = Number(err.statusCode || err.status || 500);
  console.error(`[${req.method} ${req.originalUrl}]`, err.message);
  res.status(status).json({
    success: false,
    message: status >= 500 ? "حدث خطأ في الخادم. حاول مرة أخرى." : (err.publicMessage || "الطلب غير مسموح.")
  });
};
