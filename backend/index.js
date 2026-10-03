require("dotenv").config();

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const app = require("./src/app");

const jwtSecret = defineSecret("JWT_SECRET");

exports.api = onRequest({
  region: "europe-west1",
  maxInstances: 10,
  timeoutSeconds: 60,
  secrets: [jwtSecret]
}, app);
