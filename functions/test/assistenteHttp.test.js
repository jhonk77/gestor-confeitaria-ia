const functions = require('../index');

describe('assistenteHttp', () => {
  it('deve responder ao healthCheck com sucesso', async () => {
    const data = { intent: 'healthCheck', payload: {} };
    const context = {};
    const response = await functions.assistenteHttp(data, context);
    expect(response.success).toBe(true);
    expect(response.message).toMatch(/online/);
  });

  it('deve retornar erro para intenção desconhecida', async () => {
    const data = { intent: 'intencaoInvalida', payload: {} };
    const context = {};
    const response = await functions.assistenteHttp(data, context);
    expect(response.success).toBe(false);
    expect(response.message).toMatch(/não reconhecida/);
  });
});
