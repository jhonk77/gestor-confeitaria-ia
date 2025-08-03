import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

export const assistenteHttp = onCall((request) => {
  // 'request.data' contém os dados enviados pelo cliente.
  // 'request.auth' contém informações de autenticação do usuário (se logado).
  logger.info("Função callable foi acionada!", {
    data: request.data,
    auth: request.auth,
  });

  // Em vez de res.send(), você simplesmente retorna um objeto.
  // O SDK do Firebase cuida de enviá-lo de volta ao cliente.
  return {
    status: "success",
    message: "Olá da função callable!",
    receivedData: request.data
  };
});