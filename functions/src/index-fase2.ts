/**
 * Firebase Cloud Functions v2: FASE 2 - ESCALABILIDADE
 * Sistema otimizado com cache, monitoramento e backup automático
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { google } from "googleapis";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { VertexAI } from "@google-cloud/vertexai";
import { Readable } from "stream";

// Importar módulos da FASE 2
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

import { CacheManager } from "./modules/cache";
import { MetricsCollector, MonitorPerformance } from "./modules/monitoring";

// Importar funções dos módulos
export {
    getUserProfileOptimized,
    setupUserProfile,
    updateUserPlan,
    getUserStats,
    clearUserCache
} from "./modules/users";

export {
    getSystemMetrics,
    getUserMetrics,
    cleanupOldMetrics,
    checkSystemHealth
} from "./modules/monitoring";

export {
    dailyBackup,
    createBackup,
    listBackups,
    deleteBackup,
    getBackupStats,
    verifyBackupIntegrity,
    simulateRestore
} from "./modules/backup";

// Inicializar Firebase Admin se não foi inicializado
if (!admin.apps.length) {
    admin.initializeApp();
}

// --- INICIALIZAÇÃO SEGURA DOS CLIENTES DAS APIS ---
const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
});
const visionClient = new ImageAnnotatorClient();
const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: 'us-central1' });
const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

// --- PONTO DE ENTRADA PRINCIPAL OTIMIZADO ---
export const assistenteHttp = onCall({ region: 'southamerica-east1' }, async (request) => {
    const startTime = Date.now();
    
    // Garante que o utilizador está autenticado para a maioria das operações
    if (!request.auth && request.data.intent !== 'healthCheck') {
        throw new HttpsError('unauthenticated', 'A operação requer autenticação.');
    }

    const { intent, payload } = request.data;
    const uid = request.auth?.uid;
    let responsePayload = {};
    let success = true;

    logger.info(`[FASE 2] Recebida intenção: ${intent} para o utilizador: ${uid}`);

    try {
        // Atualizar último login se usuário autenticado
        if (uid && intent !== 'healthCheck') {
            await updateLastLogin(uid);
        }

        // --- AGENTE ORQUESTRADOR OTIMIZADO ---
        switch (intent) {
            case 'healthCheck':
                responsePayload = await agenteHealthCheck.verificar();
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
            case 'getCacheStats':
                responsePayload = await agenteSistema.getCacheStats();
                break;
            case 'invalidateCache':
                responsePayload = await agenteSistema.invalidateUserCache(uid!);
                break;
            default:
                responsePayload = { success: false, message: `Intenção '${intent}' não reconhecida.` };
                success = false;
                break;
        }

        return responsePayload;
    } catch (error: any) {
        success = false;
        logger.error(`[FASE 2] Erro crítico no Agente Orquestrador para a intenção "${intent}":`, error);
        throw new HttpsError('internal', 'Ocorreu um erro inesperado no servidor.', { error: error.message });
    } finally {
        // Registrar métricas de performance
        const duration = Date.now() - startTime;
        if (uid) {
            await MetricsCollector.recordUserAction(uid, intent, success, duration, payload);
        }
        await MetricsCollector.recordPerformance('assistenteHttp', duration, success, uid);
    }
});

// --- AGENTES ESPECIALISTAS OTIMIZADOS COM CACHE ---

const agenteHealthCheck = {
    @MonitorPerformance('healthCheck')
    async verificar() {
        const cacheStats = CacheManager.getCacheStats();
        return { 
            success: true, 
            message: 'FASE 2: Sistema otimizado online!',
            version: '2.0.0',
            features: ['cache', 'monitoring', 'backup'],
            cache: cacheStats,
            timestamp: new Date().toISOString()
        };
    }
};

const agenteSetup = {
    @MonitorPerformance('setupUser')
    async configurarUsuario(payload: any, uid: string) {
        try {
            // Verificar cache primeiro
            let userProfile = await CacheManager.getUserProfile(uid);
            
            if (!userProfile) {
                userProfile = await getUserProfile(uid);
                if (userProfile) {
                    await CacheManager.setUserProfile(uid, userProfile);
                }
            }

            if (!userProfile) {
                // Criar perfil do usuário
                await createUserProfile({
                    uid,
                    email: payload.email || '',
                    displayName: payload.displayName || '',
                    photoURL: payload.photoURL || '',
                    plan: 'free',
                    preferences: {
                        language: 'pt-BR',
                        timezone: 'America/Sao_Paulo',
                        notifications: true
                    }
                });
                
                userProfile = await getUserProfile(uid);
                if (userProfile) {
                    await CacheManager.setUserProfile(uid, userProfile);
                }
            }

            return { 
                success: true, 
                message: 'FASE 2: Usuário configurado com cache otimizado!',
                userProfile,
                cached: false
            };
        } catch (error: any) {
            logger.error('Erro ao configurar usuário:', error);
            throw new HttpsError('internal', 'Erro ao configurar usuário', { error: error.message });
        }
    }
};

const agenteFinanceiro = {
    @MonitorPerformance('registrarDespesa')
    async registrarDespesa(payload: any, uid: string) {
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

            // Invalidar cache de despesas
            await CacheManager.deleteExpenses(uid);

            return { 
                success: true, 
                message: 'Despesa registrada com cache invalidado!',
                expenseId 
            };
        } catch (error: any) {
            logger.error('Erro ao registrar despesa:', error);
            throw error;
        }
    },

    @MonitorPerformance('listarDespesas')
    async listarDespesas(payload: any, uid: string) {
        try {
            const { limit = 50 } = payload;
            
            // Tentar buscar do cache primeiro
            let expenses = await CacheManager.getExpenses(uid);
            
            if (!expenses) {
                expenses = await getExpenses(uid, limit);
                if (expenses.length > 0) {
                    await CacheManager.setExpenses(uid, expenses, 180); // 3 minutos
                }
            }
            
            return { 
                success: true, 
                message: 'Despesas recuperadas com cache!',
                expenses,
                cached: expenses ? true : false
            };
        } catch (error: any) {
            logger.error('Erro ao listar despesas:', error);
            throw new HttpsError('internal', 'Erro ao recuperar despesas', { error: error.message });
        }
    }
};

const agenteDocumentos = {
    @MonitorPerformance('analisarDocumento')
    async analisarNotaFiscal(payload: any, uid: string) {
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
                message: 'Documento analisado com IA otimizada!', 
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
    @MonitorPerformance('registrarPedido')
    async registrarPedido(payload: any, uid: string) {
        try {
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

            // Invalidar cache de pedidos
            await CacheManager.deleteOrders(uid);

            return { 
                success: true, 
                message: `Pedido para ${cliente} registrado com cache otimizado!`,
                orderId 
            };
        } catch (error: any) {
            logger.error('Erro ao registrar pedido:', error);
            throw error;
        }
    },

    @MonitorPerformance('listarPedidos')
    async listarPedidos(payload: any, uid: string) {
        try {
            const { limit = 50 } = payload;
            
            // Tentar buscar do cache primeiro
            let orders = await CacheManager.getOrders(uid);
            
            if (!orders) {
                orders = await getOrders(uid, limit);
                if (orders.length > 0) {
                    await CacheManager.setOrders(uid, orders, 180);
                }
            }
            
            return { 
                success: true, 
                message: 'Pedidos recuperados com cache!',
                orders,
                cached: orders ? true : false
            };
        } catch (error: any) {
            logger.error('Erro ao listar pedidos:', error);
            throw new HttpsError('internal', 'Erro ao recuperar pedidos', { error: error.message });
        }
    }
};

const agenteInclusao = {
    @MonitorPerformance('criarReceita')
    async criarReceita(payload: any, uid: string) {
        try {
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

            // Invalidar cache de receitas
            await CacheManager.deleteRecipes(uid);

            return { 
                success: true, 
                message: `Receita "${recipeName}" criada com cache otimizado!`,
                recipeId 
            };
        } catch (error: any) {
            logger.error('Erro ao criar receita:', error);
            throw error;
        }
    },

    @MonitorPerformance('listarReceitas')
    async listarReceitas(payload: any, uid: string) {
        try {
            // Tentar buscar do cache primeiro
            let recipes = await CacheManager.getRecipes(uid);
            
            if (!recipes) {
                recipes = await getRecipes(uid);
                if (recipes.length > 0) {
                    await CacheManager.setRecipes(uid, recipes, 600); // 10 minutos
                }
            }
            
            return { 
                success: true, 
                message: 'Receitas recuperadas com cache!',
                recipes,
                cached: recipes ? true : false
            };
        } catch (error: any) {
            logger.error('Erro ao listar receitas:', error);
            throw new HttpsError('internal', 'Erro ao recuperar receitas', { error: error.message });
        }
    }
};

const agenteAnalista = {
    @MonitorPerformance('gerarAnalise')
    async gerarAnalise(payload: any, uid: string) {
        try {
            const { query } = payload;
            
            // Verificar cache de análise primeiro
            let cachedAnalysis = await CacheManager.getAnalysis(uid, query);
            if (cachedAnalysis) {
                return {
                    success: true,
                    message: 'Análise recuperada do cache!',
                    ...cachedAnalysis,
                    cached: true
                };
            }
            
            // Buscar dados do usuário para análise (com cache)
            const [expenses, orders] = await Promise.all([
                CacheManager.getExpenses(uid) || getExpenses(uid, 100),
                CacheManager.getOrders(uid) || getOrders(uid, 100)
            ]);
            
            // Preparar dados para análise
            const totalExpenses = expenses.reduce((sum: number, exp: any) => sum + exp.value, 0);
            const totalRevenue = orders.reduce((sum: number, order: any) => sum + order.value, 0);
            const profit = totalRevenue - totalExpenses;
            
            const analysisData = `
Dados Financeiros do Usuário (FASE 2 - Otimizado):
- Total de Despesas: R$ ${totalExpenses.toFixed(2)}
- Total de Receitas: R$ ${totalRevenue.toFixed(2)}
- Lucro: R$ ${profit.toFixed(2)}
- Número de Despesas: ${expenses.length}
- Número de Pedidos: ${orders.length}
            `;
            
            const prompt = `Você é um analista financeiro especialista em confeitaria com sistema otimizado. Com base nos seguintes dados do usuário, responda à pergunta de forma clara e objetiva, oferecendo insights práticos e acionáveis.

${analysisData}

Pergunta do usuário: "${query}"

Forneça uma análise detalhada e sugestões práticas para melhorar o negócio.`;
            
            const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.0-pro' });
            const result = await generativeModel.generateContent(prompt);
            const analysisText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || 'Análise não disponível';
            
            const analysisResult = {
                analysis: analysisText,
                summary: {
                    totalExpenses,
                    totalRevenue,
                    profit,
                    expenseCount: expenses.length,
                    orderCount: orders.length
                }
            };

            // Salvar no cache
            await CacheManager.setAnalysis(uid, query, analysisResult, 3600); // 1 hora
            
            return { 
                success: true, 
                message: 'Análise gerada com IA otimizada e cache!', 
                ...analysisResult,
                cached: false
            };
        } catch (error: any) {
            logger.error('Erro ao gerar análise:', error);
            throw new HttpsError('internal', 'Erro ao gerar análise', { error: error.message });
        }
    }
};

const agenteSistema = {
    @MonitorPerformance('getCacheStats')
    async getCacheStats() {
        const stats = CacheManager.getCacheStats();
        return {
            success: true,
            message: 'Estatísticas do cache obtidas',
            stats
        };
    },

    @MonitorPerformance('invalidateUserCache')
    async invalidateUserCache(uid: string) {
        await CacheManager.invalidateUserCache(uid);
        return {
            success: true,
            message: 'Cache do usuário invalidado com sucesso'
        };
    }
};
