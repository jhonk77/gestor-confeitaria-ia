import { onRequest } from "firebase-functions/https";
import * as logger from "firebase-functions/logger";

export const assistenteHttp = onRequest((req, res) => {
  logger.info("Recebi uma requisição:", req.body);
  res.send("Olá da função assistenteHttp!");
});
