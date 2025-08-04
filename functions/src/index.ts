/**
 * Firebase Cloud Functions: Agente Orquestrador para o Gestor de Confeitaria.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { google } from "googleapis";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { VertexAI } from "@google-cloud/vertexai";
import { Readable } from "stream";

admin.initializeApp();

// --- INICIALIZAÇÃO SEGURA DOS CLIENTES DAS APIS ---
const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
});
const visionClient = new ImageAnnotatorClient();
const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: 'us-central1' });
const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

// --- PONTO DE ENTRADA PRINCIPAL (HANDLER DA FUNÇÃO) ---
exports.assistenteHttp = functions.region('southamerica-east1').https.onCall(async (data, context) => {
    // Garante que o utilizador está autenticado para a maioria das operações
    if (!context.auth && data.intent !== 'healthCheck' && data.intent !== 'setupDatabase') {
        throw new functions.https.HttpsError('unauthenticated', 'A operação requer autenticação.');
    }

    const { intent, payload, spreadsheetIds } = data;
    const uid = context.auth?.uid;
    let responsePayload = {};

    console.log(`Recebida intenção: ${intent} para o utilizador: ${uid}`);

    try {
        // --- AGENTE ORQUESTRADOR ---
        switch (intent) {
            case 'healthCheck':
                responsePayload = { success: true, message: 'O cérebro da IA está online e a operar!' };
                break;
            case 'setupDatabase':
                responsePayload = await agenteSetup.configurarPlanilhas(payload, uid);
                break;
            case 'registrarDespesa':
                responsePayload = await agenteFinanceiro.registrarDespesa({ ...payload, spreadsheetId: spreadsheetIds.financeiro });
                break;
            case 'processarDocumento':
                responsePayload = await agenteDocumentos.analisarNotaFiscal(payload);
                break;
            case 'registrarProducao':
                responsePayload = await agenteProducao.registrar({ ...payload, spreadsheetId: spreadsheetIds.operacoes });
                break;
            case 'criarNovaReceita':
                responsePayload = await agenteInclusao.criarReceita({ ...payload, spreadsheetId: spreadsheetIds.operacoes });
                break;
            case 'registrarPedido':
                responsePayload = await agenteCRM.registrarPedido({ ...payload, spreadsheetId: spreadsheetIds.financeiro });
                break;
            case 'gerarAnalise':
                responsePayload = await agenteAnalista.gerarAnalise({ ...payload, spreadsheetId: spreadsheetIds.financeiro });
                break;
            default:
                responsePayload = { success: false, message: `Intenção '${intent}' não reconhecida.` };
                break;
        }
        return responsePayload;
    } catch (error: any) {
        console.error(`Erro crítico no Agente Orquestrador para a intenção "${intent}":`, error);
        throw new functions.https.HttpsError('internal', 'Ocorreu um erro inesperado no servidor.', { error: error.message });
    }
});


// --- FUNÇÕES AUXILIARES ---
const getMesAtual = () => new Date().toLocaleString('pt-BR', { month: 'long' }).toLowerCase();

async function getProximaLinhaVazia(spreadsheetId: string, range: string): Promise<number> {
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        return (response.data.values ? response.data.values.length : 0) + 1;
    } catch (error: any) {
        if (error.code === 400 && error.message.includes('Unable to parse range')) {
            console.warn(`Aba para o range "${range}" não encontrada. Assumindo linha 1.`);
            return 1;
        }
        throw error;
    }
}

// --- AGENTES ESPECIALISTAS ---

const agenteSetup = {
    configurarPlanilhas: async (payload: any, uid?: string) => {
        if (!uid) {
            throw new functions.https.HttpsError('unauthenticated', 'A operação requer autenticação.');
        }
        const { financeiroFile, operacoesFile } = payload;

        const folderResponse = await drive.files.create({
            requestBody: { name: `Base de Dados - ${uid}`, mimeType: 'application/vnd.google-apps.folder' },
            fields: 'id',
        });
        const folderId = folderResponse.data.id!;

        const uploadAndConvert = async (fileData: string, fileName: string) => {
            const buffer = Buffer.from(fileData, 'base64');
            const fileMetadata = { name: fileName, parents: [folderId], mimeType: 'application/vnd.google-apps.spreadsheet' };
            const media = { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: Readable.from(buffer) };
            const response = await drive.files.create({ requestBody: fileMetadata, media, fields: 'id' });
            return response.data.id!;
        };

        const financeiroId = await uploadAndConvert(financeiroFile, 'Controle_Financeiro_Anual');
        const operacoesId = await uploadAndConvert(operacoesFile, 'Precificacao_e_Operacoes');

        // Adiciona abas faltantes
        const spreadsheetFinanceiro = await sheets.spreadsheets.get({ spreadsheetId: financeiroId });
        const abasExistentesFinanceiro = spreadsheetFinanceiro.data.sheets?.map(s => s.properties?.title) || [];
        const requestsFinanceiro = ['CLIENTES', 'PEDIDOS_AGENDA'].filter(aba => !abasExistentesFinanceiro.includes(aba)).map(aba => ({ addSheet: { properties: { title: aba } } }));
        if (requestsFinanceiro.length > 0) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId: financeiroId, requestBody: { requests: requestsFinanceiro } });
        }

        const spreadsheetOperacoes = await sheets.spreadsheets.get({ spreadsheetId: operacoesId });
        const abasExistentesOperacoes = spreadsheetOperacoes.data.sheets?.map(s => s.properties?.title) || [];
        const requestsOperacoes = ['ESTOQUE'].filter(aba => !abasExistentesOperacoes.includes(aba)).map(aba => ({ addSheet: { properties: { title: aba } } }));
        if (requestsOperacoes.length > 0) {
            await sheets.spreadsheets.batchUpdate({ spreadsheetId: operacoesId, requestBody: { requests: requestsOperacoes } });
        }

        return { success: true, message: 'Base de dados configurada!', spreadsheetIds: { financeiro: financeiroId, operacoes: operacoesId } };
    }
};

const agenteFinanceiro = {
    registrarDespesa: async ({ spreadsheetId, data, tipo, valor, fornecedor }: any) => {
        const mes = getMesAtual();
        const linha = await getProximaLinhaVazia(spreadsheetId, `${mes}!T:T`);
        const range = `${mes}!T${linha}:W${linha}`;
        await sheets.spreadsheets.values.update({ spreadsheetId, range, valueInputOption: 'USER_ENTERED', requestBody: { values: [[data, tipo, valor, fornecedor]] } });
        return { success: true, message: 'Despesa registada!' };
    }
};

const agenteDocumentos = {
    analisarNotaFiscal: async ({ file }: any) => {
        const [result] = await visionClient.textDetection(Buffer.from(file, 'base64'));
        const fullText = result.textAnnotations?.[0]?.description || '';
        const valorMatch = fullText.match(/TOTAL\s*R\$\s*([0-9,.]+)/i);
        const valorTotal = (valorMatch && valorMatch[1]) ? valorMatch[1] : "Não encontrado";
        return { success: true, message: 'Documento analisado.', extractedData: { valor: valorTotal, textoCompleto: fullText } };
    }
};

const agenteCRM = {
    registrarPedido: async ({ spreadsheetId, cliente, produtos, dataEntrega, valor, status }: any) => {
        const linha = await getProximaLinhaVazia(spreadsheetId, 'PEDIDOS_AGENDA!A:A');
        const range = `PEDIDOS_AGENDA!A${linha}:F${linha}`;
        const hoje = new Date().toLocaleDateString('pt-BR');
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[`PEDIDO-${linha}`, cliente, produtos, hoje, dataEntrega, status]] },
        });
        return { success: true, message: `Pedido para ${cliente} registado.` };
    }
};

const agenteInclusao = {
    criarReceita: async ({ spreadsheetId, recipeName, ingredients }: any) => {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: recipeName } } }] } });
        const header = [["INSUMO", "QUANTIDADE", "UNIDADE"]];
        const rows = ingredients.map((ing: any) => [ing.name, ing.quantity, ing.unit]);
        await sheets.spreadsheets.values.update({ spreadsheetId, range: `${recipeName}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: header.concat(rows) } });
        return { success: true, message: `Receita "${recipeName}" criada!` };
    }
};

const agenteProducao = {
    registrar: async ({ spreadsheetId, productName, quantity }: any) => {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${productName}!A:C` });
        if (!res.data.values) throw new Error(`Receita para "${productName}" não encontrada.`);
        const insumos = res.data.values.slice(1);
        for (const insumo of insumos) {
            const [nome, qtd] = insumo;
            await agenteEstoque.darBaixa({ spreadsheetId, item: nome, quantidade: parseFloat(qtd) * quantity });
        }
        return { success: true, message: `Produção registada e estoque atualizado.` };
    }
};

const agenteEstoque = {
    darBaixa: async ({ spreadsheetId, item, quantidade }: any) => {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'ESTOQUE!A:C' });
        const estoque = res.data.values;
        if (!estoque) throw new Error("Aba de estoque não encontrada ou vazia.");
        const itemIndex = estoque.findIndex(row => row[0] && row[0].toLowerCase() === item.toLowerCase());
        if (itemIndex > -1) {
            const estoqueAtual = parseFloat(String(estoque[itemIndex][2]).replace(',', '.')) || 0;
            const novoEstoque = estoqueAtual - quantidade;
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `ESTOQUE!C${itemIndex + 1}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[novoEstoque]] },
            });
        } else {
            console.warn(`Insumo "${item}" não encontrado no estoque para dar baixa.`);
        }
    }
};

const agenteAnalista = {
    gerarAnalise: async ({ spreadsheetId, query }: any) => {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `painel!B:K` });
        if(!res.data.values) throw new Error("Não foram encontrados dados na aba 'painel' para análise.");
        
        const dadosPainel = res.data.values.slice(1, 13).map(row => row.join(', ')).join('\n');
        const prompt = `Você é um analista financeiro especialista em confeitaria. Com base nos seguintes dados (Mês, Vendas, Compras, Resultado), responda à pergunta do usuário de forma clara e objetiva, oferecendo um insight prático.\n\nDados do Painel Anual:\n${dadosPainel}\n\nPergunta do usuário: "${query}"`;
        
        const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.0-pro' });
        const result = await generativeModel.generateContent(prompt);
        const analysisText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || 'Análise não disponível';
        
        return { success: true, message: 'Análise concluída.', analysis: analysisText };
    }
};
