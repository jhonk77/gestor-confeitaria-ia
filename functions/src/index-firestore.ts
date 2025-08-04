/**
 * Firebase Cloud Functions v2: Agente Orquestrador para o Gestor de Confeitaria.
 * FASE 1: Migração para Firestore com isolamento de dados por usuário
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { google } from "googleapis";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { VertexAI } from "@google-cloud/vertexai";
import { Readable } from "stream";
import {
    createUserProfile,
    getUserProfile,
    updateLastLogin,
    createExpense,
    getExpenses,
    createOrder,
    getOrders,
    createRecipe,
    getRecipes,
    logUserAction,
    checkPlanLimits
} from "./database";

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
export const assistenteHttp = onCall({ region: 'southamerica-east1' }, async (request) => {
    // Garante que o utilizador está autenticado para a maioria das operações
    if (!request.auth && request.data.intent !== 'healthCheck') {
        throw new HttpsError('unauthenticated', 'A operação requer autenticação.');
    }

    const { intent, payload } = request.data;
    const uid = request.auth?.uid;
    let responsePayload = {};

    logger.info(`Recebida intenção: ${intent} para o utilizador: ${uid}`);

    try {
        // Atualizar último login se usuário autenticado
        if (uid && intent !== 'healthCheck') {
            await updateLastLogin(uid);
            await logUserAction(uid, intent, payload);
        }

        // --- AGENTE ORQUESTRADOR ---
        switch (intent) {
            case 'healthCheck':
                responsePayload = { success: true, message: 'O cérebro da IA está online e a operar!' };
                break;
            case 'setupDatabase':
                responsePayload = await agenteSetup.configurarUsuario(payload, uid!);
                break;
            case 'registrarDespesa':
                responsePayload = await agenteFinanceiro.registrarDespesa(payload, uid!);
                break;
            case 'listarDespesas':
                responsePayload = await agenteFinanceiro.listarDespesas(payload, uid!);
                break;
            case 'processarDocumento':
                responsePayload = await agenteDocumentos.analisarNotaFiscal(payload, uid!);
                break;
            case 'registrarPedido':
                responsePayload = await agenteCRM.registrarPedido(payload, uid!);
                break;
            case 'listarPedidos':
                responsePayload = await agenteCRM.listarPedidos(payload, uid!);
                break;
            case 'criarNovaReceita':
                responsePayload = await agenteInclusao.criarReceita(payload, uid!);
                break;
            case 'listarReceitas':
                responsePayload = await agenteInclusao.listarReceitas(payload, uid!);
                break;
            case 'gerarAnalise':
                responsePayload = await agenteAnalista.gerarAnalise(payload, uid!);
                break;
            default:
                responsePayload = { success: false, message: `Intenção '${intent}' não reconhecida.` };
                break;
        }
        return responsePayload;
    } catch (error: any) {
        logger.error(`Erro crítico no Agente Orquestrador para a intenção "${intent}":`, error);
        throw new HttpsError('internal', 'Ocorreu um erro inesperado no servidor.', { error: error.message });
    }
});

// --- AGENTES ESPECIALISTAS ATUALIZADOS PARA FIRESTORE ---

const agenteSetup = {
    configurarUsuario: async (payload: any, uid: string) => {
        try {
            // Verificar se usuário já existe
            let userProfile = await getUserProfile(uid);
            
            if (!userProfile) {
                // Criar perfil do usuário
                await createUserProfile({
                    uid,
                    email: payload.email || '',
                    displayName: payload.displayName || '',
                    photoURL: payload.photoURL || '',
                    plan: 'free'
                });
                userProfile = await getUserProfile(uid);
            }

            // Se ainda há arquivos para processar (compatibilidade com versão anterior)
            if (payload.financeiroFile && payload.operacoesFile) {
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

                const financeiroId = await uploadAndConvert(payload.financeiroFile, 'Controle_Financeiro_Anual');
                const operacoesId = await uploadAndConvert(payload.operacoesFile, 'Precificacao_e_Operacoes');

                // Atualizar perfil com IDs das planilhas (para compatibilidade)
                await admin.firestore().collection('users').doc(uid).update({
                    spreadsheetIds: { financeiro: financeiroId, operacoes: operacoesId }
                });
            }

            return { 
                success: true, 
                message: 'Usuário configurado com sucesso! Agora seus dados estão seguros e isolados.',
                userProfile 
            };
        } catch (error: any) {
            logger.error('Erro ao configurar usuário:', error);
            throw new HttpsError('internal', 'Erro ao configurar usuário', { error: error.message });
        }
    }
};

const agenteFinanceiro = {
    registrarDespesa: async (payload: any, uid: string) => {
        try {
            // Verificar limites do plano
            const canCreate = await checkPlanLimits(uid, 'create_expense');
            if (!canCreate) {
                throw new HttpsError('resource-exhausted', 'Limite de despesas atingido para seu plano atual.');
            }

            const { data, tipo, valor, fornecedor } = payload;
            
            const expenseId = await createExpense({
                userId: uid,
                date: data,
                type: tipo,
                value: parseFloat(valor),
                supplier: fornecedor
            });

            return { 
                success: true, 
                message: 'Despesa registrada com sucesso!',
                expenseId 
            };
        } catch (error: any) {
            logger.error('Erro ao registrar despesa:', error);
            throw error;
        }
    },

    listarDespesas: async (payload: any, uid: string) => {
        try {
            const { limit = 50 } = payload;
            const expenses = await getExpenses(uid, limit);
            
            return { 
                success: true, 
                message: 'Despesas recuperadas com sucesso!',
                expenses 
            };
        } catch (error: any) {
            logger.error('Erro ao listar despesas:', error);
            throw new HttpsError('internal', 'Erro ao recuperar despesas', { error: error.message });
        }
    }
};

const agenteDocumentos = {
    analisarNotaFiscal: async (payload: any, uid: string) => {
        try {
            const { file } = payload;
            const [result] = await visionClient.textDetection(Buffer.from(file, 'base64'));
            const fullText = result.textAnnotations?.[0]?.description || '';
            
            // Extrair informações relevantes
            const valorMatch = fullText.match(/TOTAL\s*R\$\s*([0-9,.]+)/i);
            const valorTotal = (valorMatch && valorMatch[1]) ? valorMatch[1] : "Não encontrado";
            
            const fornecedorMatch = fullText.match(/RAZÃO SOCIAL[:\s]*([^\n]+)/i);
            const fornecedor = (fornecedorMatch && fornecedorMatch[1]) ? fornecedorMatch[1].trim() : "Não encontrado";

            return { 
                success: true, 
                message: 'Documento analisado com sucesso!', 
                extractedData: { 
                    valor: valorTotal, 
                    fornecedor,
                    textoCompleto: fullText 
                } 
            };
        } catch (error: any) {
            logger.error('Erro ao analisar documento:', error);
            throw new HttpsError('internal', 'Erro ao analisar documento', { error: error.message });
        }
    }
};

const agenteCRM = {
    registrarPedido: async (payload: any, uid: string) => {
        try {
            // Verificar limites do plano
            const canCreate = await checkPlanLimits(uid, 'create_order');
            if (!canCreate) {
                throw new HttpsError('resource-exhausted', 'Limite de pedidos atingido para seu plano atual.');
            }

            const { cliente, produtos, dataEntrega, valor, status = 'pending' } = payload;
            
            const orderId = await createOrder({
                userId: uid,
                customer: cliente,
                products: produtos,
                deliveryDate: dataEntrega,
                value: parseFloat(valor),
                status
            });

            return { 
                success: true, 
                message: `Pedido para ${cliente} registrado com sucesso!`,
                orderId 
            };
        } catch (error: any) {
            logger.error('Erro ao registrar pedido:', error);
            throw error;
        }
    },

    listarPedidos: async (payload: any, uid: string) => {
        try {
            const { limit = 50 } = payload;
            const orders = await getOrders(uid, limit);
            
            return { 
                success: true, 
                message: 'Pedidos recuperados com sucesso!',
                orders 
            };
        } catch (error: any) {
            logger.error('Erro ao listar pedidos:', error);
            throw new HttpsError('internal', 'Erro ao recuperar pedidos', { error: error.message });
        }
    }
};

const agenteInclusao = {
    criarReceita: async (payload: any, uid: string) => {
        try {
            // Verificar limites do plano
            const canCreate = await checkPlanLimits(uid, 'create_recipe');
            if (!canCreate) {
                throw new HttpsError('resource-exhausted', 'Limite de receitas atingido para seu plano atual.');
            }

            const { recipeName, ingredients } = payload;
            
            const recipeId = await createRecipe({
                userId: uid,
                name: recipeName,
                ingredients
            });

            return { 
                success: true, 
                message: `Receita "${recipeName}" criada com sucesso!`,
                recipeId 
            };
        } catch (error: any) {
            logger.error('Erro ao criar receita:', error);
            throw error;
        }
    },

    listarReceitas: async (payload: any, uid: string) => {
        try {
            const recipes = await getRecipes(uid);
            
            return { 
                success: true, 
                message: 'Receitas recuperadas com sucesso!',
                recipes 
            };
        } catch (error: any) {
            logger.error('Erro ao listar receitas:', error);
            throw new HttpsError('internal', 'Erro ao recuperar receitas', { error: error.message });
        }
    }
};

const agenteAnalista = {
    gerarAnalise: async (payload: any, uid: string) => {
        try {
            const { query } = payload;
            
            // Buscar dados do usuário para análise
            const expenses = await getExpenses(uid, 100);
            const orders = await getOrders(uid, 100);
            
            // Preparar dados para análise
            const totalExpenses = expenses.reduce((sum, exp) => sum + exp.value, 0);
            const totalRevenue = orders.reduce((sum, order) => sum + order.value, 0);
            const profit = totalRevenue - totalExpenses;
            
            const analysisData = `
Dados Financeiros do Usuário:
- Total de Despesas: R$ ${totalExpenses.toFixed(2)}
- Total de Receitas: R$ ${totalRevenue.toFixed(2)}
- Lucro: R$ ${profit.toFixed(2)}
- Número de Despesas: ${expenses.length}
- Número de Pedidos: ${orders.length}
            `;
            
            const prompt = `Você é um analista financeiro especialista em confeitaria. Com base nos seguintes dados do usuário, responda à pergunta de forma clara e objetiva, oferecendo insights práticos e acionáveis.

${analysisData}

Pergunta do usuário: "${query}"

Forneça uma análise detalhada e sugestões práticas para melhorar o negócio.`;
            
            const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.0-pro' });
            const result = await generativeModel.generateContent(prompt);
            const analysisText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || 'Análise não disponível';
            
            return { 
                success: true, 
                message: 'Análise concluída com sucesso!', 
                analysis: analysisText,
                summary: {
                    totalExpenses,
                    totalRevenue,
                    profit,
                    expenseCount: expenses.length,
                    orderCount: orders.length
                }
            };
        } catch (error: any) {
            logger.error('Erro ao gerar análise:', error);
            throw new HttpsError('internal', 'Erro ao gerar análise', { error: error.message });
        }
    }
};
