const useFirestore = process.env.USE_FIRESTORE === "true" || Boolean(process.env.FUNCTION_TARGET);

module.exports = useFirestore
  ? require("./prismaFirestore")
  : require("./prismaSqlite");
